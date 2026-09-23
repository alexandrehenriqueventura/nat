// Camada de abstração de API.
//
// USE_MOCK=true  → usa dados locais (desenvolvimento sem servidor)
// USE_MOCK=false → faz chamadas reais para o Servidor Go
//
// Para mudar de mock para real, basta trocar a variável abaixo.

import type {
  Device, Company, Share, LocalUser,
  SetIPPayload, CreateSharePayload, CreateUserPayload,
  CommandResult, DashboardMetrics,
} from '@/types'
import {
  MOCK_DEVICES, MOCK_COMPANIES, MOCK_SHARES, MOCK_USERS,
} from './mock'

const USE_MOCK = false
const API_BASE = '/api'

// Estado mutável do mock (permite criar/editar/excluir sem recarregar)
let _devices   = [...MOCK_DEVICES]
let _companies = [...MOCK_COMPANIES]

const delay = (ms = 500) => new Promise(r => setTimeout(r, ms))

const mockCommandResult = async (
  cmd_type: string,
  status: CommandResult['status'] = 'ok',
  data: Record<string, unknown> = {},
): Promise<CommandResult> => {
  await delay(1500)
  return { command_id: `mock-${Date.now()}`, cmd_type, status, data, ts: new Date().toISOString() }
}

// ─────────────────────────────────────────────
// EMPRESAS
// ─────────────────────────────────────────────

export async function fetchCompanies(): Promise<Company[]> {
  if (USE_MOCK) {
    await delay(300)
    return [..._companies]
  }
  const res = await fetch(`${API_BASE}/companies`)
  if (!res.ok) throw new Error('Falha ao buscar empresas')
  return res.json()
}

export async function createCompany(data: Omit<Company, 'id' | 'created_at'>): Promise<Company> {
  if (USE_MOCK) {
    await delay(400)
    const company: Company = {
      ...data,
      id: `empresa-${Date.now()}`,
      created_at: new Date().toISOString(),
    }
    _companies = [..._companies, company]
    return company
  }
  const res = await fetch(`${API_BASE}/companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || 'Falha ao criar empresa')
  }
  return res.json()
}

export async function updateCompany(id: string, data: Partial<Omit<Company, 'id' | 'created_at'>>): Promise<Company> {
  if (USE_MOCK) {
    await delay(400)
    _companies = _companies.map(c => c.id === id ? { ...c, ...data } : c)
    return _companies.find(c => c.id === id)!
  }
  const res = await fetch(`${API_BASE}/companies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || 'Falha ao atualizar empresa')
  }
  return res.json()
}

export async function deleteCompany(id: string): Promise<void> {
  if (USE_MOCK) {
    await delay(400)
    _companies = _companies.filter(c => c.id !== id)
    // Desassocia terminais que pertenciam a esta empresa
    _devices = _devices.map(d => d.company_id === id ? { ...d, company_id: null } : d)
    return
  }
  const res = await fetch(`${API_BASE}/companies/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || 'Falha ao excluir empresa')
  }
}

// ─── Associar terminal a empresa ─────────────────────────────

export async function assignDeviceToCompany(
  deviceId: string,
  companyId: string | null,
): Promise<void> {
  if (USE_MOCK) {
    await delay(400)
    _devices = _devices.map(d =>
      d.id === deviceId ? { ...d, company_id: companyId } : d,
    )
    return
  }
  const res = await fetch(`${API_BASE}/devices/${deviceId}/company`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_id: companyId }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || 'Falha ao associar empresa')
  }
}

// Atribui vários terminais a uma empresa de uma vez.
// deviceIds = lista de IDs a associar à empresa
// unlinkIds = lista de IDs a desassociar (setar company_id = null)
export async function bulkAssignDevicesToCompany(
  deviceIds: string[],
  companyId: string,
  unlinkIds: string[] = [],
): Promise<void> {
  if (USE_MOCK) {
    await delay(500)
    _devices = _devices.map(d => {
      if (deviceIds.includes(d.id))  return { ...d, company_id: companyId }
      if (unlinkIds.includes(d.id))  return { ...d, company_id: null }
      return d
    })
    return
  }
  const res = await fetch(`${API_BASE}/companies/${companyId}/bulk-assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assign: deviceIds, unlink: unlinkIds }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || 'Falha ao associar terminais')
  }
}

// Associa vários terminais a uma empresa (seleção em lote da tabela)
export async function bulkSetCompany(
  deviceIds: string[],
  companyId: string | null,
): Promise<void> {
  if (USE_MOCK) {
    await delay(500)
    _devices = _devices.map(d =>
      deviceIds.includes(d.id) ? { ...d, company_id: companyId } : d,
    )
    return
  }
  const res = await fetch(`${API_BASE}/devices/bulk-company`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: deviceIds, company_id: companyId }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || 'Falha na associação em lote')
  }
}

// ─────────────────────────────────────────────
// DISPOSITIVOS
// ─────────────────────────────────────────────

export async function fetchDevices(): Promise<Device[]> {
  if (USE_MOCK) {
    await delay(400)
    return _devices.map(d => ({
      ...d,
      cpu_pct: d.status === 'online' || d.status === 'alert'
        ? Math.min(100, Math.max(5, d.cpu_pct + (Math.random() * 10 - 5)))
        : 0,
      last_seen: d.status !== 'offline' ? new Date().toISOString() : d.last_seen,
    }))
  }
  const res = await fetch(`${API_BASE}/devices`)
  if (!res.ok) throw new Error('Falha ao buscar dispositivos')
  return res.json()
}

