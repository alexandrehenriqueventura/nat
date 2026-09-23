// Package hub gerencia todas as conexões ativas de agentes.
// É o coração do servidor: recebe registros, processa heartbeats
// e roteia comandos do frontend para o agente correto.
package hub

import (
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/nat/server/internal/db"
	"github.com/nat/server/internal/sse"
	"github.com/nat/server/internal/types"
)

// PendingCommand representa um comando aguardando resposta do agente.
type PendingCommand struct {
	Result chan types.RawMessage
}

// Hub mantém o registro de todos os agentes conectados.
type Hub struct {
	// Agentes ativos: deviceID → *Client
	clients   map[string]*Client
	clientsMu sync.RWMutex

	// Comandos aguardando resposta: msgID → *PendingCommand
	pending   map[string]*PendingCommand
	pendingMu sync.Mutex

	// Canais de ciclo de vida
	register   chan *Client
	unregister chan *Client

	// Dependências
	db     *db.DB
	broker *sse.Broker
	logger *slog.Logger
}

// New cria um novo Hub.
func New(database *db.DB, broker *sse.Broker, logger *slog.Logger) *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		pending:    make(map[string]*PendingCommand),
		register:   make(chan *Client, 8),
		unregister: make(chan *Client, 8),
		db:         database,
		broker:     broker,
		logger:     logger,
	}
}

// Run inicia o loop principal do hub (deve rodar em goroutine).
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clientsMu.Lock()
			h.clients[client.DeviceID] = client
			h.clientsMu.Unlock()
			h.logger.Info("agente registrado", "device_id", client.DeviceID)
			h.broker.Publish("device.connected", map[string]string{"device_id": client.DeviceID})

		case client := <-h.unregister:
			h.clientsMu.Lock()
			if _, ok := h.clients[client.DeviceID]; ok {
				delete(h.clients, client.DeviceID)
				close(client.send)
			}
			h.clientsMu.Unlock()
			h.logger.Info("agente desconectado", "device_id", client.DeviceID)
			h.broker.Publish("device.disconnected", map[string]string{"device_id": client.DeviceID})
		}
	}
}

// RegisterClient adiciona um novo cliente ao hub.
func (h *Hub) RegisterClient(c *Client) {
	h.register <- c
}

// UnregisterClient remove um cliente do hub.
func (h *Hub) UnregisterClient(c *Client) {
	h.unregister <- c
}

// IsOnline retorna true se o agente estiver conectado.
func (h *Hub) IsOnline(deviceID string) bool {
	h.clientsMu.RLock()
	_, ok := h.clients[deviceID]
	h.clientsMu.RUnlock()
	return ok
}

// SendCommand envia um comando ao agente e aguarda a resposta (timeout).
// Retorna o RawMessage de resultado ou erro se o agente não responder a tempo.
func (h *Hub) SendCommand(deviceID string, msg types.Message, timeout time.Duration) (*types.RawMessage, error) {
	h.clientsMu.RLock()
	client, ok := h.clients[deviceID]
	h.clientsMu.RUnlock()

	if !ok {
		return nil, ErrAgentOffline
	}

	// Registra o comando como pendente
	pending := &PendingCommand{Result: make(chan types.RawMessage, 1)}
	h.pendingMu.Lock()
	h.pending[msg.MsgID] = pending
	h.pendingMu.Unlock()

	defer func() {
		h.pendingMu.Lock()
		delete(h.pending, msg.MsgID)
		h.pendingMu.Unlock()
	}()

	// Serializa e envia ao agente
	data, err := json.Marshal(msg)
	if err != nil {
		return nil, err
	}

	select {
	case client.send <- data:
	default:
		return nil, ErrAgentBusy
	}

	// Aguarda resposta com timeout
	select {
	case result := <-pending.Result:
		return &result, nil
	case <-time.After(timeout):
		return nil, ErrCommandTimeout
	}
}

// HandleAgentMessage processa uma mensagem recebida de um agente.
// Chamado pelo readLoop do Client.
func (h *Hub) HandleAgentMessage(deviceID string, raw types.RawMessage) {
	switch raw.Type {
	case types.TypeAgentHeartbeat:
		h.handleHeartbeat(deviceID, raw)

	case types.TypeResultOk, types.TypeResultError, types.TypeResultRollback:
		h.handleResult(raw)

	default:
		h.logger.Warn("tipo de mensagem desconhecido do agente",
			"device_id", deviceID, "type", raw.Type)
	}
}

func (h *Hub) handleHeartbeat(deviceID string, raw types.RawMessage) {
	// Desserializa o payload
	data, _ := json.Marshal(raw.Payload)
	var hb types.HeartbeatPayload
	if err := json.Unmarshal(data, &hb); err != nil {
		h.logger.Warn("heartbeat inválido", "device_id", deviceID, "err", err)
		return
	}

	// Atualiza o banco
	if err := h.db.Devices.UpdateHeartbeat(deviceID, hb); err != nil {
		h.logger.Error("atualizando heartbeat no banco", "err", err)
	}

	// Notifica o frontend via SSE (métricas atualizadas)
	h.broker.Publish("device.heartbeat", map[string]interface{}{
		"device_id":    deviceID,
		"cpu_pct":      hb.CPUPct,
		"ram_used_mb":  hb.RAMUsedMB,
		"ram_total_mb": hb.RAMTotalMB,
		"disk_free_gb": hb.DiskFreeGB,
		"uptime_s":     hb.UptimeS,
	})
}

func (h *Hub) handleResult(raw types.RawMessage) {
	// Extrai ref_msg_id do payload para correlacionar com o comando original
	refMsgID, _ := raw.Payload["ref_msg_id"].(string)
	if refMsgID == "" {
		h.logger.Warn("result sem ref_msg_id", "type", raw.Type)
		return
	}

	h.pendingMu.Lock()
	pending, ok := h.pending[refMsgID]
	h.pendingMu.Unlock()

	if !ok {
		h.logger.Warn("resultado orfão (sem comando pendente)", "ref_msg_id", refMsgID)
		return
	}

	// Entrega o resultado para quem está aguardando (SendCommand)
	select {
	case pending.Result <- raw:
	default:
		h.logger.Warn("canal de resultado cheio", "ref_msg_id", refMsgID)
	}

	// Publica resultado no SSE para outros painéis abertos
	h.broker.Publish("command.result", map[string]interface{}{
		"ref_msg_id": refMsgID,
		"type":       raw.Type,
		"payload":    raw.Payload,
	})
}

// Erros sentinela
type hubError string

func (e hubError) Error() string { return string(e) }

const (
	ErrAgentOffline  hubError = "agente offline"
	ErrAgentBusy     hubError = "canal do agente cheio"
	ErrCommandTimeout hubError = "timeout aguardando resposta do agente"
)
