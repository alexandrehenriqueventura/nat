// Package types define todas as structs que mapeiam os
// payloads JSON do protocolo WebSocket (protocolo_websocket.md).
// Tanto o Agente quanto o Servidor usam este pacote — garantindo
// que os dois lados sempre falem a mesma língua.
package types

import "time"

// ─────────────────────────────────────────────
// ENVELOPE BASE
// ─────────────────────────────────────────────

// Message é o envelope padrão de toda mensagem trocada.
type Message struct {
	MsgID   string      `json:"msg_id"`
	Type    string      `json:"type"`
	Ts      time.Time   `json:"ts"`
	Payload interface{} `json:"payload"`
}

// RawMessage é usado para deserializar uma mensagem
// sem conhecer o tipo do payload ainda.
type RawMessage struct {
	MsgID   string              `json:"msg_id"`
	Type    string              `json:"type"`
	Ts      time.Time           `json:"ts"`
	Payload map[string]interface{} `json:"payload"`
}

// ─────────────────────────────────────────────
// TIPOS DE MENSAGEM (constantes)
// ─────────────────────────────────────────────

const (
	// Ciclo de vida do agente
	TypeAgentRegister    = "agent.register"
	TypeAgentRegisterAck = "agent.register.ack"
	TypeAgentHeartbeat   = "agent.heartbeat"
	TypeAgentHeartbeatAck = "agent.heartbeat.ack"
	TypeAgentAlert       = "agent.alert"

	// Comandos de rede
	TypeCmdNetGetConfig = "cmd.net.get_config"
	TypeCmdNetSetIP     = "cmd.net.set_ip"
	TypeCmdNetSetDHCP   = "cmd.net.set_dhcp"

	// Comandos de compartilhamentos
	TypeCmdShareList     = "cmd.share.list"
	TypeCmdShareCreate   = "cmd.share.create"
	TypeCmdShareDelete   = "cmd.share.delete"
	TypeCmdShareSetPerms = "cmd.share.set_perms"

	// Comandos de usuários
	TypeCmdUserList         = "cmd.user.list"
	TypeCmdUserCreate       = "cmd.user.create"
	TypeCmdUserSetPassword  = "cmd.user.set_password"
	TypeCmdUserToggleStatus = "cmd.user.toggle_status"

	// Info do sistema
	TypeCmdSystemInfo = "cmd.system.info"

	// Resultados
	TypeResultOk       = "result.ok"
	TypeResultError    = "result.error"
	TypeResultRollback = "result.rollback"
)

// ─────────────────────────────────────────────
// REGISTRO
// ─────────────────────────────────────────────

// NetworkInterface representa uma placa de rede.
type NetworkInterface struct {
	Name      string   `json:"name"`
	IP        string   `json:"ip"`
	Mask      string   `json:"mask"`
	Gateway   string   `json:"gateway"`
	IsDHCP    bool     `json:"is_dhcp"`
	DNS       []string `json:"dns"`
	SpeedMbps int      `json:"speed_mbps,omitempty"`
	Status    string   `json:"status,omitempty"`
}

// RegisterPayload é o corpo do agent.register.
type RegisterPayload struct {
	Hostname   string             `json:"hostname"`
	Alias      string             `json:"alias"`
	OS         string             `json:"os"`
	Arch       string             `json:"arch"`
	AgentVer   string             `json:"agent_ver"`
	MACAddress string             `json:"mac_address"`
	Interfaces []NetworkInterface `json:"interfaces"`
}

// RegisterAckPayload é o corpo do agent.register.ack.
type RegisterAckPayload struct {
	Status              string    `json:"status"`
	DeviceID            string    `json:"device_id"`
	HeartbeatIntervalS  int       `json:"heartbeat_interval_s"`
	ServerTime          time.Time `json:"server_time"`
}

// ─────────────────────────────────────────────
// HEARTBEAT
// ─────────────────────────────────────────────

// HeartbeatInterface é a versão resumida da interface no heartbeat.
type HeartbeatInterface struct {
	Name   string `json:"name"`
	IP     string `json:"ip"`
	IsDHCP bool   `json:"is_dhcp"`
}

// HeartbeatPayload é o corpo do agent.heartbeat.
type HeartbeatPayload struct {
	Hostname   string               `json:"hostname"`
	UptimeS    int64                `json:"uptime_s"`
	CPUPct     float64              `json:"cpu_pct"`
	RAMUsedMB  int64                `json:"ram_used_mb"`
	RAMTotalMB int64                `json:"ram_total_mb"`
	DiskFreeGB float64              `json:"disk_free_gb"`
	Interfaces []HeartbeatInterface `json:"interfaces"`
}

// ─────────────────────────────────────────────
// COMANDOS DE REDE
// ─────────────────────────────────────────────

// CmdNetSetIPPayload é o corpo do cmd.net.set_ip.
type CmdNetSetIPPayload struct {
	InterfaceName    string `json:"interface_name"`
	IP               string `json:"ip"`
	Mask             string `json:"mask"`
	Gateway          string `json:"gateway"`
	DNSPrimary       string `json:"dns_primary"`
	DNSSecondary     string `json:"dns_secondary"`
	RollbackTimeoutS int    `json:"rollback_timeout_s"`
}

// CmdNetSetDHCPPayload é o corpo do cmd.net.set_dhcp.
type CmdNetSetDHCPPayload struct {
	InterfaceName string `json:"interface_name"`
}

