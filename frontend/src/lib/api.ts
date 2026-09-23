// Camada de API e comunicação direta com o Cloud Firestore.
// Substitui a antiga REST API por operações diretas no Firestore com sincronização em tempo real.

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  Device, Company, Share, LocalUser,
  SetIPPayload, CreateSharePayload, CreateUserPayload,
  CommandResult, DashboardMetrics, DeviceAlert, NetworkInterface,
} from '@/types'

// ─────────────────────────────────────────────
// HELPERS DE FORMATAÇÃO E STATUS
// ─────────────────────────────────────────────

function formatDeviceDoc(id: string, data: Record<string, unknown>): Device {
  const lastSeenRaw = data.last_seen
  let lastSeenISO = new Date(0).toISOString()

  if (lastSeenRaw instanceof Timestamp) {
    lastSeenISO = lastSeenRaw.toDate().toISOString()
  } else if (typeof lastSeenRaw === 'string') {
    lastSeenISO = lastSeenRaw
  } else if (lastSeenRaw && typeof (lastSeenRaw as { toDate?: () => Date }).toDate === 'function') {
    lastSeenISO = (lastSeenRaw as { toDate: () => Date }).toDate().toISOString()
  }

  // Verifica se está online (visto nos últimos 30 segundos)
  const lastSeenMs = new Date(lastSeenISO).getTime()
  const isOnline = Date.now() - lastSeenMs < 35_000

  let status: Device['status'] = isOnline ? 'online' : 'offline'

  const cpuPct = Number(data.cpu_pct || 0)
  const ramUsed = Number(data.ram_used_mb || 0)
  const ramTotal = Number(data.ram_total_mb || 0)
  const diskFree = Number(data.disk_free_gb || 0)

  const alerts: DeviceAlert[] = []

  if (isOnline) {
    if (cpuPct >= 90) {
      alerts.push({
        severity: 'critical',
        code: 'CPU_HIGH',
        message: 'CPU acima de 90%',
        ts: new Date().toISOString(),
      })
    }
    if (ramTotal > 0 && (ramUsed / ramTotal) >= 0.9) {
      alerts.push({
        severity: 'critical',
        code: 'RAM_HIGH',
        message: 'RAM acima de 90%',
        ts: new Date().toISOString(),
      })
    }
    if (diskFree > 0 && diskFree < 10) {
      alerts.push({
        severity: 'warning',
        code: 'DISK_LOW',
        message: 'Espaço em disco C: abaixo de 10 GB',
        ts: new Date().toISOString(),
      })
    }
    if (alerts.length > 0) {
      status = 'alert'
    }
  }

  return {
    id,
    hostname: (data.hostname as string) || id,
    alias: (data.alias as string) || (data.hostname as string) || id,
    status,
    os: (data.os as string) || 'Windows',
    agent_ver: (data.agent_ver as string) || '1.0.0',
    last_seen: lastSeenISO,
    uptime_s: Number(data.uptime_s || 0),
    cpu_pct: cpuPct,
    ram_used_mb: ramUsed,
    ram_total_mb: ramTotal,
    disk_free_gb: diskFree,
    interfaces: (data.interfaces as NetworkInterface[]) || [],
    alerts,
    company_id: (data.company_id as string) || null,
  }
}

// ─────────────────────────────────────────────
// EMPRESAS (CRUD FIRESTORE)
// ─────────────────────────────────────────────

export async function fetchCompanies(): Promise<Company[]> {
  try {
    const snap = await getDocs(query(collection(db, 'companies'), orderBy('name', 'asc')))
    return snap.docs.map(d => {
      const data = d.data()
      let createdAt = new Date().toISOString()
      if (data.created_at instanceof Timestamp) {
        createdAt = data.created_at.toDate().toISOString()
      }
      return {
        id: d.id,
        name: data.name || '',
        description: data.description || '',
        color: data.color || '#3b82f6',
        created_at: createdAt,
      }
    })
  } catch (err) {
    console.warn('Erro ao buscar empresas no Firestore:', err)
    return []
  }
}

export async function createCompany(data: Omit<Company, 'id' | 'created_at'>): Promise<Company> {
  const docRef = await addDoc(collection(db, 'companies'), {
    ...data,
    created_at: serverTimestamp(),
  })
  return {
    ...data,
    id: docRef.id,
    created_at: new Date().toISOString(),
  }
}

export async function updateCompany(id: string, data: Partial<Omit<Company, 'id' | 'created_at'>>): Promise<Company> {
  const ref = doc(db, 'companies', id)
  await updateDoc(ref, {
    ...data,
    updated_at: serverTimestamp(),
  })
  const snap = await getDoc(ref)
  const snapData = snap.data() || {}
  return {
    id,
    name: snapData.name || '',
    description: snapData.description || '',
    color: snapData.color || '#3b82f6',
    created_at: new Date().toISOString(),
  }
}

export async function deleteCompany(id: string): Promise<void> {
  // Exclui a empresa
  await deleteDoc(doc(db, 'companies', id))

  // Desassocia os terminais vinculados
  const devSnap = await getDocs(collection(db, 'devices'))
  const batch = writeBatch(db)
  let count = 0

  devSnap.docs.forEach(d => {
    if (d.data().company_id === id) {
      batch.update(d.ref, { company_id: null })
      count++
    }
  })

  if (count > 0) {
    await batch.commit()
  }
}

// ─── Associar terminal a empresa ─────────────────────────────

