import type { ReactNode } from 'react'

export default function EmptyState({
  title,
  message,
  action,
}: {
  title: string
  message?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-50 to-cream-200 border border-brand-100 flex items-center justify-center mb-5 shadow-sm">
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-500">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="font-display text-xl font-semibold text-espresso-900">{title}</h3>
      {message && <p className="text-sm text-espresso-500 mt-2 max-w-md leading-relaxed">{message}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