export async function fetchDevice(id: string): Promise<Device> {
  if (USE_MOCK) {
    await delay(300)
    const device = _devices.find(d => d.id === id)
    if (!device) throw new Error('Dispositivo não encontrado')
    return device
  }
  const res = await fetch(`${API_BASE}/devices/${id}`)
  if (!res.ok) throw new Error('Falha ao buscar dispositivo')
  return res.json()
}

export function getDashboardMetrics(devices: Device[]): DashboardMetrics {
  return {
    total:   devices.length,
    online:  devices.filter(d => d.status === 'online').length,
    offline: devices.filter(d => d.status === 'offline').length,
    alerts:  devices.filter(d => d.status === 'alert' || d.alerts.length > 0).length,
  }
}

// ─────────────────────────────────────────────
// REDE
// ─────────────────────────────────────────────

export async function setDeviceIP(deviceId: string, payload: SetIPPayload): Promise<CommandResult> {
  if (USE_MOCK) {
    const isRollback = payload.ip === '192.168.1.99'
    return mockCommandResult('cmd.net.set_ip', isRollback ? 'rollback' : 'ok',
      isRollback ? {} : { new_ip: payload.ip, interface_name: payload.interface_name })
  }
  const res = await fetch(`${API_BASE}/devices/${deviceId}/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'cmd.net.set_ip', payload }),
  })
  return res.json()
}

export async function setDeviceDHCP(deviceId: string, interfaceName: string): Promise<CommandResult> {
  if (USE_MOCK) {
    return mockCommandResult('cmd.net.set_dhcp', 'ok', {
      ip_obtained: '192.168.1.' + Math.floor(Math.random() * 50 + 100),
      interface_name: interfaceName,
    })
  }
  const res = await fetch(`${API_BASE}/devices/${deviceId}/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'cmd.net.set_dhcp', payload: { interface_name: interfaceName } }),
  })
  return res.json()
}

// ─────────────────────────────────────────────
// COMPARTILHAMENTOS
// ─────────────────────────────────────────────

export async function fetchShares(deviceId: string): Promise<Share[]> {
  if (USE_MOCK) {
    await delay(500)
    return MOCK_SHARES[deviceId] ?? []
  }
  const res = await fetch(`${API_BASE}/devices/${deviceId}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'cmd.share.list', payload: {} }),
  })
  if (!res.ok) return []
  const result: CommandResult = await res.json()
  if (result.status === 'ok' && result.data?.raw) {
    try {
      const parsed = JSON.parse(result.data.raw as string)
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      return []
    }
  }
  return []
}

export async function createShare(deviceId: string, payload: CreateSharePayload): Promise<CommandResult> {
  if (USE_MOCK) return mockCommandResult('cmd.share.create', 'ok', { name: payload.name, local_path: payload.local_path, dir_created: payload.create_if_not_exists })
  const res = await fetch(`${API_BASE}/devices/${deviceId}/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'cmd.share.create', payload }),
  })
  return res.json()
}

export async function deleteShare(deviceId: string, shareName: string, deleteLocalDir = false): Promise<CommandResult> {
  if (USE_MOCK) return mockCommandResult('cmd.share.delete', 'ok', { deleted: shareName })
  const res = await fetch(`${API_BASE}/devices/${deviceId}/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'cmd.share.delete', payload: { name: shareName, delete_local_dir: deleteLocalDir } }),
  })
  return res.json()
}

// ─────────────────────────────────────────────
// USUÁRIOS
// ─────────────────────────────────────────────

export async function fetchUsers(deviceId: string): Promise<LocalUser[]> {
  if (USE_MOCK) {
    await delay(500)
    return MOCK_USERS[deviceId] ?? []
  }
  const res = await fetch(`${API_BASE}/devices/${deviceId}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'cmd.user.list', payload: {} }),
  })
  if (!res.ok) return []
  const result: CommandResult = await res.json()
  if (result.status === 'ok' && result.data?.raw) {
    try {
      const parsed = JSON.parse(result.data.raw as string)
      const list = Array.isArray(parsed) ? parsed : [parsed]
      return list.map((u: Record<string, unknown>) => ({
        username: (u.Name || u.username || '') as string,
        full_name: (u.FullName || u.full_name || '') as string,
        description: (u.Description || u.description || '') as string,
        enabled: (u.Enabled ?? u.enabled ?? true) as boolean,
        groups: ['Usuários'],
        pwd_expires: (u.PwdExpires ?? u.pwd_expires ?? false) as boolean,
        last_logon: (u.LastLogon ?? u.last_logon ?? null) as string | null,
      }))
    } catch {
      return []
    }
  }
  return []
}

export async function createUser(deviceId: string, payload: CreateUserPayload): Promise<CommandResult> {
  if (USE_MOCK) return mockCommandResult('cmd.user.create', 'ok', { username: payload.username, created: true })
  const res = await fetch(`${API_BASE}/devices/${deviceId}/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'cmd.user.create', payload }),
  })
  return res.json()
}

export async function toggleUserStatus(deviceId: string, username: string, enabled: boolean): Promise<CommandResult> {
  if (USE_MOCK) return mockCommandResult('cmd.user.toggle_status', 'ok', { username, enabled })
  const res = await fetch(`${API_BASE}/devices/${deviceId}/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'cmd.user.toggle_status', payload: { username, enabled } }),
  })
  return res.json()
}

export async function resetUserPassword(deviceId: string, username: string, newPassword: string): Promise<CommandResult> {
  if (USE_MOCK) return mockCommandResult('cmd.user.set_password', 'ok', { username, updated: true })
  const res = await fetch(`${API_BASE}/devices/${deviceId}/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'cmd.user.set_password', payload: { username, new_password: newPassword } }),
  })
  return res.json()
}
