// Package agent implementa o núcleo do agente integrado ao Cloud Firestore:
// – Registro inicial e telemetria (CPU, RAM, Disco, Rede, Uptime) a cada 10s
// – Listener em tempo real da fila de comandos (devices/{hostname}/commands)
// – Execução de comandos PowerShell e atualização do status no Firestore
package agent

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/option"

	"github.com/nat/agent/internal/executor"
	"github.com/nat/agent/internal/sysinfo"
	"github.com/nat/agent/internal/types"
)

// Config contém os parâmetros do agente lidos do config.json.
type Config struct {
	ProjectID          string `json:"project_id"`
	CredentialsFile    string `json:"credentials_file"`
	HostnameOverride   string `json:"hostname_override"`
	Alias              string `json:"alias"`
	LogLevel           string `json:"log_level"`
	HeartbeatIntervalS int    `json:"heartbeat_interval_s"`
}

// Agent gerencia o ciclo de vida do agente com o Cloud Firestore.
type Agent struct {
	cfg      Config
	hostname string
	client   *firestore.Client
	executor *executor.Executor
	logger   *slog.Logger
	stopCh   chan struct{}
}

// New cria uma nova instância do Agent.
func New(cfg Config, logger *slog.Logger) *Agent {
	hostname := sysinfo.GetHostname(cfg.HostnameOverride)
	if cfg.HeartbeatIntervalS == 0 {
		cfg.HeartbeatIntervalS = 10
	}

	a := &Agent{
		cfg:      cfg,
		hostname: hostname,
		logger:   logger,
		stopCh:   make(chan struct{}),
	}
	a.executor = executor.New(hostname, a, logger)
	return a
}

// Run inicia o agente: conecta ao Firestore, registra telemetria e escuta comandos.
func (a *Agent) Run() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var opts []option.ClientOption
	if a.cfg.CredentialsFile != "" {
		if _, err := os.Stat(a.cfg.CredentialsFile); err == nil {
			opts = append(opts, option.WithCredentialsFile(a.cfg.CredentialsFile))
			a.logger.Info("usando arquivo de credenciais", "path", a.cfg.CredentialsFile)
		} else {
			a.logger.Warn("arquivo de credenciais não encontrado, tentando ADC padrão", "path", a.cfg.CredentialsFile)
		}
	}

	client, err := firestore.NewClient(ctx, a.cfg.ProjectID, opts...)
	if err != nil {
		a.logger.Error("falha ao conectar ao Cloud Firestore", "err", err, "project_id", a.cfg.ProjectID)
		return
	}
	a.client = client
	defer client.Close()

	a.logger.Info("conectado com sucesso ao Cloud Firestore", "project_id", a.cfg.ProjectID, "hostname", a.hostname)

	// 1. Registro inicial do dispositivo
	if err := a.registerDevice(ctx); err != nil {
		a.logger.Warn("falha no registro inicial do dispositivo", "err", err)
	}

	// 2. Loop de telemetria / heartbeat em background
	go a.heartbeatLoop(ctx)

	// 3. Loop de escuta de comandos em tempo real
	a.commandListenLoop(ctx)
}

// Stop sinaliza o encerramento gracioso do agente.
func (a *Agent) Stop() {
	close(a.stopCh)
	if a.client != nil {
		_ = a.client.Close()
	}
}

// ─────────────────────────────────────────────
// REGISTRO & HEARTBEAT
// ─────────────────────────────────────────────

func (a *Agent) registerDevice(ctx context.Context) error {
	osName := sysinfo.GetOS()
	mac := sysinfo.GetMACAddress()
	ifaces := sysinfo.GetInterfaces()
	cpuPct, ramUsed, ramTotal, diskFree, uptimeS := sysinfo.GetHeartbeatMetrics()

	alias := a.cfg.Alias
	if alias == "" {
		alias = a.hostname
	}

	docRef := a.client.Collection("devices").Doc(a.hostname)
	_, err := docRef.Set(ctx, map[string]interface{}{
		"hostname":     a.hostname,
		"alias":        alias,
		"os":           osName,
		"arch":         "amd64",
		"agent_ver":    "1.0.0",
		"mac_address":  mac,
		"interfaces":   ifaces,
		"cpu_pct":      cpuPct,
		"ram_used_mb":  ramUsed,
		"ram_total_mb": ramTotal,
		"disk_free_gb": diskFree,
		"uptime_s":     uptimeS,
		"last_seen":    firestore.ServerTimestamp,
	}, firestore.MergeAll)

	if err != nil {
		return fmt.Errorf("salvando registro no Firestore: %w", err)
	}

	a.logger.Info("dispositivo registrado no Firestore", "hostname", a.hostname)
	return nil
}

