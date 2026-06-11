// Parse {fact:fX} placeholders in LLM-generated text into clickable chip nodes.
// Whatever value isn't a {fact:fX} segment renders as a plain text node.

import type { ReactNode } from 'react'
import type { Fact } from './types'
import FactChip from '../components/FactChip'

const RE = /\{fact:([a-zA-Z0-9_]+)\}/g

export function renderWithFactChips(text: string, factsById: Map<string, Fact>): ReactNode[] {
  const out: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  RE.lastIndex = 0
  while ((match = RE.exec(text)) !== null) {
    if (match.index > cursor) {
      out.push(text.slice(cursor, match.index))
    }
    const factId = match[1]
    const fact = factsById.get(factId)
    out.push(<FactChip key={`${factId}-${match.index}`} factId={factId} fact={fact} />)
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) {
    out.push(text.slice(cursor))
  }
  return out
}

export function indexFacts(facts: Fact[]): Map<string, Fact> {
  return new Map(facts.map((f) => [f.fact_id, f]))
}

export function formatFactValue(value: Fact['value']): string {
  if (typeof value === 'number') {
    if (Math.abs(value) >= 100000) {
      return `₹${(value / 100000).toFixed(2)}L`
    }
    if (Number.isInteger(value)) return value.toLocaleString('en-IN')
    return value.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  }
  return String(value)
}
