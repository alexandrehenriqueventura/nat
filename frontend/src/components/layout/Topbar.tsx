import { Bell, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { DashboardMetrics } from '@/types'

interface TopbarProps {
  metrics: DashboardMetrics
  sectionTitle?: string
}

export function Topbar({ metrics, sectionTitle = 'Dispositivos' }: TopbarProps) {
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await queryClient.invalidateQueries({ queryKey: ['devices'] })
    setTimeout(() => setRefreshing(false), 600)
  }

  const isConnected = true // TODO: ler do estado SSE real

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-6 bg-surface-card border-b border-surface-border">
      {/* Título da página atual */}
      <div>
        <h1 className="text-sm font-semibold text-white">{sectionTitle}</h1>
        <p className="text-xs text-slate-500">
          {metrics.online} online · {metrics.offline} offline · {metrics.alerts} alertas
        </p>
      </div>

      {/* Ações e status */}
      <div className="flex items-center gap-3">
        {/* Indicador de conexão com servidor */}
        <div className="flex items-center gap-1.5 text-xs">
          {isConnected
            ? <><Wifi size={13} className="text-green-400" /><span className="text-green-400">Servidor online</span></>
            : <><WifiOff size={13} className="text-red-400" /><span className="text-red-400">Servidor offline</span></>
          }
        </div>

        {/* Alertas */}
        {metrics.alerts > 0 && (
          <button className="relative p-2 rounded-lg hover:bg-surface-hover transition-colors">
            <Bell size={16} className="text-amber-400" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400" />
          </button>
        )}

        {/* Refresh manual */}
        <button
          onClick={handleRefresh}
          className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-slate-400 hover:text-white"
          title="Atualizar"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        </button>

        {/* Avatar do operador */}
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white cursor-pointer">
          OP
        </div>
      </div>
    </header>
  )
}
