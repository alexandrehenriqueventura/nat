import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Monitor, Settings, LogOut, Building2, Plus, LayoutDashboard, ServerOff } from 'lucide-react'
import { fetchCompanies, fetchDevices } from '@/lib/api'
import { useAppStore } from '@/store/appStore'
import { CompanyManagerModal } from '@/components/company/CompanyManagerModal'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const queryClient = useQueryClient()
  const { companyFilter, setCompanyFilter, setStatusFilter, setSearchQuery } = useAppStore()
  const [showCompanyManager, setShowCompanyManager] = useState(false)

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  })

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: fetchDevices,
  })

  useEffect(() => {
    try {
      const unsubscribe = onSnapshot(collection(db, 'companies'), () => {
        queryClient.invalidateQueries({ queryKey: ['companies'] })
      })
      return () => unsubscribe()
    } catch {}
  }, [queryClient])

  // Conta terminais por empresa
  const countFor = (companyId: string | 'unassigned') =>
    companyId === 'unassigned'
      ? devices.filter(d => !d.company_id).length
      : devices.filter(d => d.company_id === companyId).length

  const handleSelect = (id: string | null) => {
    setCompanyFilter(id)
    setStatusFilter(null)
    setSearchQuery('')
  }

  return (
    <>
      <aside className="w-60 shrink-0 flex flex-col bg-surface-card border-r border-surface-border">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-surface-border">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Monitor size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">NAT Panel</p>
            <p className="text-xs text-slate-500">Gestão Remota</p>
          </div>
        </div>

        {/* Navegação principal */}
        <nav className="px-3 pt-4 pb-2">
          <NavItem
            icon={LayoutDashboard}
            label="Todos os Terminais"
            count={devices.length}
            active={companyFilter === null}
            onClick={() => handleSelect(null)}
          />
        </nav>

        {/* Seção de empresas */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="flex items-center justify-between mb-1.5 mt-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2">Empresas</span>
            <button
              onClick={() => setShowCompanyManager(true)}
              className="p-1 rounded-md hover:bg-surface-hover text-slate-500 hover:text-slate-300 transition-colors"
              title="Gerenciar empresas"
            >
              <Plus size={13} />
            </button>
          </div>

          <div className="space-y-0.5">
            {companies.map(company => (
              <NavItem
                key={company.id}
                label={company.name}
                count={countFor(company.id)}
                active={companyFilter === company.id}
                onClick={() => handleSelect(company.id)}
                dot={company.color}
              />
            ))}

            {/* Terminais sem empresa */}
            {countFor('unassigned') > 0 && (
              <NavItem
                icon={ServerOff}
                label="Sem empresa"
                count={countFor('unassigned')}
                active={companyFilter === 'unassigned'}
                onClick={() => handleSelect('unassigned')}
                muted
              />
            )}

            {companies.length === 0 && (
              <button
                onClick={() => setShowCompanyManager(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-600 hover:text-slate-400 transition-colors"
              >
                <Plus size={12} />
                Criar primeira empresa
              </button>
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-3 py-4 border-t border-surface-border space-y-0.5">
          <button
            onClick={() => setShowCompanyManager(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-surface-hover hover:text-white transition-colors"
          >
            <Building2 size={15} />
            Empresas
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-surface-hover hover:text-white transition-colors">
            <Settings size={15} />
            Configurações
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-surface-hover hover:text-white transition-colors">
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </aside>

      {showCompanyManager && (
        <CompanyManagerModal onClose={() => setShowCompanyManager(false)} />
      )}
    </>
  )
}

// ── Sub-componente de item de nav ─────────────────────────────
interface NavItemProps {
  icon?: React.ElementType
  dot?: string        // hex color para usar dot colorido ao invés de ícone
  label: string
  count?: number
  active: boolean
  onClick: () => void
  muted?: boolean
}

function NavItem({ icon: Icon, dot, label, count, active, onClick, muted }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
        active
          ? 'bg-blue-600/15 text-blue-400'
          : muted
            ? 'text-slate-600 hover:bg-surface-hover hover:text-slate-400'
            : 'text-slate-400 hover:bg-surface-hover hover:text-white',
      )}
    >
      {/* Ícone ou dot de empresa */}
      {dot ? (
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dot }} />
        </span>
      ) : Icon ? (
        <Icon size={15} className="shrink-0" />
      ) : null}

      <span className="flex-1 truncate">{label}</span>

      {count !== undefined && (
        <span className={cn(
          'text-xs px-1.5 py-0.5 rounded-md min-w-[20px] text-center',
          active ? 'bg-blue-600/30 text-blue-300' : 'bg-surface-hover text-slate-500',
        )}>
          {count}
        </span>
      )}
    </button>
  )
}
