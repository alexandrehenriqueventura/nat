// Package agent implementa o núcleo do agente:
// – Conexão WebSocket com reconexão automática (backoff exponencial)
// – Envio do payload de registro (agent.register)
// – Loop de heartbeat em goroutine dedicada
// – Loop de leitura de comandos e despacho para o Executor
package agent

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/google/uuid"

	"github.com/nat/agent/internal/executor"
	"github.com/nat/agent/internal/sysinfo"
	"github.com/nat/agent/internal/types"
)

// Config contém todos os parâmetros do agente lidos do config.json.
type Config struct {
	ServerURL        string          `json:"server_url"`
	AuthToken        string          `json:"auth_token"`
	HostnameOverride string          `json:"hostname_override"`
	Alias            string          `json:"alias"`
	LogLevel         string          `json:"log_level"`
	Reconnect        ReconnectConfig `json:"reconnect"`
}

// ReconnectConfig configura a política de reconexão.
type ReconnectConfig struct {
	InitialDelayS int `json:"initial_delay_s"`
	MaxDelayS     int `json:"max_delay_s"`
	MaxAttempts   int `json:"max_attempts"` // 0 = infinito
}

// ─────────────────────────────────────────────
// AGENTE PRINCIPAL
// ─────────────────────────────────────────────

// Agent é a estrutura central que gerencia toda a vida da conexão.
type Agent struct {
	cfg      Config
	hostname string
	logger   *slog.Logger

	// mu protege o acesso concorrente à conexão WebSocket.
	mu   sync.Mutex
	conn *websocket.Conn

	// heartbeatInterval é atualizado pelo server no register.ack.
	heartbeatInterval time.Duration

	// stopCh é fechado quando o agente deve encerrar.
	stopCh chan struct{}
}

// New cria um novo Agent com a configuração fornecida.
func New(cfg Config, logger *slog.Logger) *Agent {
	return &Agent{
		cfg:               cfg,
		hostname:          sysinfo.GetHostname(cfg.HostnameOverride),
		logger:            logger,
		heartbeatInterval: 10 * time.Second, // padrão até o servidor dizer diferente
		stopCh:            make(chan struct{}),
	}
}

// Run inicia o agente. Bloqueia até que stopCh seja fechado.
// Em caso de desconexão, reconecta automaticamente com backoff exponencial.
func (a *Agent) Run() {
	a.logger.Info("agente iniciando", "hostname", a.hostname)

	attempt := 0
	for {
		select {
		case <-a.stopCh:
			a.logger.Info("agente encerrando")
			return
		default:
		}

		attempt++
		a.logger.Info("conectando ao servidor", "url", a.cfg.ServerURL, "tentativa", attempt)

		conn, err := a.connect()
		if err != nil {
			delay := a.backoffDelay(attempt)
			a.logger.Warn("falha na conexão, aguardando para tentar novamente",
				"err", err, "delay", delay)
			time.Sleep(delay)
			continue
		}

		// Conexão estabelecida — salva a conexão e inicia os loops
		a.mu.Lock()
		a.conn = conn
		a.mu.Unlock()

		attempt = 0 // reseta contador após conexão bem-sucedida

		// Registra o agente junto ao servidor
		if err := a.register(); err != nil {
			a.logger.Error("falha no registro", "err", err)
			conn.Close()
			continue
		}

		// Inicia o loop de heartbeat em background
		heartbeatStop := make(chan struct{})
		go a.heartbeatLoop(heartbeatStop)

		// Bloqueia no loop de leitura até a conexão cair
		a.readLoop()

		// Conexão encerrada — para o heartbeat e reconecta
		close(heartbeatStop)
		conn.Close()

		a.logger.Warn("conexão perdida, reconectando...")
		time.Sleep(a.backoffDelay(1))
	}
}

// Stop encerra o agente de forma graciosa.
func (a *Agent) Stop() {
	close(a.stopCh)
	a.mu.Lock()
	if a.conn != nil {
		a.conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(1001, "agente encerrando"))
		a.conn.Close()
	}
	a.mu.Unlock()
}

