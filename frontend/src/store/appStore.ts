// Estado global da aplicação via Zustand.
import { create } from 'zustand'
import type { Device } from '@/types'

interface AppState {
  // Dispositivo aberto no drawer
  selectedDevice: Device | null
  setSelectedDevice: (device: Device | null) => void

  // Busca global
  searchQuery: string
  setSearchQuery: (q: string) => void

  // Filtro de status
  statusFilter: Device['status'] | null
  setStatusFilter: (s: Device['status'] | null) => void

  // Filtro de empresa (null = todas, 'unassigned' = sem empresa)
  companyFilter: string | null
  setCompanyFilter: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedDevice: null,
  setSelectedDevice: (device) => set({ selectedDevice: device }),

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  statusFilter: null,
  setStatusFilter: (s) => set({ statusFilter: s }),

  companyFilter: null,
  setCompanyFilter: (id) => set({ companyFilter: id }),
}))
