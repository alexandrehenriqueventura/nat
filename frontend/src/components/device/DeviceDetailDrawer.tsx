import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, Monitor, Wifi, FolderOpen, Users, AlertTriangle, Clock, Building2 } from 'lucide-react'
import type { Company, Device } from '@/types'
import { statusColor, statusLabel, formatUptime, barColor } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { NetworkTab } from './tabs/NetworkTab'
import { SharesTab }  from './tabs/SharesTab'
import { UsersTab }   from './tabs/UsersTab'
import { CompanyBadge } from '@/components/company/CompanyBadge'
import { assignDeviceToCompany } from '@/lib/api'

type Tab = 'network' | 'shares' | 'users'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'network', label: 'Rede',              icon: Wifi       },
  { id: 'shares',  label: 'Compartilhamentos', icon: FolderOpen },
  { id: 'users',   label: 'Usuários',          icon: Users      },
]

interface DeviceDetailDrawerProps {
  device: Device
  companies: Company[]
  onClose: () => void
}

export function DeviceDetailDrawer({ device, companies, onClose }: DeviceDetailDrawerProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('network')
  const colors = statusColor(device.status)
  const ramPct = device.ram_total_mb > 0
    ? Math.round((device.ram_used_mb / device.ram_total_mb) * 100)
    : 0

  const currentCompany = companies.find(c => c.id === device.company_id) ?? null

  const assignMutation = useMutation({
    mutationFn: (companyId: string | null) => assignDeviceToCompany(device.id, companyId),
    onSuccess: (_data, companyId) => {
      const name = companyId ? companies.find(c => c.id === companyId)?.name : 'nenhuma empresa'
      toast.success(`Terminal associado a ${name}`)
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
    onError: () => toast.error('Falha ao associar empresa'),
  })

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-surface-card border-l border-surface-border z-50 flex flex-col animate-slide-in-right shadow-2xl">

        {/* Header do drawer */}
        <div className="flex items-start justify-between p-5 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', colors.bg)}>
              <Monitor size={18} className={colors.text} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">{device.hostname}</h2>
              <p className="text-xs text-slate-500">{device.alias}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-slate-400">
            <X size={16} />
          </button>
        </div>

        {/* Métricas rápidas */}
        <div className="px-5 py-4 border-b border-surface-border">
          {/* Status + OS */}
          <div className="flex items-center justify-between mb-3">
            <span className={cn('badge', {
              'badge-online':  device.status === 'online',
              'badge-offline': device.status === 'offline',
              'badge-alert':   device.status === 'alert',
            })}>
              <span className={cn('w-1.5 h-1.5 rounded-full', colors.dot)} />
              {statusLabel(device.status)}
            </span>
            <span className="text-xs text-slate-500">{device.os}</span>
          </div>

          {/* Seletor de empresa */}
          <div className="flex items-center justify-between py-2.5 border-b border-surface-border/50 mb-3">
            <div className="flex items-center gap-2">
              <Building2 size={13} className="text-slate-500" />
              <span className="text-xs text-slate-400">Empresa</span>
            </div>
            <div className="flex items-center gap-2">
              <CompanyBadge company={currentCompany} />
              <select
                value={device.company_id ?? ''}
                onChange={e => assignMutation.mutate(e.target.value || null)}
                disabled={assignMutation.isPending}
                className="text-xs bg-surface border border-surface-border rounded-lg px-2 py-1 text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                title="Associar a uma empresa"
              >
                <option value="">— Sem empresa —</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Alertas */}
          {device.alerts.length > 0 && (
            <div className="mb-4 space-y-2">
              {device.alerts.map((alert, i) => (
                <div key={i} className={cn(
                  'flex gap-2 rounded-lg p-2.5 text-xs',
                  alert.severity === 'critical' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300',
                )}>
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Métricas de hardware */}
          {device.status !== 'offline' && (
            <div className="grid grid-cols-3 gap-3">
              {/* CPU */}
              <MetricBar label="CPU" value={Math.round(device.cpu_pct)} pct={device.cpu_pct} unit="%" />
              {/* RAM */}
              <MetricBar label="RAM" value={ramPct} pct={ramPct} unit="%" />
              {/* Disco */}
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-1">Disco Livre</p>
                <p className="text-lg font-bold text-slate-200">{device.disk_free_gb.toFixed(0)}<span className="text-xs text-slate-500 ml-0.5">GB</span></p>
              </div>
            </div>
          )}

          {/* Uptime e IP */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-border/50">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock size={11} />
              Uptime: {formatUptime(device.uptime_s)}
            </div>
            <code className="text-xs text-slate-400">
              {device.interfaces[0]?.ip ?? '—'}
            </code>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-border px-5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-1 py-3 text-xs font-medium border-b-2 mr-5 transition-colors',
                activeTab === id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300',
              )}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Conteúdo da tab — com scroll */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'network' && <NetworkTab device={device} />}
          {activeTab === 'shares'  && <SharesTab  device={device} />}
          {activeTab === 'users'   && <UsersTab   device={device} />}
        </div>
      </div>
    </>
  )
}

function MetricBar({ label, value, pct, unit }: {
  label: string; value: number; pct: number; unit: string
}) {
  return (
    <div className="text-center">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-slate-200">
        {value}<span className="text-xs text-slate-500 ml-0.5">{unit}</span>
      </p>
      <div className="mt-1.5 h-1 bg-surface-hover rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barColor(pct))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
