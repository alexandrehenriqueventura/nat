// Hook que mantém a lista de dispositivos sempre atualizada.
// Faz polling a cada 10s para simular atualizações em tempo real.
// Quando o servidor estiver pronto, o polling será substituído por SSE.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { fetchDevices, getDashboardMetrics } from '@/lib/api'

export function useDevices() {
  const { data: devices = [], isLoading, error } = useQuery({
    queryKey: ['devices'],
    queryFn: fetchDevices,
    refetchInterval: 10_000,   // atualiza a cada 10 segundos
    staleTime:        5_000,
  })

  const metrics = getDashboardMetrics(devices)

  return { devices, metrics, isLoading, error }
}

// Hook para invalidar o cache de dispositivos ao receber
// um evento SSE do servidor.
export function useSSEDeviceUpdates() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let eventSource: EventSource | null = null

    try {
      eventSource = new EventSource('/events/devices')

      const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['devices'] })
      }

      eventSource.addEventListener('device.connected', invalidate)
      eventSource.addEventListener('device.disconnected', invalidate)
      eventSource.addEventListener('device.heartbeat', invalidate)
      eventSource.addEventListener('command.result', invalidate)

      eventSource.onerror = () => {
        // SSE falhou ou servidor indisponível — o polling cobre
        if (eventSource?.readyState === EventSource.CLOSED) {
          eventSource.close()
        }
      }
    } catch {
      // Falha silenciosa se SSE não estiver disponível
    }

    return () => {
      eventSource?.close()
    }
  }, [queryClient])
}
