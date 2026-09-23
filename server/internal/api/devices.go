package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/nat/server/internal/db"
	"github.com/nat/server/internal/hub"
)

type DeviceResponse struct {
	ID         string                 `json:"id"`
	Hostname   string                 `json:"hostname"`
	Alias      string                 `json:"alias"`
	Status     string                 `json:"status"` // online, offline, alert
	OS         string                 `json:"os"`
	AgentVer   string                 `json:"agent_ver"`
	LastSeen   string                 `json:"last_seen"`
	UptimeS    int64                  `json:"uptime_s"`
	CPUPct     float64                `json:"cpu_pct"`
	RAMUsedMB  int64                  `json:"ram_used_mb"`
	RAMTotalMB int64                  `json:"ram_total_mb"`
	DiskFreeGB float64                `json:"disk_free_gb"`
	Interfaces []interface{}          `json:"interfaces"`
	Alerts     []DeviceAlertResponse  `json:"alerts"`
	CompanyID  *string                `json:"company_id"`
}

type DeviceAlertResponse struct {
	Severity string `json:"severity"` // warning, critical
	Code     string `json:"code"`
	Message  string `json:"message"`
	TS       string `json:"ts"`
}

func formatDevice(row db.DeviceRow, isOnline bool) DeviceResponse {
	var ifaces []interface{}
	_ = json.Unmarshal([]byte(row.InterfacesJSON), &ifaces)
	if ifaces == nil {
		ifaces = []interface{}{}
	}

	lastSeenStr := ""
	if row.LastSeen != nil {
		lastSeenStr = row.LastSeen.Format(time.RFC3339)
	} else {
		lastSeenStr = row.CreatedAt.Format(time.RFC3339)
	}

	status := "offline"
	if isOnline {
		status = "online"
	}

	var alerts []DeviceAlertResponse

	// Checar alertas se estiver online
	if isOnline {
		if row.CPUPct >= 90 {
			alerts = append(alerts, DeviceAlertResponse{
				Severity: "critical",
				Code:     "CPU_HIGH",
				Message:  "CPU acima de 90%",
				TS:       time.Now().UTC().Format(time.RFC3339),
			})
		}
		if row.RAMTotalMB > 0 {
			ramPct := float64(row.RAMUsedMB) / float64(row.RAMTotalMB) * 100
			if ramPct >= 90 {
				alerts = append(alerts, DeviceAlertResponse{
					Severity: "critical",
					Code:     "RAM_HIGH",
					Message:  "RAM acima de 90%",
					TS:       time.Now().UTC().Format(time.RFC3339),
				})
			}
		}
		if row.DiskFreeGB > 0 && row.DiskFreeGB < 10 {
			alerts = append(alerts, DeviceAlertResponse{
				Severity: "warning",
				Code:     "DISK_LOW",
				Message:  "Espaço em disco C: abaixo de 10 GB",
				TS:       time.Now().UTC().Format(time.RFC3339),
			})
		}

		if len(alerts) > 0 {
			status = "alert"
		}
	}

	if alerts == nil {
		alerts = []DeviceAlertResponse{}
	}

	return DeviceResponse{
		ID:         row.ID,
		Hostname:   row.Hostname,
		Alias:      row.Alias,
		Status:     status,
		OS:         row.OS,
		AgentVer:   row.AgentVer,
		LastSeen:   lastSeenStr,
		UptimeS:    row.UptimeS,
		CPUPct:     row.CPUPct,
		RAMUsedMB:  row.RAMUsedMB,
		RAMTotalMB: row.RAMTotalMB,
		DiskFreeGB: row.DiskFreeGB,
		Interfaces: ifaces,
		Alerts:     alerts,
		CompanyID:  row.CompanyID,
	}
}

func handleGetDevices(database *db.DB, h *hub.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := database.Devices.GetAll()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		resp := make([]DeviceResponse, 0, len(rows))
		for _, row := range rows {
			online := h.IsOnline(row.ID)
			resp = append(resp, formatDevice(row, online))
		}

		writeJSON(w, http.StatusOK, resp)
	}
}

func handleGetDevice(database *db.DB, h *hub.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if id == "" {
			id = strings.TrimPrefix(r.URL.Path, "/api/devices/")
		}
		row, err := database.Devices.GetByID(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if row == nil {
			http.Error(w, "dispositivo não encontrado", http.StatusNotFound)
			return
		}

		writeJSON(w, http.StatusOK, formatDevice(*row, h.IsOnline(row.ID)))
	}
}

func handleSetDeviceCompany(database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		deviceID := r.PathValue("id")
		if deviceID == "" {
			path := strings.TrimPrefix(r.URL.Path, "/api/devices/")
			parts := strings.Split(path, "/")
			if len(parts) >= 1 {
				deviceID = parts[0]
			}
		}

		var req struct {
			CompanyID *string `json:"company_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "body inválido", http.StatusBadRequest)
			return
		}

		if err := database.Devices.SetCompany(deviceID, req.CompanyID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func handleBulkSetCompany(database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			DeviceIDs []string `json:"device_ids"`
			CompanyID *string  `json:"company_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "body inválido", http.StatusBadRequest)
			return
		}

		if err := database.Devices.BulkSetCompany(req.DeviceIDs, req.CompanyID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
