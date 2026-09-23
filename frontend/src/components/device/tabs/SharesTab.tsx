import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { FolderOpen, Plus, Trash2, Loader2, Shield } from 'lucide-react'
import type { Device, Share } from '@/types'
import { fetchShares, createShare, deleteShare } from '@/lib/api'

interface SharesTabProps {
  device: Device
}

const LEVEL_LABELS: Record<string, string> = {
  ro:   'Leitura',
  rw:   'Modificar',
  full: 'Controle Total',
}

const LEVEL_COLORS: Record<string, string> = {
  ro:   'text-blue-400 bg-blue-400/10',
  rw:   'text-amber-400 bg-amber-400/10',
  full: 'text-red-400 bg-red-400/10',
}

export function SharesTab({ device }: SharesTabProps) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', local_path: '', description: '' })

  const { data: shares = [], isLoading } = useQuery({
    queryKey: ['shares', device.id],
    queryFn: () => fetchShares(device.id),
    enabled: device.status !== 'offline',
  })

  const handleDelete = async (share: Share) => {
    if (!confirm(`Remover compartilhamento "${share.name}"?`)) return
    setDeleting(share.name)
    const toastId = toast.loading(`Removendo ${share.name}...`)
    try {
      const result = await deleteShare(device.id, share.name)
      if (result.status === 'ok') {
        toast.success(`"${share.name}" removido`, { id: toastId })
        queryClient.invalidateQueries({ queryKey: ['shares', device.id] })
      } else {
        toast.error('Falha ao remover compartilhamento', { id: toastId })
      }
    } catch {
      toast.error('Erro de comunicação', { id: toastId })
    } finally {
      setDeleting(null)
    }
  }

  const handleCreate = async () => {
    if (!form.name || !form.local_path) return
    const toastId = toast.loading(`Criando compartilhamento "${form.name}"...`)
    try {
      const result = await createShare(device.id, {
        name: form.name,
        local_path: form.local_path,
        description: form.description,
        create_if_not_exists: true,
        permissions: [{ user: 'Administrador', level: 'full' }],
      })
      if (result.status === 'ok') {
        toast.success(`"${form.name}" criado com sucesso`, { id: toastId })
        setShowForm(false)
        setForm({ name: '', local_path: '', description: '' })
        queryClient.invalidateQueries({ queryKey: ['shares', device.id] })
      } else {
        toast.error('Falha ao criar compartilhamento', { id: toastId })
      }
    } catch {
      toast.error('Erro de comunicação', { id: toastId })
    }
  }

  if (device.status === 'offline') {
    return <OfflineMessage />
  }

  if (isLoading) {
    return <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-surface-hover animate-pulse" />)}</div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{shares.length} compartilhamento{shares.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary py-1.5 text-xs">
          <Plus size={13} /> Novo Share
        </button>
      </div>

      {/* Formulário de criação */}
      {showForm && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-400">Novo Compartilhamento</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nome do Share</label>
              <input className="input" placeholder="Estoque" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Caminho Local</label>
              <input className="input" placeholder="C:\Compartilhados\Estoque" value={form.local_path} onChange={e => setForm(p => ({ ...p, local_path: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Descrição (opcional)</label>
            <input className="input" placeholder="Pasta de estoque" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleCreate} className="btn-primary flex-1 text-xs">Criar</button>
            <button onClick={() => setShowForm(false)} className="btn-ghost text-xs">Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista de shares */}
      {shares.length === 0 && !showForm && (
        <div className="text-center py-10 text-slate-500 text-sm">
          <FolderOpen size={32} className="mx-auto mb-2 opacity-30" />
          Nenhum compartilhamento encontrado
        </div>
      )}

      {shares.map(share => (
        <div key={share.name} className="rounded-lg border border-surface-border bg-surface p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <FolderOpen size={15} className="text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">{share.name}</p>
                <code className="text-xs text-slate-500">{share.local_path}</code>
              </div>
            </div>
            <button
              onClick={() => handleDelete(share)}
              disabled={deleting === share.name}
              className="btn-danger py-1 px-2 text-xs shrink-0"
            >
              {deleting === share.name
                ? <Loader2 size={12} className="animate-spin" />
                : <Trash2 size={12} />}
            </button>
          </div>

          {/* Permissões */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Shield size={11} className="text-slate-500" />
              <p className="text-xs text-slate-500">Permissões</p>
            </div>
            {share.permissions.map(perm => (
              <div key={perm.user} className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{perm.user}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${LEVEL_COLORS[perm.level] ?? 'text-slate-400 bg-slate-400/10'}`}>
                  {LEVEL_LABELS[perm.level] ?? perm.level}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function OfflineMessage() {
  return (
    <div className="text-center py-12 text-slate-500 text-sm">
      <FolderOpen size={32} className="mx-auto mb-2 opacity-20" />
      Dispositivo offline — dados indisponíveis
    </div>
  )
}
