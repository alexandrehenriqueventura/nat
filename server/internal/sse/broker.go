// Package sse implementa um broker de Server-Sent Events.
// O frontend se inscreve em /events/devices e recebe notificações
// em tempo real quando agentes conectam, desconectam ou enviam resultados.
package sse

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
)

// Event representa um evento SSE a ser transmitido.
type Event struct {
	Name string `json:"name"` // ex: "device.connected", "device.heartbeat"
	Data any    `json:"data"`
}

// Broker gerencia todos os clientes SSE conectados.
type Broker struct {
	mu      sync.RWMutex
	clients map[string]chan Event // clientID → canal
	logger  *slog.Logger
}

func NewBroker(logger *slog.Logger) *Broker {
	return &Broker{
		clients: make(map[string]chan Event),
		logger:  logger,
	}
}

// Publish envia um evento para TODOS os clientes SSE conectados.
func (b *Broker) Publish(name string, data any) {
	event := Event{Name: name, Data: data}

	b.mu.RLock()
	defer b.mu.RUnlock()

	for id, ch := range b.clients {
		select {
		case ch <- event:
		default:
			// canal cheio — cliente lento, descarta
			b.logger.Warn("SSE canal cheio, evento descartado", "client", id, "event", name)
		}
	}
}

// Handler é o http.HandlerFunc que mantém a conexão SSE aberta.
// Cada cliente que abre GET /events/devices recebe esta handler.
func (b *Broker) Handler(w http.ResponseWriter, r *http.Request) {
	// Verifica se o cliente suporta streaming
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming não suportado", http.StatusInternalServerError)
		return
	}

	// Headers SSE
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // desativa buffer do Nginx

	// Registra este cliente
	clientID := r.RemoteAddr
	ch := make(chan Event, 32)

	b.mu.Lock()
	b.clients[clientID] = ch
	b.mu.Unlock()

	b.logger.Info("SSE cliente conectado", "client", clientID)

	// Envia evento inicial de "connected"
	fmt.Fprintf(w, "event: connected\ndata: {}\n\n")
	flusher.Flush()

	defer func() {
		b.mu.Lock()
		delete(b.clients, clientID)
		close(ch)
		b.mu.Unlock()
		b.logger.Info("SSE cliente desconectado", "client", clientID)
	}()

	for {
		select {
		case <-r.Context().Done():
			return // cliente fechou a conexão
		case event, ok := <-ch:
			if !ok {
				return
			}
			data, err := json.Marshal(event)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Name, data)
			flusher.Flush()
		}
	}
}