// ─────────────────────────────────────────────
// CONEXÃO
// ─────────────────────────────────────────────

// connect estabelece a conexão WebSocket com o servidor,
// adicionando o token de autenticação na query string.
func (a *Agent) connect() (*websocket.Conn, error) {
	u, err := url.Parse(a.cfg.ServerURL)
	if err != nil {
		return nil, fmt.Errorf("URL inválida: %w", err)
	}

	q := u.Query()
	q.Set("token", a.cfg.AuthToken)
	u.RawQuery = q.Encode()

	header := http.Header{}
	header.Set("User-Agent", fmt.Sprintf("NAT-Agent/%s", sysinfo.AgentVersion))

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	conn, resp, err := dialer.Dial(u.String(), header)
	if err != nil {
		if resp != nil {
			return nil, fmt.Errorf("handshake falhou (HTTP %d): %w", resp.StatusCode, err)
		}
		return nil, fmt.Errorf("falha ao discar: %w", err)
	}

	a.logger.Info("WebSocket conectado", "remote", conn.RemoteAddr())
	return conn, nil
}

// ─────────────────────────────────────────────
// REGISTRO
// ─────────────────────────────────────────────

// register envia o payload agent.register e aguarda o ack do servidor.
func (a *Agent) register() error {
	payload := types.RegisterPayload{
		Hostname:   a.hostname,
		Alias:      a.cfg.Alias,
		OS:         sysinfo.GetOS(),
		Arch:       "amd64",
		AgentVer:   sysinfo.AgentVersion,
		MACAddress: sysinfo.GetMACAddress(),
		Interfaces: sysinfo.GetInterfaces(),
	}

	msg := types.Message{
		MsgID:   uuid.NewString(),
		Type:    types.TypeAgentRegister,
		Ts:      time.Now().UTC(),
		Payload: payload,
	}

	if err := a.Send(msg); err != nil {
		return fmt.Errorf("falha ao enviar register: %w", err)
	}

	a.logger.Info("agent.register enviado, aguardando ack...")

	// Aguarda o register.ack com timeout de 10 segundos
	a.conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	defer a.conn.SetReadDeadline(time.Time{}) // remove deadline após o ack

	_, data, err := a.conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("falha ao ler register.ack: %w", err)
	}

	var ack types.Message
	if err := json.Unmarshal(data, &ack); err != nil {
		return fmt.Errorf("ack inválido: %w", err)
	}

	if ack.Type != types.TypeAgentRegisterAck {
		return fmt.Errorf("esperado register.ack, recebido: %s", ack.Type)
	}

	// Extrai o intervalo de heartbeat configurado pelo servidor
	if raw, ok := ack.Payload.(map[string]interface{}); ok {
		if interval, ok := raw["heartbeat_interval_s"].(float64); ok && interval > 0 {
			a.heartbeatInterval = time.Duration(interval) * time.Second
		}
	}

	a.logger.Info("registro aceito pelo servidor",
		"heartbeat_interval", a.heartbeatInterval)
	return nil
}

// ─────────────────────────────────────────────
// HEARTBEAT
// ─────────────────────────────────────────────

// heartbeatLoop envia heartbeats periodicamente até stopCh ser fechado.
func (a *Agent) heartbeatLoop(stop <-chan struct{}) {
	ticker := time.NewTicker(a.heartbeatInterval)
	defer ticker.Stop()

	a.logger.Info("heartbeat iniciado", "interval", a.heartbeatInterval)

	for {
		select {
		case <-stop:
			a.logger.Info("heartbeat encerrado")
			return
		case <-ticker.C:
			if err := a.sendHeartbeat(); err != nil {
				a.logger.Warn("falha ao enviar heartbeat", "err", err)
				// Não fecha a conexão aqui — deixa o readLoop detectar a falha
			}
		}
	}
}

