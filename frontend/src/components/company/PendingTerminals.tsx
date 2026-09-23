// Seção de terminais pendentes de atribuição.
// Aparece automaticamente no topo do painel quando há terminais
// sem empresa definida. Some quando todos estiverem atribuídos.
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Sparkles, Building2, Check, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react'
import type { Company, Device } from '@/types'
import { assignDeviceToCompany } from '@/lib/api'
import { formatRelative, statusColor } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface PendingTerminalsProps {
  devices: Device[]      // apenas os sem empresa (company_id === null)
  companies: Company[]
}

export function PendingTerminals({ devices, companies }: PendingTerminalsProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (devices.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      {/* Header clicável para colapsar */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-amber-500/5 transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
          <Sparkles size={13} className="text-amber-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-300">
            {devices.length} terminal{devices.length !== 1 ? 'is' : ''} novo{devices.length !== 1 ? 's' : ''} sem empresa
          </p>
          <p className="text-xs text-amber-400/70">
            Atribua cada terminal a uma empresa para organizá-los no painel
          </p>
        </div>
        {collapsed
          ? <ChevronDown size={15} className="text-amber-400/50 shrink-0" />
          : <ChevronUp   size={15} className="text-amber-400/50 shrink-0" />}
      </button>

      {/* Lista de terminais pendentes */}
      {!collapsed && (
        <div className="border-t border-amber-500/20 divide-y divide-amber-500/10">
          {devices.map(device => (
            <PendingRow key={device.id} device={device} companies={companies} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Uma linha por terminal pendente ───────────────────────────
function PendingRow({ device, companies }: { device: Device; companies: Company[] }) {
  const queryClient = useQueryClient()
  const [companyId, setCompanyId] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const colors = statusColor(device.status)

  const assignMutation = useMutation({
    mutationFn: () => assignDeviceToCompany(device.id, companyId),
    onSuccess: () => {
      const name = companies.find(c => c.id === companyId)?.name ?? 'empresa'
      toast.success(`${device.hostname} atribuído a ${name}`)
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
    onError: () => toast.error('Falha ao atribuir terminal'),
  })

  // Dispensar oculta a linha localmente (sem alterar dados)
  // O terminal volta a aparecer ao recarregar.
  if (dismissed) return null

  return (
    <div className="flex items-center gap-4 px-5 py-3 group">

      {/* Status dot + info do terminal */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <span className={cn('w-2 h-2 rounded-full shrink-0', colors.dot)} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{device.hostname}</p>
          <p className="text-xs text-slate-500 truncate">
            {device.interfaces[0]?.ip ?? '—'} · {device.os} · conectado {formatRelative(device.last_seen)}
          </p>
        </div>
      </div>

      {/* Seletor de empresa + botão atribuir */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative">
          <Building2 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <select
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
            className="appearance-none text-xs bg-surface border border-surface-border rounded-lg pl-7 pr-6 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
          >
            <option value="" disabled>Selecionar empresa…</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>

        <button
          onClick={() => assignMutation.mutate()}
          disabled={!companyId || assignMutation.isPending}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            companyId
              ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30'
              : 'bg-surface text-slate-600 border border-surface-border cursor-not-allowed',
          )}
        >
          {assignMutation.isPending
            ? <Loader2 size={12} className="animate-spin" />
            : <Check size={12} />}
          Atribuir
        </button>

        {/* Dispensar (ocultar só nesta sessão) */}
        <button
          onClick={() => setDismissed(true)}
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-surface-hover transition-colors opacity-0 group-hover:opacity-100"
          title="Dispensar (oculta até próxima atualização)"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