export async function assignDeviceToCompany(
  deviceId: string,
  companyId: string | null,
): Promise<void> {
  await updateDoc(doc(db, 'devices', deviceId), {
    company_id: companyId,
    updated_at: serverTimestamp(),
  })
}

export async function bulkAssignDevicesToCompany(
  deviceIds: string[],
  companyId: string,
  unlinkIds: string[] = [],
): Promise<void> {
  const batch = writeBatch(db)
  deviceIds.forEach(id => {
    batch.update(doc(db, 'devices', id), { company_id: companyId, updated_at: serverTimestamp() })
  })
  unlinkIds.forEach(id => {
    batch.update(doc(db, 'devices', id), { company_id: null, updated_at: serverTimestamp() })
  })
  await batch.commit()
}

export async function bulkSetCompany(
  deviceIds: string[],
  companyId: string | null,
): Promise<void> {
  const batch = writeBatch(db)
  deviceIds.forEach(id => {
    batch.update(doc(db, 'devices', id), { company_id: companyId, updated_at: serverTimestamp() })
  })
  await batch.commit()
}

// ─────────────────────────────────────────────
// DISPOSITIVOS (FIRESTORE)
// ─────────────────────────────────────────────

export async function fetchDevices(): Promise<Device[]> {
  try {
    const snap = await getDocs(collection(db, 'devices'))
    return snap.docs.map(d => formatDeviceDoc(d.id, d.data()))
  } catch (err) {
    console.warn('Erro ao buscar dispositivos no Firestore:', err)
    return []
  }
}

export async function fetchDevice(id: string): Promise<Device> {
  const snap = await getDoc(doc(db, 'devices', id))
  if (!snap.exists()) throw new Error('Dispositivo não encontrado')
  return formatDeviceDoc(snap.id, snap.data())
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
// COMANDOS EM TEMPO REAL VIA FIRESTORE QUEUE
// ─────────────────────────────────────────────

export async function sendCommand(
  deviceId: string,
  cmdType: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 25_000,
): Promise<CommandResult> {
  // 1. Cria o documento na subcoleção de comandos do dispositivo
  const commandsCol = collection(db, 'devices', deviceId, 'commands')
  const docRef = await addDoc(commandsCol, {
    cmd_type: cmdType,
    payload,
    status: 'pending',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  })

  // 2. Aguarda a resolução do comando pelo agente via listener em tempo real
  return new Promise<CommandResult>((resolve) => {
    let resolved = false

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        unsubscribe()
        resolve({
          command_id: docRef.id,
          cmd_type: cmdType,
          status: 'error',
          error: {
            code: 'TIMEOUT',
            message: 'O terminal não respondeu ao comando dentro do prazo de 25s.',
          },
          ts: new Date().toISOString(),
        })
      }
    }, timeoutMs)

    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (!snap.exists()) return
      const data = snap.data()
      const status = data.status as string

      if (status === 'completed' || status === 'ok' || status === 'error' || status === 'rollback') {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          unsubscribe()

          resolve({
            command_id: docRef.id,
            cmd_type: cmdType,
            status: status === 'completed' ? 'ok' : (status as CommandResult['status']),
            data: data.result_data || data.data || {},
            error: data.error,
            ts: new Date().toISOString(),
          })
        }
      }
    }, (err) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timer)
        unsubscribe()
        resolve({
          command_id: docRef.id,
          cmd_type: cmdType,
          status: 'error',
          error: { code: 'FIRESTORE_ERROR', message: err.message },
          ts: new Date().toISOString(),
        })
      }
    })
  })
}

// ─────────────────────────────────────────────
// AÇÕES DE REDE
// ─────────────────────────────────────────────

export async function setDeviceIP(deviceId: string, payload: SetIPPayload): Promise<CommandResult> {
  return sendCommand(deviceId, 'cmd.net.set_ip', payload as unknown as Record<string, unknown>)
}

export async function setDeviceDHCP(deviceId: string, interfaceName: string): Promise<CommandResult> {
  return sendCommand(deviceId, 'cmd.net.set_dhcp', { interface_name: interfaceName })
}

// ─────────────────────────────────────────────
// COMPARTILHAMENTOS
// ─────────────────────────────────────────────

export async function fetchShares(deviceId: string): Promise<Share[]> {
  const result = await sendCommand(deviceId, 'cmd.share.list', {})
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
  return sendCommand(deviceId, 'cmd.share.create', payload as unknown as Record<string, unknown>)
}

export async function deleteShare(deviceId: string, shareName: string, deleteLocalDir = false): Promise<CommandResult> {
  return sendCommand(deviceId, 'cmd.share.delete', { name: shareName, delete_local_dir: deleteLocalDir })
}

// ─────────────────────────────────────────────
// USUÁRIOS
// ─────────────────────────────────────────────

export async function fetchUsers(deviceId: string): Promise<LocalUser[]> {
  const result = await sendCommand(deviceId, 'cmd.user.list', {})
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
  return sendCommand(deviceId, 'cmd.user.create', payload as unknown as Record<string, unknown>)
}

export async function toggleUserStatus(deviceId: string, username: string, enabled: boolean): Promise<CommandResult> {
  return sendCommand(deviceId, 'cmd.user.toggle_status', { username, enabled })
}

export async function resetUserPassword(deviceId: string, username: string, newPassword: string): Promise<CommandResult> {
  return sendCommand(deviceId, 'cmd.user.set_password', { username, new_password: newPassword })
}
