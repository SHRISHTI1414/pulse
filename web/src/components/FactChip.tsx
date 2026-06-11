import { useState } from 'react'
import type { Fact } from '../lib/types'
import { formatFactValue } from '../lib/factCitations'
import FactResolveDrawer from './FactResolveDrawer'

export default function FactChip({ factId, fact }: { factId: string; fact?: Fact }) {
  const [open, setOpen] = useState(false)

  // If we have the fact value pre-computed, show it inline. Otherwise just show the id.
  const display = fact ? formatFactValue(fact.value) : factId

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-baseline gap-1 mx-1 px-2 py-0.5 rounded-md bg-brand-50 border border-brand-100 text-brand-700 hover:bg-brand-100 transition-colors text-sm font-medium align-baseline"
        title={fact ? fact.label : `Fact ${factId}`}
      >
        <span className="font-semibold">{display}</span>
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="opacity-60">
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
