import { Monitor, WifiOff, AlertTriangle, Server } from 'lucide-react'
import type { DashboardMetrics } from '@/types'
import { cn } from '@/lib/utils'

interface MetricCardsProps {
  metrics: DashboardMetrics
  onFilter: (status: 'online' | 'offline' | 'alert' | null) => void
  activeFilter: string | null
}

const cards = [
  { key: null,      icon: Server,        label: 'Total',    color: 'text-slate-400', bg: 'bg-slate-400/10', getValue: (m: DashboardMetrics) => m.total },
  { key: 'online',  icon: Monitor,       label: 'Online',   color: 'text-green-400', bg: 'bg-green-400/10', getValue: (m: DashboardMetrics) => m.online },
  { key: 'offline', icon: WifiOff,       label: 'Offline',  color: 'text-red-400',   bg: 'bg-red-400/10',   getValue: (m: DashboardMetrics) => m.offline },
  { key: 'alert',   icon: AlertTriangle, label: 'Alertas',  color: 'text-amber-400', bg: 'bg-amber-400/10', getValue: (m: DashboardMetrics) => m.alerts },
] as const

export function MetricCards({ metrics, onFilter, activeFilter }: MetricCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ key, icon: Icon, label, color, bg, getValue }) => (
        <button
          key={label}
          onClick={() => onFilter(key === activeFilter ? null : key)}
          className={cn(
            'card text-left transition-all hover:border-slate-500 cursor-pointer',
            activeFilter === key && key !== null && 'ring-2 ring-blue-500 border-blue-500/50',
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">{label}</span>
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', bg)}>
              <Icon size={15} className={color} />
            </div>
          </div>
          <p className={cn('text-3xl font-bold', color)}>{getValue(metrics)}</p>
        </button>
      ))}
    </div>
  )
}