func (a *Agent) heartbeatLoop(ctx context.Context) {
	interval := time.Duration(a.cfg.HeartbeatIntervalS) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	docRef := a.client.Collection("devices").Doc(a.hostname)

	for {
		select {
		case <-a.stopCh:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			cpuPct, ramUsed, ramTotal, diskFree, uptimeS := sysinfo.GetHeartbeatMetrics()
			ifaces := sysinfo.GetInterfaces()

			_, err := docRef.Set(ctx, map[string]interface{}{
				"cpu_pct":      cpuPct,
				"ram_used_mb":  ramUsed,
				"ram_total_mb": ramTotal,
				"disk_free_gb": diskFree,
				"uptime_s":     uptimeS,
				"interfaces":   ifaces,
				"last_seen":    firestore.ServerTimestamp,
			}, firestore.MergeAll)

			if err != nil {
				a.logger.Warn("falha ao enviar heartbeat ao Firestore", "err", err)
			} else {
				a.logger.Debug("heartbeat enviado", "cpu", cpuPct, "ram_used", ramUsed)
			}
		}
	}
}

// ─────────────────────────────────────────────
// ESCUTA DE COMANDOS (FILA EM TEMPO REAL)
// ─────────────────────────────────────────────

func (a *Agent) commandListenLoop(ctx context.Context) {
	commandsCol := a.client.Collection("devices").Doc(a.hostname).Collection("commands")
	q := commandsCol.Where("status", "==", "pending")

	for {
		select {
		case <-a.stopCh:
			return
		case <-ctx.Done():
			return
		default:
			// Inicia listener de snapshots da query
			iter := q.Snapshots(ctx)
			a.logger.Info("aguardando comandos na fila do Firestore...")

			for {
				snap, err := iter.Next()
				if err != nil {
					if ctx.Err() != nil {
						return
					}
					a.logger.Warn("erro no listener de comandos, reiniciando em 5s", "err", err)
					time.Sleep(5 * time.Second)
					break
				}

				for _, change := range snap.Changes {
					if change.Kind == firestore.DocumentAdded || change.Kind == firestore.DocumentModified {
						docSnap := change.Doc
						data := docSnap.Data()

						status, _ := data["status"].(string)
						if status != "pending" {
							continue
						}

						cmdType, _ := data["cmd_type"].(string)
						payload, _ := data["payload"].(map[string]interface{})

						a.logger.Info("novo comando pendente detectado", "id", docSnap.Ref.ID, "type", cmdType)

						// 1. Marca imediatamente como "running" para evitar dupla execução
						_, _ = docSnap.Ref.Update(ctx, []firestore.Update{
							{Path: "status", Value: "running"},
							{Path: "updated_at", Value: firestore.ServerTimestamp},
						})

						// 2. Despacha para o executor em goroutine
						raw := types.RawMessage{
							MsgID:   docSnap.Ref.ID,
							Type:    cmdType,
							Ts:      time.Now().UTC(),
							Payload: payload,
						}
						a.executor.Dispatch(raw)
					}
				}
			}
		}
	}
}

// ─────────────────────────────────────────────
// IMPLEMENTAÇÃO DA INTERFACE executor.Sender
// ─────────────────────────────────────────────

// Send é chamado pelo executor para gravar o resultado do comando no Firestore.
func (a *Agent) Send(msg types.Message) error {
	if a.client == nil {
		return fmt.Errorf("cliente Firestore não inicializado")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmdDocRef := a.client.Collection("devices").Doc(a.hostname).Collection("commands").Doc(msg.MsgID)

	var status string
	var resultData interface{}
	var resultErr interface{}

	switch msg.Type {
	case types.TypeResultOk:
		status = "completed"
		if p, ok := msg.Payload.(types.ResultOKPayload); ok {
			resultData = p.Data
		} else if m, ok := msg.Payload.(map[string]interface{}); ok {
			resultData = m["data"]
		}
	case types.TypeResultRollback:
		status = "rollback"
		if p, ok := msg.Payload.(types.ResultRollbackPayload); ok {
			resultData = p.RevertedTo
			resultErr = map[string]string{"reason": p.Reason}
		}
	case types.TypeResultError:
		status = "error"
		if p, ok := msg.Payload.(types.ResultErrorPayload); ok {
			resultErr = p.Error
		} else if m, ok := msg.Payload.(map[string]interface{}); ok {
			resultErr = m["error"]
		}
	default:
		status = "completed"
		resultData = msg.Payload
	}

	updates := []firestore.Update{
		{Path: "status", Value: status},
		{Path: "updated_at", Value: firestore.ServerTimestamp},
	}
	if resultData != nil {
		updates = append(updates, firestore.Update{Path: "result_data", Value: resultData})
	}
	if resultErr != nil {
		updates = append(updates, firestore.Update{Path: "error", Value: resultErr})
	}

	_, err := cmdDocRef.Update(ctx, updates)
	if err != nil {
		a.logger.Error("falha ao atualizar resultado do comando no Firestore", "id", msg.MsgID, "err", err)
		return err
	}

	a.logger.Info("resultado do comando gravado com sucesso", "id", msg.MsgID, "status", status)
	return nil
}
