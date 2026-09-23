package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nat/server/internal/hub"
	"github.com/nat/server/internal/types"
)

type CommandRequest struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type CommandResponse struct {
	CommandID string                 `json:"command_id"`
	CmdType   string                 `json:"cmd_type"`
	Status    string                 `json:"status"` // ok, error, rollback
	Data      map[string]interface{} `json:"data,omitempty"`
	Error     *types.ResultError     `json:"error,omitempty"`
	TS        string                 `json:"ts"`
}

func handleDeviceCommand(h *hub.Hub, defaultTimeout time.Duration) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		deviceID := r.PathValue("id")
		if deviceID == "" {
			path := strings.TrimPrefix(r.URL.Path, "/api/devices/")
			parts := strings.Split(path, "/")
			if len(parts) >= 1 {
				deviceID = parts[0]
			}
		}

		var req CommandRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "payload JSON inválido", http.StatusBadRequest)
			return
		}

		if req.Type == "" {
			http.Error(w, "type do comando obrigatório", http.StatusBadRequest)
			return
		}

		msgID := "cmd-" + uuid.New().String()
		msg := types.Message{
			MsgID:   msgID,
			Type:    req.Type,
			Ts:      time.Now().UTC(),
			Payload: req.Payload,
		}

		// Envia para o agente e aguarda resposta
		rawResult, err := h.SendCommand(deviceID, msg, defaultTimeout)
		if err != nil {
			status := "error"
			code := "SERVER_ERROR"
			if err == hub.ErrAgentOffline {
				code = "AGENT_OFFLINE"
			} else if err == hub.ErrCommandTimeout {
				code = "TIMEOUT"
			}

			writeJSON(w, http.StatusOK, CommandResponse{
				CommandID: msgID,
				CmdType:   req.Type,
				Status:    status,
				Error: &types.ResultError{
					Code:    code,
					Message: err.Error(),
				},
				TS: time.Now().UTC().Format(time.RFC3339),
			})
			return
		}

		// Parseia o retorno do agente
		respStatus := "ok"
		var respData map[string]interface{}
		var respErr *types.ResultError

		switch rawResult.Type {
		case types.TypeResultOk:
			respStatus = "ok"
			if d, ok := rawResult.Payload["data"].(map[string]interface{}); ok {
				respData = d
			}
		case types.TypeResultRollback:
			respStatus = "rollback"
			if d, ok := rawResult.Payload["reverted_to"].(map[string]interface{}); ok {
				respData = d
			}
		case types.TypeResultError:
			respStatus = "error"
			if errMap, ok := rawResult.Payload["error"].(map[string]interface{}); ok {
				respErr = &types.ResultError{
					Code:    getString(errMap, "code"),
					Message: getString(errMap, "message"),
					Detail:  getString(errMap, "detail"),
				}
			} else {
				respErr = &types.ResultError{
					Code:    "UNKNOWN_ERROR",
					Message: "Erro desconhecido retornado pelo agente",
				}
			}
		}

		writeJSON(w, http.StatusOK, CommandResponse{
			CommandID: msgID,
			CmdType:   req.Type,
			Status:    respStatus,
			Data:      respData,
			Error:     respErr,
			TS:        time.Now().UTC().Format(time.RFC3339),
		})
	}
}

func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}