// ─────────────────────────────────────────────
// COMANDOS DE COMPARTILHAMENTOS
// ─────────────────────────────────────────────

// SharePermission representa uma permissão de compartilhamento.
type SharePermission struct {
	User  string `json:"user"`
	Level string `json:"level"` // "ro", "rw", "full", "none"
}

// ShareInfo descreve um compartilhamento SMB.
type ShareInfo struct {
	Name        string            `json:"name"`
	LocalPath   string            `json:"local_path"`
	Description string            `json:"description"`
	Permissions []SharePermission `json:"permissions"`
}

// CmdShareCreatePayload é o corpo do cmd.share.create.
type CmdShareCreatePayload struct {
	Name               string            `json:"name"`
	LocalPath          string            `json:"local_path"`
	Description        string            `json:"description"`
	CreateIfNotExists  bool              `json:"create_if_not_exists"`
	Permissions        []SharePermission `json:"permissions"`
}

// CmdShareDeletePayload é o corpo do cmd.share.delete.
type CmdShareDeletePayload struct {
	Name           string `json:"name"`
	DeleteLocalDir bool   `json:"delete_local_dir"`
}

// CmdShareSetPermsPayload é o corpo do cmd.share.set_perms.
type CmdShareSetPermsPayload struct {
	Name        string            `json:"name"`
	Permissions []SharePermission `json:"permissions"`
}

// ─────────────────────────────────────────────
// COMANDOS DE USUÁRIOS
// ─────────────────────────────────────────────

// UserInfo descreve um usuário local do Windows.
type UserInfo struct {
	Username    string    `json:"username"`
	FullName    string    `json:"full_name"`
	Description string    `json:"description"`
	Enabled     bool      `json:"enabled"`
	Groups      []string  `json:"groups"`
	PwdExpires  bool      `json:"pwd_expires"`
	LastLogon   time.Time `json:"last_logon"`
}

// CmdUserCreatePayload é o corpo do cmd.user.create.
type CmdUserCreatePayload struct {
	Username       string   `json:"username"`
	FullName       string   `json:"full_name"`
	Description    string   `json:"description"`
	Password       string   `json:"password"`
	Groups         []string `json:"groups"`
	PwdNeverExpires bool    `json:"pwd_never_expires"`
	MustChangePwd  bool     `json:"must_change_pwd"`
}

// CmdUserSetPasswordPayload é o corpo do cmd.user.set_password.
type CmdUserSetPasswordPayload struct {
	Username    string `json:"username"`
	NewPassword string `json:"new_password"`
}

// CmdUserToggleStatusPayload é o corpo do cmd.user.toggle_status.
type CmdUserToggleStatusPayload struct {
	Username string `json:"username"`
	Enabled  bool   `json:"enabled"`
}

// ─────────────────────────────────────────────
// RESULTADOS
// ─────────────────────────────────────────────

// ResultOKPayload é o corpo do result.ok.
type ResultOKPayload struct {
	RefMsgID string      `json:"ref_msg_id"`
	CmdType  string      `json:"cmd_type"`
	Data     interface{} `json:"data"`
}

// ResultError contém detalhes do erro.
type ResultError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
}

// ResultErrorPayload é o corpo do result.error.
type ResultErrorPayload struct {
	RefMsgID string      `json:"ref_msg_id"`
	CmdType  string      `json:"cmd_type"`
	Error    ResultError `json:"error"`
}

// ResultRollbackPayload é o corpo do result.rollback.
type ResultRollbackPayload struct {
	RefMsgID   string      `json:"ref_msg_id"`
	CmdType    string      `json:"cmd_type"`
	Reason     string      `json:"reason"`
	RevertedTo interface{} `json:"reverted_to"`
}

// ─────────────────────────────────────────────
// ALERTAS
// ─────────────────────────────────────────────

// AlertPayload é o corpo do agent.alert.
type AlertPayload struct {
	Hostname string `json:"hostname"`
	Severity string `json:"severity"` // "info", "warning", "critical"
	Code     string `json:"code"`
	Message  string `json:"message"`
}

// Severidades de alerta
const (
	AlertInfo     = "info"
	AlertWarning  = "warning"
	AlertCritical = "critical"
)

// Códigos de alerta
const (
	AlertDiskLow     = "DISK_LOW"
	AlertRAMHigh     = "RAM_HIGH"
	AlertNetworkLost = "NETWORK_LOST"
	AlertAgentRestart = "AGENT_RESTART"
	AlertTimeDrift   = "TIME_DRIFT"
)

// ─────────────────────────────────────────────
// CÓDIGOS DE ERRO
// ─────────────────────────────────────────────

const (
	ErrUnauthorized         = "UNAUTHORIZED"
	ErrCommandNotAllowed    = "COMMAND_NOT_ALLOWED"
	ErrInterfaceNotFound    = "INTERFACE_NOT_FOUND"
	ErrIPConflict           = "IP_CONFLICT"
	ErrShareAlreadyExists   = "SHARE_ALREADY_EXISTS"
	ErrShareNotFound        = "SHARE_NOT_FOUND"
	ErrUserAlreadyExists    = "USER_ALREADY_EXISTS"
	ErrUserNotFound         = "USER_NOT_FOUND"
	ErrInvalidPassword      = "INVALID_PASSWORD"
	ErrPermissionDenied     = "PERMISSION_DENIED"
	ErrPowerShellError      = "POWERSHELL_ERROR"
	ErrTimeout              = "TIMEOUT"
)
