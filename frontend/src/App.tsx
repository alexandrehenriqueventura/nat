import { useMemo } from 'react'
import { Toaster } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { MetricCards } from '@/components/dashboard/MetricCards'
import { DeviceTable } from '@/components/dashboard/DeviceTable'
import { DeviceDetailDrawer } from '@/components/device/DeviceDetailDrawer'
import { PendingTerminals } from '@/components/company/PendingTerminals'
import { useDevices, useSSEDeviceUpdates } from '@/hooks/useDevices'
import { useAppStore } from '@/store/appStore'
import { fetchCompanies } from '@/lib/api'

export default function App() {
  const { devices, metrics, isLoading } = useDevices()
  useSSEDeviceUpdates()

  const {
    selectedDevice, setSelectedDevice,
    searchQuery, setSearchQuery,
    statusFilter, setStatusFilter,
    companyFilter,
  } = useAppStore()

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  })

  // Filtra dispositivos por busca, status e empresa
  const filteredDevices = useMemo(() => {
    return devices.filter(d => {
      const matchesSearch =
        !searchQuery ||
        d.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.alias.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.interfaces.some(i => i.ip.includes(searchQuery))

      const matchesStatus = !statusFilter || d.status === statusFilter

      const matchesCompany =
        !companyFilter ||
        (companyFilter === 'unassigned' ? !d.company_id : d.company_id === companyFilter)

      return matchesSearch && matchesStatus && matchesCompany
    })
  }, [devices, searchQuery, statusFilter, companyFilter])

  // Terminais ainda sem empresa (aparece no banner de pendentes)
  const pendingDevices = useMemo(
    () => devices.filter(d => !d.company_id),
    [devices],
  )

  // Título dinâmico da seção baseado no filtro de empresa
  const sectionTitle = useMemo(() => {
    if (!companyFilter) return 'Todos os Terminais'
    if (companyFilter === 'unassigned') return 'Terminais sem empresa'
    return companies.find(c => c.id === companyFilter)?.name ?? 'Terminais'
  }, [companyFilter, companies])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar metrics={metrics} sectionTitle={sectionTitle} />

        <main className="flex-1 overflow-y-auto p-6 space-y-5">
          <MetricCards
            metrics={metrics}
            activeFilter={statusFilter}
            onFilter={setStatusFilter}
          />

          {/* Banner de terminais novos sem empresa — só aparece quando houver */}
          <PendingTerminals devices={pendingDevices} companies={companies} />

          <DeviceTable
            devices={filteredDevices}
            companies={companies}
            isLoading={isLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelect={setSelectedDevice}
          />
        </main>
      </div>

      {/* Drawer de detalhes */}
      {selectedDevice && (
        <DeviceDetailDrawer
          device={selectedDevice}
          companies={companies}
          onClose={() => setSelectedDevice(null)}
        />
      )}

      <Toaster
        position="bottom-right"
        theme="dark"
        richColors
        toastOptions={{ style: { background: '#1e293b', border: '1px solid #334155' } }}
      />
    </div>
  )
}
