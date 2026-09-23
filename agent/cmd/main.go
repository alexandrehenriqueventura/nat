// main.go — Ponto de entrada do Agente NAT.
//
// Responsabilidades:
//   1. Carregar o config.json
//   2. Configurar o logger estruturado (slog)
//   3. Inicializar e iniciar o Agent
//   4. Tratar sinais do SO (Ctrl+C / SIGTERM) para encerramento gracioso
//
// Compilar para Windows:
//   GOOS=windows GOARCH=amd64 go build -o nat-agent.exe ./cmd/agent
//
// Rodar em desenvolvimento (Mac/Linux):
//   go run ./cmd/agent
package main

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/nat/agent/internal/agent"
)

func main() {
	// ── 1. Carrega configuração ─────────────────────────────
	cfg, err := loadConfig("config.json")
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERRO ao carregar config.json: %v\n", err)
		os.Exit(1)
	}

	// ── 2. Configura logger estruturado ────────────────────
	logger := buildLogger(cfg.LogLevel)
	logger.Info("NAT Agent iniciando",
		"version", "1.0.0",
		"project_id", cfg.ProjectID,
		"hostname_override", cfg.HostnameOverride,
	)

	// ── 3. Valida configuração mínima ─────────────────────
	if cfg.ProjectID == "" {
		logger.Error("project_id não configurado no config.json (insira o ID do seu projeto Firebase)")
		os.Exit(1)
	}

	// ── 4. Inicializa e inicia o agente ───────────────────
	a := agent.New(cfg, logger)

	// Roda o agente em background (ele bloqueia internamente com reconexão)
	go a.Run()

	// ── 5. Aguarda sinal de encerramento ──────────────────
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)

	sig := <-sigCh
	logger.Info("sinal de encerramento recebido", "signal", sig.String())

	a.Stop()
	logger.Info("agente encerrado com sucesso")
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

// loadConfig lê e desserializa o config.json.
func loadConfig(path string) (agent.Config, error) {
	var cfg agent.Config

	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, fmt.Errorf("não foi possível ler '%s': %w", path, err)
	}

	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("config.json inválido: %w", err)
	}

	// Valores padrão
	if cfg.HeartbeatIntervalS == 0 {
		cfg.HeartbeatIntervalS = 10
	}

	return cfg, nil
}

// buildLogger cria um logger slog com nível configurável.
func buildLogger(level string) *slog.Logger {
	var lvl slog.Level
	switch level {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}

	handler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: lvl,
		// Adiciona timestamps no formato legível
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			return a
		},
	})

	return slog.New(handler)
}
