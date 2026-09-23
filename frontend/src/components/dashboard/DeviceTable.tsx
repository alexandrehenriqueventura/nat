import { useState } from 'react'
import { Search, ChevronRight, AlertTriangle, Check, X, Building2, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Company, Device } from '@/types'
import { statusColor, statusLabel, formatRelative, barColor } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { CompanyBadge } from '@/components/company/CompanyBadge'
import { bulkSetCompany } from '@/lib/api'

interface DeviceTableProps {
  devices: Device[]
  companies: Company[]
  isLoading: boolean
  searchQuery: string
  onSearchChange: (q: string) => void
  onSelect: (device: Device) => void
}

export function DeviceTable({
  devices, companies, isLoading, searchQuery, onSearchChange, onSelect,
}: DeviceTableProps) {
  const queryClient = useQueryClient()

  // ── Seleção em lote ────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCompanyId, setBulkCompanyId] = useState<string>('')

  const toggleRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === devices.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(devices.map(d => d.id)))
    }
  }

  const clearSelection = () => { setSelected(new Set()); setBulkCompanyId('') }

  const bulkMutation = useMutation({
    mutationFn: () => bulkSetCompany([...selected], bulkCompanyId || null),
    onSuccess: () => {
      const name = bulkCompanyId
        ? companies.find(c => c.id === bulkCompanyId)?.name
        : 'nenhuma empresa'
      toast.success(`${selected.size} terminal${selected.size !== 1 ? 'is' : ''} associado${selected.size !== 1 ? 's' : ''} a ${name}`)
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      clearSelection()
    },
    onError: () => toast.error('Falha ao associar terminais'),
  })

  const allSelected    = devices.length > 0 && selected.size === devices.length
  const someSelected   = selected.size > 0 && selected.size < devices.length
  const hasSelection   = selected.size > 0

  // ── Skeleton ───────────────────────────────
  if (isLoading) {
    return (
      <div className="card space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-surface-hover animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="card p-0 overflow-hidden">

      {/* ── Barra de busca + contagem ───────── */}
      <div className="flex items-center gap-3 p-4 border-b border-surface-border">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por hostname, alias ou IP..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="input pl-9"
          />
        </div>
        <span className="text-xs text-slate-500">
          {devices.length} terminal{devices.length !== 1 ? 'is' : ''}
          {hasSelection && ` · ${selected.size} selecionado${selected.size !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* ── Barra de ação em lote ───────────── */}
      {hasSelection && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-600/10 border-b border-blue-500/20 animate-pulse-slow">
          <Building2 size={14} className="text-blue-400 shrink-0" />
          <span className="text-xs font-medium text-blue-300">
            {selected.size} terminal{selected.size !== 1 ? 'is' : ''} selecionado{selected.size !== 1 ? 's' : ''}
          </span>

          {/* Dropdown de empresa */}
          <select
            value={bulkCompanyId}
            onChange={e => setBulkCompanyId(e.target.value)}
            className="ml-auto text-xs bg-surface border border-surface-border rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="">— Remover empresa —</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Aplicar */}
          <button
            onClick={() => bulkMutation.mutate()}
            disabled={bulkMutation.isPending}
            className="btn-primary py-1.5 text-xs shrink-0"
          >
            {bulkMutation.isPending
              ? <Loader2 size={13} className="animate-spin" />
              : <Check size={13} />}
            Aplicar
          </button>

          {/* Limpar seleção */}
          <button
            onClick={clearSelection}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-slate-400 hover:text-white transition-colors"
            title="Cancelar seleção"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Tabela ─────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border">
              {/* Checkbox de cabeçalho */}
              <th className="px-4 py-3 w-10">
                <div
                  onClick={toggleAll}
                  className={cn(
                    'w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-colors',
                    allSelected   ? 'bg-blue-600 border-blue-600'
                    : someSelected ? 'bg-blue-600/50 border-blue-600'
                    :                'border-slate-600 hover:border-slate-400',
                  )}
                >
                  {(allSelected || someSelected) && (
                    <Check size={10} className="text-white" strokeWidth={3} />
                  )}
                </div>
              </th>
              {['Status', 'Dispositivo', 'Empresa', 'IP', 'CPU', 'RAM', 'Disco Livre', 'Visto', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-slate-500 text-sm">
                  Nenhum terminal encontrado
                </td>
              </tr>
            )}

            {devices.map(device => {
              const colors   = statusColor(device.status)
              const ramPct   = device.ram_total_mb > 0
                ? Math.round((device.ram_used_mb / device.ram_total_mb) * 100) : 0
              const isChecked = selected.has(device.id)

              return (
                <tr
                  key={device.id}
                  onClick={() => onSelect(device)}
                  className={cn(
                    'border-b border-surface-border/50 cursor-pointer transition-colors group',
                    isChecked
                      ? 'bg-blue-600/5 hover:bg-blue-600/10'
                      : 'hover:bg-surface-hover',
                  )}
                >
                  {/* Checkbox da linha */}
                  <td className="px-4 py-3.5" onClick={e => toggleRow(device.id, e)}>
                    <div className={cn(
                      'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                      isChecked
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-slate-600 hover:border-slate-400',
                    )}>
                      {isChecked && <Check size={10} className="text-white" strokeWidth={3} />}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full', colors.dot,
                        device.status === 'online' && 'shadow-[0_0_6px_currentColor]')} />
                      <span className={cn('text-xs font-medium', colors.text)}>
                        {statusLabel(device.status)}
                      </span>
                    </div>
                  </td>

                  {/* Dispositivo */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="text-sm font-medium text-white">{device.hostname}</p>
                        <p className="text-xs text-slate-500">{device.alias}</p>
                      </div>
                      {device.alerts.length > 0 && (
                        <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                      )}
                    </div>
                  </td>

                  {/* Empresa */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <CompanyBadge company={companies.find(c => c.id === device.company_id)} />
                  </td>

                  {/* IP */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <code className="text-xs text-slate-300 bg-surface px-2 py-0.5 rounded">
                      {device.interfaces[0]?.ip ?? '—'}
                    </code>
                  </td>

                  {/* CPU */}
                  <td className="px-4 py-3.5">
                    {device.status !== 'offline' ? (
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <div className="flex-1 h-1.5 bg-surface-hover rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', barColor(device.cpu_pct))}
                            style={{ width: `${device.cpu_pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 w-8 text-right">{Math.round(device.cpu_pct)}%</span>
                      </div>
                    ) : <span className="text-slate-600 text-xs">—</span>}
                  </td>

                  {/* RAM */}
                  <td className="px-4 py-3.5">
                    {device.status !== 'offline' ? (
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <div className="flex-1 h-1.5 bg-surface-hover rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', barColor(ramPct))}
                            style={{ width: `${ramPct}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 w-8 text-right">{ramPct}%</span>
                      </div>
                    ) : <span className="text-slate-600 text-xs">—</span>}
                  </td>

                  {/* Disco */}
                  <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-400">
                    {device.status !== 'offline' ? `${device.disk_free_gb.toFixed(0)} GB` : '—'}
                  </td>

                  {/* Visto */}
                  <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-500">
                    {formatRelative(device.last_seen)}
                  </td>

                  {/* Seta */}
                  <td className="px-4 py-3.5">
                    <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
