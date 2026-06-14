// Contextual "what to do here" banner — one per screen so users never feel lost.

const GUIDES: Record<string, { step: string; title: string; body: string; action?: string }> = {
  '/opportunities': {
    step: 'Leakage detected',
    title: 'Pulse found revenue leaking from your customer base',
    body: 'The AI scanned 6,000 customers and detected segments where revenue is at risk. Each card shows how much is leaking and whether the AI can recover it.',
    action: 'Investigate the highest-value leak →',
  },
  cohort: {
    step: 'Why you\'re losing revenue',
    title: 'The AI explains this leak with evidence',
    body: 'Every claim is backed by a computed fact from your order data. Review the evidence, see the actual customers, then launch the AI-recommended recovery campaign.',
    action: 'Scroll down → Launch recovery campaign',
  },
  campaign: {
    step: 'Recovery campaign',
    title: 'The AI drafted a recovery message for this segment',
    body: 'Edit the WhatsApp and SMS copy if you like. The phone preview shows exactly what each customer will receive. Pulse will track every delivery, open, and click.',
    action: 'Send when ready →',
  },
  results: {
    step: 'Revenue recovered',
    title: 'Pulse is tracking recovered revenue from this campaign',
    body: 'Stats update live as messages deliver and customers return. Use "Simulate returns" to fast-forward the demo, then generate an AI debrief with next steps.',
    action: 'Try simulate returns below',
  },
}

export default function PageGuide({ variant }: { variant: keyof typeof GUIDES | 'cohort' | 'campaign' | 'results' }) {
  const g = GUIDES[variant]
  if (!g) return null

  return (
    <div className="flex items-start gap-4 p-4 sm:p-5 rounded-2xl bg-white border border-brand-100 shadow-sm shadow-brand-600/5">
      <div className="w-10 h-10 rounded-xl bg-espresso-900 text-white flex items-center justify-center shrink-0 shadow-sm text-xs font-bold">
        AI
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600">{g.step}</div>
        <div className="text-sm font-semibold text-espresso-900 mt-0.5">{g.title}</div>
        <p className="text-sm text-espresso-500 mt-1 leading-relaxed">{g.body}</p>
        {g.action && (
          <p className="text-xs font-semibold text-brand-600 mt-2">{g.action}</p>
        )}
      </div>
    </div>
  )
}
