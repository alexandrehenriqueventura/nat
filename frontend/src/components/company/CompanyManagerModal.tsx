// Modal de gerenciamento de empresas com três modos:
//   'list'      → lista todas as empresas
//   'form'      → criar / editar empresa
//   'terminals' → atribuir terminais a uma empresa (checkboxes)
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  X, Plus, Pencil, Trash2, Building2, Check,
  Loader2, Monitor, MoveRight, ChevronLeft,
} from 'lucide-react'
import type { Company, Device } from '@/types'
import {
  fetchCompanies, createCompany, updateCompany, deleteCompany,
  fetchDevices, bulkAssignDevicesToCompany,
} from '@/lib/api'
import { CompanyDot, CompanyBadge } from './CompanyBadge'
import { statusColor } from '@/lib/utils'
import { cn } from '@/lib/utils'

const COLOR_PALETTE = [
  '#3b82f6', '#22c55e', '#a855f7', '#f59e0b',
  '#ef4444', '#06b6d4', '#f97316', '#ec4899',
  '#14b8a6', '#6366f1',
]

type Mode = 'list' | 'form' | 'terminals'

interface CompanyManagerModalProps {
  onClose: () => void
}

export function CompanyManagerModal({ onClose }: CompanyManagerModalProps) {
  const queryClient = useQueryClient()
  const [mode, setMode]               = useState<Mode>('list')
  const [activeCompany, setActiveCompany] = useState<Company | null>(null)
  const [form, setForm]               = useState({ name: '', description: '', color: COLOR_PALETTE[0] })

  // ─── queries ────────────────────────────────
  const { data: companies = [], isLoading: loadingCompanies } = useQuery({
    queryKey: ['companies'], queryFn: fetchCompanies,
  })
  const { data: devices = [] } = useQuery({
    queryKey: ['devices'], queryFn: fetchDevices,
  })

  const deviceCountByCompany = companies.reduce<Record<string, number>>((acc, c) => {
    acc[c.id] = devices.filter(d => d.company_id === c.id).length
    return acc
  }, {})

  // ─── mutations ──────────────────────────────
  const createMutation = useMutation({
    mutationFn: () => createCompany(form),
    onSuccess: c => {
      toast.success(`"${c.name}" criada`)
      invalidate(); backToList()
    },
    onError: () => toast.error('Falha ao criar empresa'),
  })

  const updateMutation = useMutation({
    mutationFn: () => updateCompany(activeCompany!.id, form),
    onSuccess: c => {
      toast.success(`"${c.name}" atualizada`)
      invalidate(); backToList()
    },
    onError: () => toast.error('Falha ao atualizar empresa'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCompany(id),
    onSuccess: (_, id) => {
      const name = companies.find(c => c.id === id)?.name
      toast.success(`"${name}" excluída`)
      invalidate()
    },
    onError: () => toast.error('Falha ao excluir empresa'),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['companies'] })
    queryClient.invalidateQueries({ queryKey: ['devices'] })
  }

  // ─── helpers de navegação ────────────────────
  const backToList = () => { setMode('list'); setActiveCompany(null); resetForm() }
  const resetForm  = () => setForm({ name: '', description: '', color: COLOR_PALETTE[0] })

  const openCreate = () => { resetForm(); setActiveCompany(null); setMode('form') }

  const openEdit = (c: Company) => {
    setActiveCompany(c)
    setForm({ name: c.name, description: c.description, color: c.color })
    setMode('form')
  }

  const openTerminals = (c: Company) => { setActiveCompany(c); setMode('terminals') }

  const handleDelete = (c: Company) => {
    const count = deviceCountByCompany[c.id] ?? 0
    const msg = count > 0
      ? `Excluir "${c.name}"? Os ${count} terminais associados ficarão sem empresa.`
      : `Excluir "${c.name}"?`
    if (!confirm(msg)) return
    deleteMutation.mutate(c.id)
  }

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error('Nome obrigatório')
    activeCompany ? updateMutation.mutate() : createMutation.mutate()
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  // ─── títulos dinâmicos ───────────────────────
  const titles: Record<Mode, string> = {
    list:      'Gerenciar Empresas',
    form:      activeCompany ? 'Editar Empresa' : 'Nova Empresa',
    terminals: `Terminais — ${activeCompany?.name ?? ''}`,
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-lg bg-surface-card rounded-2xl border border-surface-border shadow-2xl flex flex-col max-h-[88vh]">

          {/* ── Header ── */}
          <div className="flex items-center justify-between p-5 border-b border-surface-border shrink-0">
            <div className="flex items-center gap-2">
              {mode !== 'list' && (
                <button
                  onClick={backToList}
                  className="p-1.5 rounded-lg hover:bg-surface-hover text-slate-400 transition-colors mr-1"
                >
                  <ChevronLeft size={15} />
                </button>
              )}
              <div className="w-7 h-7 rounded-lg bg-blue-600/15 flex items-center justify-center">
                <Building2 size={13} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">{titles[mode]}</h2>
                {mode === 'list' && (
                  <p className="text-xs text-slate-500">{companies.length} empresa{companies.length !== 1 ? 's' : ''}</p>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-hover text-slate-400 transition-colors">
              <X size={15} />
            </button>
          </div>

          {/* ── Conteúdo ── */}
          <div className="flex-1 overflow-y-auto">
            {mode === 'list'      && <ListView companies={companies} loading={loadingCompanies} deviceCount={deviceCountByCompany} onEdit={openEdit} onDelete={handleDelete} onTerminals={openTerminals} deletePending={deleteMutation.isPending} />}
            {mode === 'form'      && <FormView form={form} setForm={setForm} activeCompany={activeCompany} />}
            {mode === 'terminals' && activeCompany && <TerminalsView company={activeCompany} devices={devices} companies={companies} onDone={backToList} />}
          </div>

          {/* ── Footer ── */}
          <div className="p-5 border-t border-surface-border shrink-0">
            {mode === 'list' && (
              <button onClick={openCreate} className="btn-primary w-full">
                <Plus size={14} /> Nova Empresa
              </button>
            )}
            {mode === 'form' && (
              <div className="flex gap-3">
                <button onClick={backToList} className="btn-ghost flex-1">Cancelar</button>
                <button
                  onClick={handleSubmit}
                  disabled={!form.name.trim() || isSubmitting}
                  className="btn-primary flex-1"
                >
                  {isSubmitting && <Loader2 size={13} className="animate-spin" />}
                  {activeCompany ? 'Salvar Alterações' : 'Criar Empresa'}
                </button>
              </div>
            )}
            {/* Footer do modo terminais está dentro do componente TerminalsView */}
          </div>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────
// MODO: LISTA DE EMPRESAS
// ─────────────────────────────────────────────

function ListView({ companies, loading, deviceCount, onEdit, onDelete, onTerminals, deletePending }: {
  companies: Company[]
  loading: boolean
  deviceCount: Record<string, number>
  onEdit: (c: Company) => void
  onDelete: (c: Company) => void
  onTerminals: (c: Company) => void
  deletePending: boolean
}) {
  if (loading) {
    return <div className="p-5 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-surface-hover animate-pulse" />)}</div>
  }

  if (companies.length === 0) {
    return (
      <div className="p-5 text-center py-12 text-slate-500 text-sm">
        <Building2 size={28} className="mx-auto mb-2 opacity-30" />
        Nenhuma empresa cadastrada ainda
      </div>
    )
  }

  return (
    <div className="p-5 space-y-2">
      {companies.map(c => (
        <div key={c.id} className="rounded-xl border border-surface-border bg-surface p-4 group">
          <div className="flex items-center gap-3">
            <CompanyDot color={c.color} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{c.name}</p>
              <p className="text-xs text-slate-500">
                {deviceCount[c.id] ?? 0} terminal{(deviceCount[c.id] ?? 0) !== 1 ? 'is' : ''}
                {c.description && ` · ${c.description}`}
              </p>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {/* Gerenciar terminais */}
              <button
                onClick={() => onTerminals(c)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 transition-colors"
                title="Gerenciar terminais"
              >
                <Monitor size={12} />
                Terminais
              </button>
              <button onClick={() => onEdit(c)} className="p-1.5 rounded-lg hover:bg-surface-hover text-slate-500 hover:text-slate-200 transition-colors" title="Editar">
                <Pencil size={13} />
              </button>
              <button onClick={() => onDelete(c)} disabled={deletePending} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors" title="Excluir">
                {deletePending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// MODO: FORMULÁRIO (CRIAR / EDITAR)
// ─────────────────────────────────────────────

function FormView({ form, setForm, activeCompany }: {
  form: { name: string; description: string; color: string }
  setForm: React.Dispatch<React.SetStateAction<typeof form>>
  activeCompany: Company | null
}) {
  return (
    <div className="p-5 space-y-4">
      <div>
        <label className="label">Nome da Empresa *</label>
        <input
          className="input" placeholder="Ex: Alpha Varejo"
          value={form.name} autoFocus
          onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
        />
      </div>
      <div>
        <label className="label">Descrição (opcional)</label>
        <input
          className="input" placeholder="Ex: Rede de lojas de varejo"
          value={form.description}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
        />
      </div>
      <div>
        <label className="label">Cor de identificação</label>
        <div className="flex items-center gap-2 flex-wrap">
          {COLOR_PALETTE.map(color => (
            <button key={color} type="button"
              onClick={() => setForm(p => ({ ...p, color }))}
              className={cn('w-7 h-7 rounded-full transition-transform hover:scale-110 flex items-center justify-center',
                form.color === color && 'ring-2 ring-white ring-offset-2 ring-offset-surface-card scale-110')}
              style={{ backgroundColor: color }}
            >
              {form.color === color && <Check size={12} className="text-white" />}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-slate-500">Preview:</span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ backgroundColor: form.color + '20', color: form.color, border: `1px solid ${form.color}40` }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: form.color }} />
            {form.name || 'Nome da Empresa'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MODO: GERENCIAR TERMINAIS
// ─────────────────────────────────────────────

function TerminalsView({ company, devices, companies, onDone }: {
  company: Company
  devices: Device[]
  companies: Company[]
  onDone: () => void
}) {
  const queryClient = useQueryClient()

  // IDs originalmente nesta empresa
  const originalIds = devices.filter(d => d.company_id === company.id).map(d => d.id)

  // Estado dos checkboxes
  const [selected, setSelected] = useState<Set<string>>(new Set(originalIds))

  // Recalcula quando os devices mudam
  useEffect(() => {
    setSelected(new Set(devices.filter(d => d.company_id === company.id).map(d => d.id)))
  }, [devices, company.id])

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleAll = (ids: string[]) => {
    setSelected(prev => {
      const allChecked = ids.every(id => prev.has(id))
      const next = new Set(prev)
      if (allChecked) ids.forEach(id => next.delete(id))
      else            ids.forEach(id => next.add(id))
      return next
    })
  }

  // Calcula diff
  const toAdd    = devices.filter(d => selected.has(d.id) && d.company_id !== company.id).map(d => d.id)
  const toRemove = devices.filter(d => !selected.has(d.id) && d.company_id === company.id).map(d => d.id)
  const hasChanges = toAdd.length > 0 || toRemove.length > 0

  const saveMutation = useMutation({
    mutationFn: () => bulkAssignDevicesToCompany(toAdd, company.id, toRemove),
    onSuccess: () => {
      toast.success(`Terminais de "${company.name}" atualizados`)
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      onDone()
    },
    onError: () => toast.error('Falha ao salvar associações'),
  })

  // Agrupa os terminais: desta empresa / de outras / sem empresa
  const thisCompany   = devices.filter(d => d.company_id === company.id)
  const otherCompany  = devices.filter(d => d.company_id && d.company_id !== company.id)
  const unassigned    = devices.filter(d => !d.company_id)

  const otherCompanyName = (d: Device) => companies.find(c => c.id === d.company_id)?.name

  return (
    <div className="flex flex-col">
      {/* Legenda do diff */}
      {hasChanges && (
        <div className="mx-5 mt-4 flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-xs text-blue-300">
          <MoveRight size={13} className="shrink-0" />
          <span>
            {toAdd.length > 0    && `${toAdd.length} para adicionar`}
            {toAdd.length > 0 && toRemove.length > 0 && ' · '}
            {toRemove.length > 0 && `${toRemove.length} para remover`}
          </span>
        </div>
      )}

      <div className="p-5 space-y-4 pb-0">

        {/* Grupo: Desta empresa */}
        {thisCompany.length > 0 && (
          <Group
            title={`Nesta empresa (${thisCompany.length})`}
            titleColor={company.color}
            devices={thisCompany}
            selected={selected}
            onToggle={toggle}
            onToggleAll={() => toggleAll(thisCompany.map(d => d.id))}
          />
        )}

        {/* Grupo: Sem empresa */}
        {unassigned.length > 0 && (
          <Group
            title={`Disponíveis — sem empresa (${unassigned.length})`}
            devices={unassigned}
            selected={selected}
            onToggle={toggle}
            onToggleAll={() => toggleAll(unassigned.map(d => d.id))}
          />
        )}

        {/* Grupo: De outras empresas */}
        {otherCompany.length > 0 && (
          <Group
            title={`De outras empresas (${otherCompany.length})`}
            devices={otherCompany}
            selected={selected}
            onToggle={toggle}
            onToggleAll={() => toggleAll(otherCompany.map(d => d.id))}
            warning="Marcar aqui remove o terminal da empresa atual"
            badge={(d) => (
              <span className="text-xs text-slate-500">{otherCompanyName(d)}</span>
            )}
          />
        )}

        {devices.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            <Monitor size={28} className="mx-auto mb-2 opacity-30" />
            Nenhum terminal cadastrado ainda
          </div>
        )}
      </div>

      {/* Footer fixo com botão salvar */}
      <div className="sticky bottom-0 p-5 bg-surface-card border-t border-surface-border mt-4">
        <div className="flex gap-3">
          <button onClick={onDone} className="btn-ghost flex-1">Cancelar</button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
            className="btn-primary flex-1"
          >
            {saveMutation.isPending && <Loader2 size={13} className="animate-spin" />}
            {hasChanges
              ? `Salvar (${toAdd.length + toRemove.length} alterações)`
              : 'Sem alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-componente de grupo de terminais ──────
function Group({ title, titleColor, devices, selected, onToggle, onToggleAll, warning, badge }: {
  title: string
  titleColor?: string
  devices: Device[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
  warning?: string
  badge?: (d: Device) => React.ReactNode
}) {
  const allChecked = devices.every(d => selected.has(d.id))

  return (
    <div>
      {/* Header do grupo */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {titleColor && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: titleColor }} />}
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{title}</span>
        </div>
        <button onClick={onToggleAll} className="text-xs text-slate-500 hover:text-blue-400 transition-colors">
          {allChecked ? 'Desmarcar todos' : 'Marcar todos'}
        </button>
      </div>

      {warning && (
        <p className="text-xs text-amber-400/70 mb-2">{warning}</p>
      )}

      <div className="space-y-1.5">
        {devices.map(device => {
          const isChecked = selected.has(device.id)
          const colors    = statusColor(device.status)

          return (
            <label
              key={device.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3.5 py-2.5 cursor-pointer transition-colors select-none',
                isChecked
                  ? 'border-blue-500/40 bg-blue-500/5'
                  : 'border-surface-border bg-surface hover:border-surface-hover',
              )}
            >
              {/* Checkbox customizado */}
              <div
                className={cn(
                  'w-4 h-4 rounded flex items-center justify-center border-2 shrink-0 transition-colors',
                  isChecked
                    ? 'bg-blue-600 border-blue-600'
                    : 'border-slate-600 bg-transparent',
                )}
                onClick={() => onToggle(device.id)}
              >
                {isChecked && <Check size={10} className="text-white" strokeWidth={3} />}
              </div>

              {/* Info do terminal */}
              <div className="flex-1 min-w-0" onClick={() => onToggle(device.id)}>
                <p className="text-sm font-medium text-white truncate">{device.hostname}</p>
                <p className="text-xs text-slate-500 truncate">{device.alias}</p>
              </div>

              {/* Status dot + badge */}
              <div className="flex items-center gap-2 shrink-0">
                {badge ? badge(device) : null}
                <span className={cn('w-2 h-2 rounded-full', colors.dot)} title={device.status} />
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}
