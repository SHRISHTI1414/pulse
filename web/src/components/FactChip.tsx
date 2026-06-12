import { useState } from 'react'
import type { Fact } from '../lib/types'
import { formatFactValue } from '../lib/factCitations'
import FactResolveDrawer from './FactResolveDrawer'

export default function FactChip({ factId, fact }: { factId: string; fact?: Fact }) {
  const [open, setOpen] = useState(false)

  const display = fact ? formatFactValue(fact.value) : factId
  const label = fact ? fact.label : `Fact ${factId}`

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group inline-flex items-baseline gap-1 mx-0.5 px-1.5 py-0.5 rounded-md bg-brand-50 border border-brand-200 text-brand-700 hover:bg-brand-100 hover:border-brand-300 transition-colors text-sm font-semibold align-baseline cursor-pointer"
        title={`${label} — click to see the customers behind this number`}
      >
        <span>{display}</span>
        <svg
          width={9}
          height={9}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="opacity-60 group-hover:opacity-100 transition-opacity"
        >
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      </button>
      <FactResolveDrawer
        factId={factId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
