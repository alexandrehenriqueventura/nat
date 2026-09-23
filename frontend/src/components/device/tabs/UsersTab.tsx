import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Users, Plus, Power, PowerOff, Key, Loader2 } from 'lucide-react'
import type { Device, LocalUser } from '@/types'
import { fetchUsers, toggleUserStatus, resetUserPassword, createUser } from '@/lib/api'
import { formatRelative, cn } from '@/lib/utils'

interface UsersTabProps {
  device: Device
}

export function UsersTab({ device }: UsersTabProps) {
  const queryClient = useQueryClient()
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [resetTarget, setResetTarget] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', device.id],
    queryFn: () => fetchUsers(device.id),
    enabled: device.status !== 'offline',
  })

  const [createForm, setCreateForm] = useState({
    username: '', full_name: '', password: '', description: '',
    pwd_never_expires: true, groups: ['Usuários'],
  })

  const handleToggle = async (user: LocalUser) => {
    setActionLoading(user.username + '_toggle')
    const toastId = toast.loading(`${user.enabled ? 'Desativando' : 'Ativando'} ${user.username}...`)
    try {
      const result = await toggleUserStatus(device.id, user.username, !user.enabled)
      if (result.status === 'ok') {
        toast.success(`${user.username} ${user.enabled ? 'desativado' : 'ativado'}`, { id: toastId })
        queryClient.invalidateQueries({ queryKey: ['users', device.id] })
      } else {
        toast.error('Falha ao alterar status', { id: toastId })
      }
    } catch {
      toast.error('Erro de comunicação', { id: toastId })
    } finally {
      setActionLoading(null)
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget || !newPassword) return
    setActionLoading(resetTarget + '_pwd')
    const toastId = toast.loading(`Alterando senha de ${resetTarget}...`)
    try {
      const result = await resetUserPassword(device.id, resetTarget, newPassword)
      if (result.status === 'ok') {
        toast.success(`Senha de ${resetTarget} alterada`, { id: toastId })
        setResetTarget(null)
        setNewPassword('')
      } else {
        toast.error('Falha ao alterar senha', { id: toastId })
      }
    } catch {
      toast.error('Erro de comunicação', { id: toastId })
    } finally {
      setActionLoading(null)
    }
  }

  const handleCreate = async () => {
    if (!createForm.username || !createForm.password) return
    const toastId = toast.loading(`Criando usuário ${createForm.username}...`)
    try {
      const result = await createUser(device.id, {
        ...createForm,
        must_change_pwd: false,
      })
      if (result.status === 'ok') {
        toast.success(`Usuário ${createForm.username} criado`, { id: toastId })
        setShowCreate(false)
        queryClient.invalidateQueries({ queryKey: ['users', device.id] })
      } else {
        toast.error('Falha ao criar usuário', { id: toastId })
      }
    } catch {
      toast.error('Erro de comunicação', { id: toastId })
    }
  }

  if (device.status === 'offline') {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        <Users size={32} className="mx-auto mb-2 opacity-20" />
        Dispositivo offline — dados indisponíveis
      </div>
    )
  }

  if (isLoading) {
    return <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-surface-hover animate-pulse" />)}</div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{users.length} usuário{users.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowCreate(v => !v)} className="btn-primary py-1.5 text-xs">
          <Plus size={13} /> Novo Usuário
        </button>
      </div>

      {/* Formulário de criação */}
      {showCreate && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-400">Novo Usuário Local</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Username</label>
              <input className="input" placeholder="operador_noite" value={createForm.username} onChange={e => setCreateForm(p => ({ ...p, username: e.target.value }))} />
            </div>
            <div>
              <label className="label">Nome Completo</label>
              <input className="input" placeholder="Operador Noturno" value={createForm.full_name} onChange={e => setCreateForm(p => ({ ...p, full_name: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Senha</label>
            <input type="password" className="input" placeholder="••••••••" value={createForm.password} onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))} />
          </div>
          <div>
            <label className="label">Descrição (opcional)</label>
            <input className="input" placeholder="Terminal de Vendas" value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleCreate} className="btn-primary flex-1 text-xs">Criar Usuário</button>
            <button onClick={() => setShowCreate(false)} className="btn-ghost text-xs">Cancelar</button>
          </div>
        </div>
      )}

      {/* Modal de reset de senha */}
      {resetTarget && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-amber-400">Alterar Senha — {resetTarget}</p>
          <div>
            <label className="label">Nova Senha</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleResetPassword}
              disabled={!newPassword || actionLoading === resetTarget + '_pwd'}
              className="btn-primary flex-1 text-xs"
            >
              {actionLoading === resetTarget + '_pwd' && <Loader2 size={12} className="animate-spin" />}
              Confirmar
            </button>
            <button onClick={() => { setResetTarget(null); setNewPassword('') }} className="btn-ghost text-xs">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de usuários */}
      {users.map(user => (
        <div
          key={user.username}
          className={cn(
            'flex items-center justify-between rounded-lg border p-3.5 transition-colors',
            user.enabled ? 'border-surface-border bg-surface' : 'border-surface-border/50 bg-surface/50 opacity-60',
          )}
        >
          {/* Info do usuário */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
              user.enabled ? 'bg-blue-600/20 text-blue-400' : 'bg-surface-hover text-slate-500',
            )}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.username}</p>
              <p className="text-xs text-slate-500 truncate">
                {user.full_name || user.description || user.groups.join(', ')}
              </p>
            </div>
          </div>

          {/* Meta e ações */}
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {user.last_logon && (
              <span className="text-xs text-slate-600 hidden sm:block">
                {formatRelative(user.last_logon)}
              </span>
            )}

            {/* Reset senha */}
            <button
              onClick={() => setResetTarget(user.username)}
              disabled={!!actionLoading}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-surface-hover hover:text-amber-400 transition-colors"
              title="Alterar senha"
            >
              <Key size={13} />
            </button>

            {/* Toggle ativo/inativo */}
            <button
              onClick={() => handleToggle(user)}
              disabled={!!actionLoading || user.username === 'Administrador'}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                user.enabled
                  ? 'text-slate-500 hover:bg-red-500/10 hover:text-red-400'
                  : 'text-slate-500 hover:bg-green-500/10 hover:text-green-400',
                (user.username === 'Administrador') && 'opacity-30 cursor-not-allowed',
              )}
              title={user.enabled ? 'Desativar conta' : 'Ativar conta'}
            >
              {actionLoading === user.username + '_toggle'
                ? <Loader2 size={13} className="animate-spin" />
                : user.enabled ? <PowerOff size={13} /> : <Power size={13} />
              }
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
