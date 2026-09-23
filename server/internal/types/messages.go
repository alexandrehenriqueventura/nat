// Package types define as structs do protocolo WebSocket
// compartilhadas entre o hub e a API.
package types

import "time"

// ─── Envelope padrão ─────────────────────────────────────────

// Message é usado para ENVIAR (payload é interface{} flexível).
type Message struct {
	MsgID   string      `json:"msg_id"`
	Type    string      `json:"type"`
	Ts      time.Time   `json:"ts"`
	Payload interface{} `json:"payload"`
}

// RawMessage é usado para RECEBER (payload como map para dispatch).
type RawMessage struct {
	MsgID   string                 `json:"msg_id"`
	Type    string                 `json:"type"`
	Ts      time.Time              `json:"ts"`
	Payload map[string]interface{} `json:"payload"`
}

// ─── Constantes de tipo ───────────────────────────────────────

const (
	TypeAgentRegister     = "agent.register"
	TypeAgentRegisterAck  = "agent.register.ack"
	TypeAgentHeartbeat    = "agent.heartbeat"
	TypeAgentHeartbeatAck = "agent.heartbeat.ack"
	TypeResultOk          = "result.ok"
	TypeResultError       = "result.error"
	TypeResultRollback    = "result.rollback"
)

// ─── Payloads de registro ─────────────────────────────────────

type NetworkInterface struct {
	Name    string   `json:"name"`
	IP      string   `json:"ip"`
	Mask    string   `json:"mask"`
	Gateway string   `json:"gateway"`
	IsDHCP  bool     `json:"is_dhcp"`
	DNS     []string `json:"dns"`
	Status  string   `json:"status"`
}

type RegisterPayload struct {
	Hostname   string             `json:"hostname"`
	Alias      string             `json:"alias"`
	OS         string             `json:"os"`
	Arch       string             `json:"arch"`
	AgentVer   string             `json:"agent_ver"`
	MACAddress string             `json:"mac_address"`
	Interfaces []NetworkInterface `json:"interfaces"`
}

type RegisterAckPayload struct {
	AgentID           string `json:"agent_id"`
	HeartbeatIntervalS int   `json:"heartbeat_interval_s"`
	Message           string `json:"message"`
}

// ─── Payloads de heartbeat ────────────────────────────────────

type HeartbeatInterface struct {
	Name   string `json:"name"`
	IP     string `json:"ip"`
	IsDHCP bool   `json:"is_dhcp"`
}

type HeartbeatPayload struct {
	Hostname   string               `json:"hostname"`
	UptimeS    int64                `json:"uptime_s"`
	CPUPct     float64              `json:"cpu_pct"`
	RAMUsedMB  int64                `json:"ram_used_mb"`
	RAMTotalMB int64                `json:"ram_total_mb"`
	DiskFreeGB float64              `json:"disk_free_gb"`
	Interfaces []HeartbeatInterface `json:"interfaces"`
}

// ─── Payloads de resultado ────────────────────────────────────

type ResultError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
}

type ResultOKPayload struct {
	RefMsgID string      `json:"ref_msg_id"`
	CmdType  string      `json:"cmd_type"`
	Data     interface{} `json:"data,omitempty"`
}

type ResultErrorPayload struct {
	RefMsgID string      `json:"ref_msg_id"`
	CmdType  string      `json:"cmd_type"`
	Error    ResultError `json:"error"`
}

type ResultRollbackPayload struct {
	RefMsgID   string      `json:"ref_msg_id"`
	CmdType    string      `json:"cmd_type"`
	Reason     string      `json:"reason"`
	RevertedTo interface{} `json:"reverted_to,omitempty"`
}
