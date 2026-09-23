// Utilitários reutilizáveis em todo o projeto.
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { DeviceStatus } from '@/types'

// Combina classes Tailwind sem conflitos
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formata bytes para GB
export function bytesToGB(mb: number): string {
  return (mb / 1024).toFixed(1) + ' GB'
}

// Formata uptime em segundos para string legível
export function formatUptime(seconds: number): string {
  if (seconds === 0) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// Formata data relativa (ex: "há 2 min")
export function formatRelative(isoDate: string): string {
  const diff = (Date.now() - new Date(isoDate).getTime()) / 1000
  if (diff < 60)  return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`
  return `há ${Math.floor(diff / 86400)}d`
}

// Retorna classes de cor pelo status do dispositivo
export function statusColor(status: DeviceStatus) {
  return {
    online:  { dot: 'bg-green-500',  text: 'text-green-400',  bg: 'bg-green-500/10'  },
    offline: { dot: 'bg-red-500',    text: 'text-red-400',    bg: 'bg-red-500/10'    },
    alert:   { dot: 'bg-amber-500',  text: 'text-amber-400',  bg: 'bg-amber-500/10'  },
  }[status]
}

// Rótulo em português para o status
export function statusLabel(status: DeviceStatus): string {
  return { online: 'Online', offline: 'Offline', alert: 'Alerta' }[status]
}

// Porcentagem para cor de barra de progresso
export function barColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-amber-500'
  return 'bg-blue-500'
}
