import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { FactResolve } from '../lib/types'
import Drawer from './Drawer'
import Spinner from './Spinner'
import ErrorState from './ErrorState'

export default function FactResolveDrawer({
  factId,
  open,
  onClose,
}: {
  factId: string
  open: boolean
  onClose: () => void
}) {
  const [data, setData] = useState<FactResolve | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    api.resolveFact(factId)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, factId])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={data ? data.label : `Fact ${factId}`}
    >
      {loading && (
        <div className="flex items-center gap-2 text-gray-500">
          <Spinner size={16} /> Resolving live…
        </div>
      )}
      {error && <ErrorState message={error} />}
      {data && !loading && !error && (
        <>
          <p className="text-sm text-gray-600 mb-4">{data.description}</p>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
            {data.row_count} rows · cohort {data.cohort_ref}
          </div>
          {data.rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No rows resolved.</p>
          ) : (
            <ResolvedTable rows={data.rows} />
          )}
        </>
      )}
    </Drawer>
  )
}

function ResolvedTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = Object.keys(rows[0])
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {cols.map((c) => (
              <th key={c} className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
              {cols.map((c) => (
                <td key={c} className="px-2 py-1.5 text-gray-700 whitespace-nowrap">
                  {formatCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number') return v.toLocaleString('en-IN')
  return String(v)
}
