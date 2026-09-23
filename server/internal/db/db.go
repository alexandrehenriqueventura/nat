// Package db gerencia a conexão SQLite e as migrações do schema.
package db

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite" // driver puro Go, sem CGO
)

// DB encapsula a conexão ao banco e expõe os repositórios.
type DB struct {
	conn      *sql.DB
	Devices   *DeviceRepo
	Companies *CompanyRepo
}

// Open abre (ou cria) o banco SQLite e aplica as migrações.
func Open(path string) (*DB, error) {
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("abrindo sqlite: %w", err)
	}

	// SQLite funciona melhor com uma única conexão de escrita
	conn.SetMaxOpenConns(1)

	if err := migrate(conn); err != nil {
		return nil, fmt.Errorf("migrando schema: %w", err)
	}

	d := &DB{conn: conn}
	d.Devices   = &DeviceRepo{db: conn}
	d.Companies = &CompanyRepo{db: conn}
	return d, nil
}

func (d *DB) Close() error { return d.conn.Close() }

// ─── Schema ───────────────────────────────────────────────────

func migrate(db *sql.DB) error {
	// Habilita WAL para melhor concorrência leitura/escrita
	if _, err := db.Exec(`PRAGMA journal_mode=WAL`); err != nil {
		return err
	}
	if _, err := db.Exec(`PRAGMA foreign_keys=ON`); err != nil {
		return err
	}

	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS companies (
		id          TEXT PRIMARY KEY,
		name        TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		color       TEXT NOT NULL DEFAULT '#3b82f6',
		created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS devices (
		id              TEXT PRIMARY KEY,
		hostname        TEXT NOT NULL,
		alias           TEXT NOT NULL DEFAULT '',
		os              TEXT NOT NULL DEFAULT '',
		arch            TEXT NOT NULL DEFAULT '',
		agent_ver       TEXT NOT NULL DEFAULT '',
		mac_address     TEXT NOT NULL DEFAULT '',
		company_id      TEXT REFERENCES companies(id) ON DELETE SET NULL,
		-- métricas atualizadas pelo heartbeat
		cpu_pct         REAL    NOT NULL DEFAULT 0,
		ram_used_mb     INTEGER NOT NULL DEFAULT 0,
		ram_total_mb    INTEGER NOT NULL DEFAULT 0,
		disk_free_gb    REAL    NOT NULL DEFAULT 0,
		uptime_s        INTEGER NOT NULL DEFAULT 0,
		interfaces_json TEXT    NOT NULL DEFAULT '[]',
		last_seen       DATETIME,
		created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS command_log (
		id          TEXT PRIMARY KEY,
		device_id   TEXT NOT NULL,
		cmd_type    TEXT NOT NULL,
		payload_json TEXT NOT NULL DEFAULT '{}',
		status      TEXT NOT NULL DEFAULT 'pending',
		result_json TEXT,
		created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		resolved_at DATETIME
	);
	`)
	return err
}
