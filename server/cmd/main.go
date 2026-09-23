package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nat/server/internal/api"
	"github.com/nat/server/internal/config"
	"github.com/nat/server/internal/db"
	"github.com/nat/server/internal/hub"
	"github.com/nat/server/internal/sse"
)

func main() {
	configPath := flag.String("config", "config.json", "caminho para o arquivo de configuração")
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	logger.Info("Iniciando NAT Central Server...")

	// 1. Carrega configuração
	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Error("falha ao carregar config", "err", err)
		os.Exit(1)
	}

	// 2. Inicializa SQLite
	database, err := db.Open(cfg.DBPath)
	if err != nil {
		logger.Error("falha ao abrir banco de dados", "err", err)
		os.Exit(1)
	}
	defer database.Close()
	logger.Info("Banco de dados SQLite pronto", "path", cfg.DBPath)

	// 3. Inicializa SSE Broker e Hub
	broker := sse.NewBroker(logger)
	h := hub.New(database, broker, logger)
	go h.Run()
	logger.Info("Hub WebSocket inicializado")

	// 4. Inicializa Servidor HTTP
	srv := api.NewServer(cfg, database, h, broker, logger)

	httpServer := &http.Server{
		Addr:        fmt.Sprintf(":%d", cfg.HTTPPort),
		Handler:     srv.Handler(),
		ReadTimeout: 30 * time.Second,
		IdleTimeout: 120 * time.Second,
	}

	// Inicia HTTP Server em background
	go func() {
		logger.Info(fmt.Sprintf("Servidor ouvindo em http://0.0.0.0:%d", cfg.HTTPPort))
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("erro no servidor HTTP", "err", err)
			os.Exit(1)
		}
	}()

	// 5. Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Desligando servidor com segurança...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		logger.Error("erro durante shutdown", "err", err)
	}

	logger.Info("Servidor finalizado com sucesso")
}
