// Hook que mantém a lista de dispositivos sincronizada em tempo real com o Cloud Firestore.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { fetchDevices, getDashboardMetrics } from '@/lib/api'

export function useDevices() {
  const queryClient = useQueryClient()

  // 1. Query inicial com cache
  const { data: devices = [], isLoading, error } = useQuery({
    queryKey: ['devices'],
    queryFn: fetchDevices,
    staleTime: Infinity, // Mantido fresco pelo listener onSnapshot
  })

  // 2. Listener em tempo real do Cloud Firestore
  useEffect(() => {
    try {
      const unsubscribe = onSnapshot(collection(db, 'devices'), () => {
        // Invalida o cache e força atualização imediata dos dados
        queryClient.invalidateQueries({ queryKey: ['devices'] })
      }, (err) => {
        console.warn('Erro na sincronização em tempo real do Firestore:', err)
      })

      return () => unsubscribe()
    } catch (err) {
      console.warn('Falha ao inicializar listener do Firestore:', err)
    }
  }, [queryClient])

  const metrics = getDashboardMetrics(devices)

  return { devices, metrics, isLoading, error }
}

// Hook de compatibilidade (não mais necessário com Firestore, mantido para evitar quebras)
export function useSSEDeviceUpdates() {
  // O onSnapshot dentro de useDevices já gerencia tudo em tempo real
}
