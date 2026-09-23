// Tipos centrais que espelham o protocolo WebSocket e as
// respostas da REST API do Servidor Central.

// ─────────────────────────────────────────────
// EMPRESAS
// ─────────────────────────────────────────────

export interface Company {
  id: string
  name: string
  description: string
  color: string       // hex, ex: "#3b82f6"
  created_at: string
}

// ─────────────────────────────────────────────
// DISPOSITIVOS
// ─────────────────────────────────────────────

export type DeviceStatus = 'online' | 'offline' | 'alert'

export interface NetworkInterface {
  name: string
  ip: string
  mask: string
  gateway: string
  is_dhcp: boolean
  dns: string[]
  speed_mbps?: number
  status?: string
}

export interface Device {
  id: string
  hostname: string
  alias: string
  status: DeviceStatus
  os: string
  agent_ver: string
  last_seen: string        // ISO 8601
  uptime_s: number
  cpu_pct: number
  ram_used_mb: number
  ram_total_mb: number
  disk_free_gb: number
  interfaces: NetworkInterface[]
  alerts: DeviceAlert[]
  company_id: string | null   // null = terminal não associado a nenhuma empresa
}

export interface DeviceAlert {
  severity: 'info' | 'warning' | 'critical'
  code: string
  message: string
  ts: string
}

// ─────────────────────────────────────────────
// COMPARTILHAMENTOS
// ─────────────────────────────────────────────

export type PermissionLevel = 'ro' | 'rw' | 'full' | 'none'

export interface SharePermission {
  user: string
  level: PermissionLevel
}

export interface Share {
  name: string
  local_path: string
  description: string
  permissions: SharePermission[]
}

// ─────────────────────────────────────────────
// USUÁRIOS LOCAIS
// ─────────────────────────────────────────────

export interface LocalUser {
  username: string
  full_name: string
  description: string
  enabled: boolean
  groups: string[]
  pwd_expires: boolean
  last_logon: string | null
}

// ─────────────────────────────────────────────
// COMANDOS E RESULTADOS
// ─────────────────────────────────────────────

export type CommandStatus = 'pending' | 'ok' | 'error' | 'rollback'

export interface CommandResult {
  command_id: string
  cmd_type: string
  status: CommandStatus
  data?: Record<string, unknown>
  error?: {
    code: string
    message: string
  }
  rollback_reason?: string
  ts: string
}

// ─────────────────────────────────────────────
// PAYLOADS DE FORMULÁRIOS
// ─────────────────────────────────────────────

export interface SetIPPayload {
  interface_name: string
  ip: string
  mask: string
  gateway: string
  dns_primary: string
  dns_secondary: string
  rollback_timeout_s: number
}

export interface CreateSharePayload {
  name: string
  local_path: string
  description: string
  create_if_not_exists: boolean
  permissions: SharePermission[]
}

export interface CreateUserPayload {
  username: string
  full_name: string
  description: string
  password: string
  groups: string[]
  pwd_never_expires: boolean
  must_change_pwd: boolean
}

// ─────────────────────────────────────────────
// MÉTRICAS DO PAINEL
// ─────────────────────────────────────────────

export interface DashboardMetrics {
  total: number
  online: number
  offline: number
  alerts: number
}
