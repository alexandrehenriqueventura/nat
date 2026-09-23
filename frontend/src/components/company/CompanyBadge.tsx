// Badge colorido para identificar visualmente a empresa do terminal.
import type { Company } from '@/types'

interface CompanyBadgeProps {
  company: Company | undefined | null
  size?: 'sm' | 'md'
}

export function CompanyBadge({ company, size = 'sm' }: CompanyBadgeProps) {
  if (!company) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-700/50 text-slate-500 text-xs px-2 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
        Sem empresa
      </span>
    )
  }

  const textSize = size === 'md' ? 'text-sm' : 'text-xs'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${textSize}`}
      style={{
        backgroundColor: company.color + '18', // 10% opacidade
        color: company.color,
        border: `1px solid ${company.color}30`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: company.color }}
      />
      {company.name}
    </span>
  )
}

// Dot colorido simples (para usar em listas compactas)
export function CompanyDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
      style={{ backgroundColor: color }}
    />
  )
}
