package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/nat/server/internal/types"
)

// DeviceRow é a linha crua do banco de dados.
type DeviceRow struct {
	ID             string
	Hostname       string
	Alias          string
	OS             string
	Arch           string
	AgentVer       string
	MACAddress     string
	CompanyID      *string
	CPUPct         float64
	RAMUsedMB      int64
	RAMTotalMB     int64
	DiskFreeGB     float64
	UptimeS        int64
	InterfacesJSON string
	LastSeen       *time.Time
	CreatedAt      time.Time
}

// DeviceRepo gerencia operações de terminal no banco.
type DeviceRepo struct{ db *sql.DB }

// Upsert cria ou atualiza um terminal a partir do payload de registro.
func (r *DeviceRepo) Upsert(payload types.RegisterPayload) (*DeviceRow, error) {
	id := payload.Hostname // usa o hostname como ID único

	ifacesJSON, err := json.Marshal(payload.Interfaces)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	_, err = r.db.Exec(`
		INSERT INTO devices (id, hostname, alias, os, arch, agent_ver, mac_address, interfaces_json, last_seen)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			hostname        = excluded.hostname,
			alias           = excluded.alias,
			os              = excluded.os,
			arch            = excluded.arch,
			agent_ver       = excluded.agent_ver,
			mac_address     = excluded.mac_address,
			interfaces_json = excluded.interfaces_json,
			last_seen       = excluded.last_seen
	`, id, payload.Hostname, payload.Alias, payload.OS, payload.Arch,
		payload.AgentVer, payload.MACAddress, string(ifacesJSON), now)

	if err != nil {
		return nil, fmt.Errorf("upsert device: %w", err)
	}

	return r.GetByID(id)
}

// UpdateHeartbeat atualiza as métricas de um terminal.
func (r *DeviceRepo) UpdateHeartbeat(deviceID string, hb types.HeartbeatPayload) error {
	ifacesJSON, _ := json.Marshal(hb.Interfaces)
	_, err := r.db.Exec(`
		UPDATE devices SET
			cpu_pct         = ?,
			ram_used_mb     = ?,
			ram_total_mb    = ?,
			disk_free_gb    = ?,
			uptime_s        = ?,
			interfaces_json = ?,
			last_seen       = ?
		WHERE id = ?
	`, hb.CPUPct, hb.RAMUsedMB, hb.RAMTotalMB, hb.DiskFreeGB,
		hb.UptimeS, string(ifacesJSON), time.Now().UTC(), deviceID)
	return err
}

// GetAll retorna todos os terminais.
func (r *DeviceRepo) GetAll() ([]DeviceRow, error) {
	rows, err := r.db.Query(`
		SELECT id, hostname, alias, os, arch, agent_ver, mac_address,
		       company_id, cpu_pct, ram_used_mb, ram_total_mb,
		       disk_free_gb, uptime_s, interfaces_json, last_seen, created_at
		FROM devices ORDER BY hostname
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []DeviceRow
	for rows.Next() {
		var d DeviceRow
		if err := rows.Scan(
			&d.ID, &d.Hostname, &d.Alias, &d.OS, &d.Arch, &d.AgentVer, &d.MACAddress,
			&d.CompanyID, &d.CPUPct, &d.RAMUsedMB, &d.RAMTotalMB,
			&d.DiskFreeGB, &d.UptimeS, &d.InterfacesJSON, &d.LastSeen, &d.CreatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, d)
	}
	return result, rows.Err()
}

// GetByID retorna um terminal pelo ID.
func (r *DeviceRepo) GetByID(id string) (*DeviceRow, error) {
	var d DeviceRow
	err := r.db.QueryRow(`
		SELECT id, hostname, alias, os, arch, agent_ver, mac_address,
		       company_id, cpu_pct, ram_used_mb, ram_total_mb,
		       disk_free_gb, uptime_s, interfaces_json, last_seen, created_at
		FROM devices WHERE id = ?
	`, id).Scan(
		&d.ID, &d.Hostname, &d.Alias, &d.OS, &d.Arch, &d.AgentVer, &d.MACAddress,
		&d.CompanyID, &d.CPUPct, &d.RAMUsedMB, &d.RAMTotalMB,
		&d.DiskFreeGB, &d.UptimeS, &d.InterfacesJSON, &d.LastSeen, &d.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &d, err
}

// SetCompany atribui (ou remove) a empresa de um terminal.
func (r *DeviceRepo) SetCompany(deviceID string, companyID *string) error {
	_, err := r.db.Exec(`UPDATE devices SET company_id = ? WHERE id = ?`, companyID, deviceID)
	return err
}

// BulkSetCompany atribui a mesma empresa a vários terminais.
func (r *DeviceRepo) BulkSetCompany(deviceIDs []string, companyID *string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(`UPDATE devices SET company_id = ? WHERE id = ?`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, id := range deviceIDs {
		if _, err := stmt.Exec(companyID, id); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}
