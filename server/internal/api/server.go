package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/nat/server/internal/config"
	"github.com/nat/server/internal/db"
	"github.com/nat/server/internal/hub"
	"github.com/nat/server/internal/sse"
)

type Server struct {
	cfg    *config.Config
	db     *db.DB
	hub    *hub.Hub
	broker *sse.Broker
	logger *slog.Logger
	mux    *http.ServeMux
}

func NewServer(
	cfg *config.Config,
	database *db.DB,
	h *hub.Hub,
	broker *sse.Broker,
	logger *slog.Logger,
) *Server {
	s := &Server{
		cfg:    cfg,
		db:     database,
		hub:    h,
		broker: broker,
		logger: logger,
		mux:    http.NewServeMux(),
	}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	timeout := time.Duration(s.cfg.AgentTimeoutS) * time.Second

	// SSE
	s.mux.HandleFunc("GET /events/devices", s.broker.Handler)

	// WebSocket para agentes
	s.mux.HandleFunc("/ws/agent", func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(s.hub, s.db, s.cfg.AgentToken, s.logger, w, r)
	})

	// Empresas
	s.mux.HandleFunc("GET /api/companies", handleGetCompanies(s.db))
	s.mux.HandleFunc("POST /api/companies", handleCreateCompany(s.db))
	s.mux.HandleFunc("PATCH /api/companies/{id}", handleUpdateCompany(s.db))
	s.mux.HandleFunc("DELETE /api/companies/{id}", handleDeleteCompany(s.db))
	s.mux.HandleFunc("POST /api/companies/{id}/bulk-assign", handleBulkAssignCompany(s.db))

	// Dispositivos
	s.mux.HandleFunc("GET /api/devices", handleGetDevices(s.db, s.hub))
	s.mux.HandleFunc("PUT /api/devices/bulk-company", handleBulkSetCompany(s.db))
	s.mux.HandleFunc("GET /api/devices/{id}", handleGetDevice(s.db, s.hub))
	s.mux.HandleFunc("PUT /api/devices/{id}/company", handleSetDeviceCompany(s.db))
	s.mux.HandleFunc("POST /api/devices/{id}/command", handleDeviceCommand(s.hub, timeout))

	// Health check
	s.mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "healthy"})
	})
}

func (s *Server) Handler() http.Handler {
	return s.corsMiddleware(s.mux)
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := false

		if len(s.cfg.CORSOrigins) == 0 || (len(s.cfg.CORSOrigins) == 1 && s.cfg.CORSOrigins[0] == "*") {
			allowed = true
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else {
			for _, o := range s.cfg.CORSOrigins {
				if o == "*" || o == origin {
					allowed = true
					w.Header().Set("Access-Control-Allow-Origin", origin)
					break
				}
			}
		}

		if allowed {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Log básico de requisição REST
		if strings.HasPrefix(r.URL.Path, "/api") {
			s.logger.Info("HTTP", "method", r.Method, "path", r.URL.Path)
		}

		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