// sendHeartbeat coleta métricas e envia o payload agent.heartbeat.
func (a *Agent) sendHeartbeat() error {
	cpu, ramUsed, ramTotal, diskFree, uptime := sysinfo.GetHeartbeatMetrics()
	ifaces := sysinfo.GetInterfaces()

	// Converte interfaces para o formato resumido do heartbeat
	hbIfaces := make([]types.HeartbeatInterface, 0, len(ifaces))
	for _, iface := range ifaces {
		hbIfaces = append(hbIfaces, types.HeartbeatInterface{
			Name:   iface.Name,
			IP:     iface.IP,
			IsDHCP: iface.IsDHCP,
		})
	}

	msg := types.Message{
		MsgID: uuid.NewString(),
		Type:  types.TypeAgentHeartbeat,
		Ts:    time.Now().UTC(),
		Payload: types.HeartbeatPayload{
			Hostname:   a.hostname,
			UptimeS:    uptime,
			CPUPct:     cpu,
			RAMUsedMB:  ramUsed,
			RAMTotalMB: ramTotal,
			DiskFreeGB: diskFree,
			Interfaces: hbIfaces,
		},
	}

	a.logger.Debug("enviando heartbeat",
		"cpu", fmt.Sprintf("%.1f%%", cpu),
		"ram", fmt.Sprintf("%d/%d MB", ramUsed, ramTotal))

	return a.Send(msg)
}

// ─────────────────────────────────────────────
// LOOP DE LEITURA DE COMANDOS
// ─────────────────────────────────────────────

// readLoop lê mensagens do servidor em loop até a conexão ser encerrada.
// Despacha cada comando recebido para o Executor em uma goroutine separada.
func (a *Agent) readLoop() {
	exec := executor.New(a.hostname, a, a.logger)

	a.logger.Info("aguardando comandos do servidor...")

	for {
		_, data, err := a.conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				a.logger.Info("conexão encerrada pelo servidor")
			} else {
				a.logger.Warn("erro na leitura do WebSocket", "err", err)
			}
			return
		}

		var raw types.RawMessage
		if err := json.Unmarshal(data, &raw); err != nil {
			a.logger.Warn("mensagem inválida recebida (JSON inválido)", "err", err)
			continue
		}

		a.logger.Debug("mensagem recebida", "type", raw.Type, "msg_id", raw.MsgID)

		switch raw.Type {
		// Ack do heartbeat — apenas loga
		case types.TypeAgentHeartbeatAck:
			a.logger.Debug("heartbeat.ack recebido")

		// Qualquer cmd.* vai para o Executor
		default:
			if len(raw.Type) > 4 && raw.Type[:4] == "cmd." {
				exec.Dispatch(raw)
			} else {
				a.logger.Warn("tipo de mensagem desconhecido ignorado", "type", raw.Type)
			}
		}
	}
}

// ─────────────────────────────────────────────
// ENVIO — implementa executor.Sender
// ─────────────────────────────────────────────

// Send serializa e envia uma mensagem pelo WebSocket.
// Thread-safe: usa mutex para evitar escrita concorrente.
func (a *Agent) Send(msg types.Message) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("falha ao serializar mensagem: %w", err)
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	if a.conn == nil {
		return fmt.Errorf("sem conexão ativa")
	}

	a.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	return a.conn.WriteMessage(websocket.TextMessage, data)
}

// ─────────────────────────────────────────────
// BACKOFF EXPONENCIAL
// ─────────────────────────────────────────────

// backoffDelay calcula o tempo de espera antes de reconectar.
// Fórmula: min(initialDelay * 2^(attempt-1), maxDelay)
func (a *Agent) backoffDelay(attempt int) time.Duration {
	initial := float64(a.cfg.Reconnect.InitialDelayS)
	if initial <= 0 {
		initial = 1
	}
	maxDelay := float64(a.cfg.Reconnect.MaxDelayS)
	if maxDelay <= 0 {
		maxDelay = 60
	}

	delay := initial * math.Pow(2, float64(attempt-1))
	if delay > maxDelay {
		delay = maxDelay
	}

	return time.Duration(delay) * time.Second
}
