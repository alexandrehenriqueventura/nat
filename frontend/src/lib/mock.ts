// Mock data realista para desenvolvimento sem servidor.
// Simula variações de CPU/RAM para deixar o painel dinâmico.
import type { Company, Device, Share, LocalUser } from '@/types'

// ─── Empresas ────────────────────────────────────────────────
export const MOCK_COMPANIES: Company[] = [
  { id: 'empresa-alpha',  name: 'Alpha Varejo',     description: 'Rede de lojas de varejo',       color: '#3b82f6', created_at: '2024-01-10T00:00:00Z' },
  { id: 'empresa-beta',   name: 'Beta Mercados',    description: 'Supermercados e hortifrúti',     color: '#22c55e', created_at: '2024-03-05T00:00:00Z' },
  { id: 'empresa-gamma',  name: 'Gamma Farmácias',  description: 'Rede de farmácias',              color: '#a855f7', created_at: '2024-06-20T00:00:00Z' },
]

// ─── Dispositivos ────────────────────────────────────────────
export const MOCK_DEVICES: Device[] = [
  {
    id: 'caixa-01', hostname: 'CAIXA-01', alias: 'Caixa Frente Loja',
    status: 'online', os: 'Windows 11 Pro 23H2', agent_ver: '1.0.0',
    last_seen: new Date().toISOString(), uptime_s: 86400,
    cpu_pct: 12, ram_used_mb: 2048, ram_total_mb: 8192, disk_free_gb: 120,
    company_id: 'empresa-alpha',
    interfaces: [{ name: 'Ethernet', ip: '192.168.1.10', mask: '255.255.255.0', gateway: '192.168.1.1', is_dhcp: false, dns: ['8.8.8.8', '8.8.4.4'], status: 'up' }],
    alerts: [],
  },
  {
    id: 'caixa-02', hostname: 'CAIXA-02', alias: 'Caixa Balcão',
    status: 'online', os: 'Windows 10 Pro 22H2', agent_ver: '1.0.0',
    last_seen: new Date().toISOString(), uptime_s: 43200,
    cpu_pct: 45, ram_used_mb: 5200, ram_total_mb: 8192, disk_free_gb: 35,
    company_id: 'empresa-alpha',
    interfaces: [{ name: 'Ethernet', ip: '192.168.1.11', mask: '255.255.255.0', gateway: '192.168.1.1', is_dhcp: false, dns: ['8.8.8.8'], status: 'up' }],
    alerts: [{ severity: 'warning', code: 'DISK_LOW', message: 'Espaço em disco C: abaixo de 20% (35 GB livres)', ts: new Date().toISOString() }],
  },
  {
    id: 'caixa-03', hostname: 'CAIXA-03', alias: 'Caixa Estoque',
    status: 'offline', os: 'Windows 11 Pro 23H2', agent_ver: '1.0.0',
    last_seen: new Date(Date.now() - 5 * 60 * 1000).toISOString(), uptime_s: 0,
    cpu_pct: 0, ram_used_mb: 0, ram_total_mb: 16384, disk_free_gb: 0,
    company_id: 'empresa-beta',
    interfaces: [{ name: 'Ethernet', ip: '192.168.2.10', mask: '255.255.255.0', gateway: '192.168.2.1', is_dhcp: true, dns: [], status: 'down' }],
    alerts: [],
  },
  {
    id: 'caixa-04', hostname: 'CAIXA-04', alias: 'Gerência',
    status: 'alert', os: 'Windows 11 Pro 23H2', agent_ver: '1.0.0',
    last_seen: new Date().toISOString(), uptime_s: 172800,
    cpu_pct: 91, ram_used_mb: 15200, ram_total_mb: 16384, disk_free_gb: 8,
    company_id: 'empresa-beta',
    interfaces: [{ name: 'Ethernet', ip: '192.168.2.11', mask: '255.255.255.0', gateway: '192.168.2.1', is_dhcp: false, dns: ['8.8.8.8', '8.8.4.4'], status: 'up' }],
    alerts: [
      { severity: 'critical', code: 'RAM_HIGH',  message: 'RAM acima de 90% por mais de 5 minutos',   ts: new Date().toISOString() },
      { severity: 'warning',  code: 'DISK_LOW',  message: 'Espaço em disco C: abaixo de 10%',          ts: new Date().toISOString() },
    ],
  },
  {
    id: 'caixa-05', hostname: 'FARMACIA-01', alias: 'Caixa Principal',
    status: 'online', os: 'Windows 11 Pro 23H2', agent_ver: '1.0.0',
    last_seen: new Date().toISOString(), uptime_s: 28800,
    cpu_pct: 22, ram_used_mb: 3000, ram_total_mb: 8192, disk_free_gb: 90,
    company_id: 'empresa-gamma',
    interfaces: [{ name: 'Ethernet', ip: '10.0.0.10', mask: '255.255.255.0', gateway: '10.0.0.1', is_dhcp: false, dns: ['1.1.1.1'], status: 'up' }],
    alerts: [],
  },
  {
    id: 'servidor-loja', hostname: 'SERVER-LOJA', alias: 'Servidor Local',
    status: 'online', os: 'Windows Server 2022', agent_ver: '1.0.0',
    last_seen: new Date().toISOString(), uptime_s: 604800,
    cpu_pct: 8, ram_used_mb: 4096, ram_total_mb: 32768, disk_free_gb: 900,
    company_id: null,  // terminal sem empresa atribuída
    interfaces: [{ name: 'Ethernet', ip: '192.168.1.1', mask: '255.255.255.0', gateway: '192.168.1.254', is_dhcp: false, dns: ['8.8.8.8', '1.1.1.1'], status: 'up' }],
    alerts: [],
  },
]

// ─── Compartilhamentos por dispositivo ────────────────────────
export const MOCK_SHARES: Record<string, import('@/types').Share[]> = {
  'caixa-01': [
    { name: 'Estoque', local_path: 'C:\\Compartilhados\\Estoque', description: 'Pasta de controle de estoque', permissions: [{ user: 'usr_estoque', level: 'rw' }, { user: 'Everyone', level: 'ro' }] },
    { name: 'Relatorios', local_path: 'C:\\Compartilhados\\Relatorios', description: '', permissions: [{ user: 'Administrador', level: 'full' }] },
  ],
  'servidor-loja': [
    { name: 'Backup_Diario', local_path: 'D:\\Backup', description: 'Backup automático diário', permissions: [{ user: 'Administrador', level: 'full' }, { user: 'operador_caixa', level: 'ro' }] },
  ],
}

// ─── Usuários locais por dispositivo ─────────────────────────
export const MOCK_USERS: Record<string, import('@/types').LocalUser[]> = {
  'caixa-01': [
    { username: 'Administrador', full_name: 'Admin Padrão', description: '', enabled: true, groups: ['Administradores'], pwd_expires: false, last_logon: new Date().toISOString() },
    { username: 'operador_caixa', full_name: 'Caixa Turno 1', description: 'Terminal de Vendas', enabled: true, groups: ['Usuários'], pwd_expires: false, last_logon: new Date().toISOString() },
    { username: 'convidado', full_name: 'Visitante', description: '', enabled: false, groups: ['Usuários'], pwd_expires: true, last_logon: null },
  ],
  'caixa-02': [
    { username: 'Administrador', full_name: 'Admin Padrão', description: '', enabled: true, groups: ['Administradores'], pwd_expires: false, last_logon: new Date().toISOString() },
    { username: 'operador_balcao', full_name: 'Operador Balcão', description: '', enabled: true, groups: ['Usuários'], pwd_expires: false, last_logon: new Date().toISOString() },
  ],
}
