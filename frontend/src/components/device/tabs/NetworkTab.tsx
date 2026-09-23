import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { Device } from '@/types'
import { setDeviceIP, setDeviceDHCP } from '@/lib/api'
import { cn } from '@/lib/utils'

const ipSchema = z.object({
  interface_name:    z.string().min(1, 'Obrigatório'),
  ip:                z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'IP inválido'),
  mask:              z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Máscara inválida'),
  gateway:           z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Gateway inválido'),
  dns_primary:       z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'DNS inválido'),
  dns_secondary:     z.string().optional(),
  rollback_timeout_s: z.number().min(5).max(60),
})

type IPForm = z.infer<typeof ipSchema>

interface NetworkTabProps {
  device: Device
}

export function NetworkTab({ device }: NetworkTabProps) {
  const [loading, setLoading] = useState<'ip' | 'dhcp' | null>(null)
  const iface = device.interfaces[0]

  const { register, handleSubmit, formState: { errors } } = useForm<IPForm>({
    resolver: zodResolver(ipSchema),
    defaultValues: {
      interface_name:     iface?.name ?? 'Ethernet',
      ip:                 iface?.ip ?? '',
      mask:               iface?.mask ?? '255.255.255.0',
      gateway:            iface?.gateway ?? '',
      dns_primary:        iface?.dns?.[0] ?? '8.8.8.8',
      dns_secondary:      iface?.dns?.[1] ?? '8.8.4.4',
      rollback_timeout_s: 15,
    },
  })

  const onSubmitIP = async (data: IPForm) => {
    setLoading('ip')
    const toastId = toast.loading(`Aplicando IP ${data.ip} em ${device.hostname}...`)
    try {
      const result = await setDeviceIP(device.id, {
        ...data,
        dns_secondary: data.dns_secondary ?? '',
      })

      if (result.status === 'ok') {
        toast.success(`IP alterado para ${result.data?.new_ip}`, { id: toastId })
      } else if (result.status === 'rollback') {
        toast.warning('IP revertido — sem resposta do gateway', { id: toastId, duration: 6000 })
      } else {
        toast.error(`Erro: ${result.error?.message}`, { id: toastId })
      }
    } catch {
      toast.error('Falha na comunicação com o servidor', { id: toastId })
    } finally {
      setLoading(null)
    }
  }

  const onSetDHCP = async () => {
    setLoading('dhcp')
    const toastId = toast.loading(`Ativando DHCP em ${device.hostname}...`)
    try {
      const result = await setDeviceDHCP(device.id, iface?.name ?? 'Ethernet')
      if (result.status === 'ok') {
        toast.success(`DHCP ativo. IP obtido: ${result.data?.ip_obtained}`, { id: toastId })
      } else {
        toast.error('Falha ao ativar DHCP', { id: toastId })
      }
    } catch {
      toast.error('Falha na comunicação com o servidor', { id: toastId })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Status atual */}
      <div className="rounded-lg border border-surface-border bg-surface p-4 space-y-2">
        <p className="text-xs font-medium text-slate-400 mb-3">Configuração Atual</p>
        <Row label="Interface" value={iface?.name ?? '—'} />
        <Row label="Endereço IP" value={iface?.ip ?? '—'} mono />
        <Row label="Máscara"    value={iface?.mask ?? '—'} mono />
        <Row label="Gateway"    value={iface?.gateway ?? '—'} mono />
        <Row label="DNS"        value={iface?.dns?.join(', ') ?? '—'} mono />
        <Row label="Modo"       value={iface?.is_dhcp ? 'DHCP' : 'Estático'} />
      </div>

      {/* Aviso rollback */}
      <div className="flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5">
        <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300 leading-relaxed">
          O agente tentará conectar no novo IP. Se não houver resposta do gateway em{' '}
          <strong>15 segundos</strong>, o IP anterior será restaurado automaticamente.
        </p>
      </div>

      {/* Formulário de IP estático */}
      <form onSubmit={handleSubmit(onSubmitIP)} className="space-y-4">
        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Alterar IP Estático</p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Interface" error={errors.interface_name?.message}>
            <input {...register('interface_name')} className="input" placeholder="Ethernet" />
          </Field>
          <Field label="Timeout de Rollback (s)" error={errors.rollback_timeout_s?.message}>
            <input {...register('rollback_timeout_s', { valueAsNumber: true })} type="number" className="input" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Endereço IP" error={errors.ip?.message}>
            <input {...register('ip')} className="input" placeholder="192.168.1.10" />
          </Field>
          <Field label="Máscara de Sub-rede" error={errors.mask?.message}>
            <input {...register('mask')} className="input" placeholder="255.255.255.0" />
          </Field>
        </div>

        <Field label="Gateway" error={errors.gateway?.message}>
          <input {...register('gateway')} className="input" placeholder="192.168.1.1" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="DNS Primário" error={errors.dns_primary?.message}>
            <input {...register('dns_primary')} className="input" placeholder="8.8.8.8" />
          </Field>
          <Field label="DNS Secundário">
            <input {...register('dns_secondary')} className="input" placeholder="8.8.4.4" />
          </Field>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={!!loading}
            className="btn-primary flex-1"
          >
            {loading === 'ip' && <Loader2 size={14} className="animate-spin" />}
            Aplicar IP Estático
          </button>

          <button
            type="button"
            disabled={!!loading}
            onClick={onSetDHCP}
            className="btn-ghost border border-surface-border"
          >
            {loading === 'dhcp' && <Loader2 size={14} className="animate-spin" />}
            Ativar DHCP
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Sub-componentes locais ────────────────────────────────────

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={cn('text-xs text-slate-200', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}
