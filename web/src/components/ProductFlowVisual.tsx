import { Fragment } from 'react'

const WORKFLOW_STEPS = [
  { num: '01', label: 'Customer\nData', sub: 'All orders, customers\n& behaviour' },
  { num: '02', label: 'Brand\nUnderstanding', sub: 'Learn your business\ninside out' },
  { num: '03', label: 'AI Finds\nOpportunities', sub: 'Detects revenue leaks\n& hidden patterns' },
  { num: '04', label: 'AI Recommends\nActions', sub: 'Best recovery strategies\nfor maximum impact' },
  { num: '05', label: 'Campaign\nExecution', sub: 'Send across the\nright channels' },
  { num: '06', label: 'Communication\nTracking', sub: 'Monitor customer\nengagement in real-time' },
  { num: '07', label: 'Revenue\nAttribution', sub: 'Track recovered revenue\n& measure ROI' },
  { num: '08', label: 'Business\nGrowth', sub: 'Improve repeat\nrevenue & LTV' },
]

function StepIcon({ index }: { index: number }) {
  const p = {
    width: 30,
    height: 30,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (index) {
    case 0:
      return <svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
    case 1:
      return <svg {...p}><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /></svg>
    case 2:
      return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
    case 3:
      return <svg {...p}><path d="M9 18h6M10 22h4M12 2v1" /><path d="M12 7a4 4 0 014 4 4.2 4.2 0 01-2 3.5V17H10v-2.5A4 4 0 0112 7z" /></svg>
    case 4:
      return <svg {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
    case 5:
      return <svg {...p}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
    case 6:
      return <svg {...p}><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
    case 7:
      return <svg {...p}><path d="M23 6l-9.5 9.5-5-5L1 18M17 6h6v6" /></svg>
    default:
      return null
  }
}

export default function ProductFlowVisual({ activeStep = 2 }: { activeStep?: number }) {
  return (
    <div className="bg-gradient-to-b from-white to-cream-50 rounded-2xl border border-espresso-100 shadow-sm">
      <div className="px-8 lg:px-10 pt-8 lg:pt-10">
        <h2 className="text-lg font-bold uppercase tracking-[0.12em] text-espresso-900">
          How Pulse works for Brew Street
        </h2>
        <p className="text-sm text-espresso-400 mt-1">
          From data to growth — the complete revenue recovery journey
        </p>
      </div>

      <div className="px-4 lg:px-8 pt-10 pb-6 overflow-x-auto">
        <div className="flex items-start min-w-[960px]">
          {WORKFLOW_STEPS.map((step, i) => (
            <Fragment key={i}>
              <div className="flex flex-col items-center text-center flex-1 min-w-0">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
                    i === activeStep
                      ? 'bg-brand-600 text-white shadow-2xl shadow-brand-500/40 ring-[6px] ring-brand-100 scale-110'
                      : i < activeStep
                        ? 'bg-brand-100 text-brand-600'
                        : 'bg-cream-200 text-espresso-400'
                  }`}
                >
                  <StepIcon index={i} />
                </div>
                <span
                  className={`text-xs font-bold mt-4 tabular-nums ${
                    i === activeStep ? 'text-brand-600' : 'text-espresso-400'
                  }`}
                >
                  {step.num}
                </span>
                <span
                  className={`text-[13px] font-semibold mt-1.5 leading-snug whitespace-pre-line ${
                    i === activeStep ? 'text-brand-700' : 'text-espresso-800'
                  }`}
                >
                  {step.label}
                </span>
                <span className="text-[10px] text-espresso-400 mt-1.5 leading-snug whitespace-pre-line">
                  {step.sub}
                </span>
              </div>
              {i < WORKFLOW_STEPS.length - 1 && (
                <div className="flex items-center pt-8 shrink-0 mx-0">
                  <svg width="24" height="12" viewBox="0 0 24 12" className="text-espresso-300" fill="none">
                    <line x1="0" y1="6" x2="15" y2="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                    <path d="M14 2.5L18.5 6 14 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="px-8 lg:px-10 pb-8 lg:pb-10 pt-2">
        <div className="relative flex items-center justify-between">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] bg-espresso-100 rounded-full" />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] bg-brand-500 rounded-full transition-all duration-500"
            style={{ width: `${(activeStep / (WORKFLOW_STEPS.length - 1)) * 100}%` }}
          />
          {WORKFLOW_STEPS.map((_, i) => (
            <div
              key={i}
              className={`relative z-10 rounded-full border-2 border-white transition-all duration-300 ${
                i === activeStep
                  ? 'w-4 h-4 bg-brand-500 ring-2 ring-brand-200'
                  : i < activeStep
                    ? 'w-3 h-3 bg-brand-500'
                    : 'w-3 h-3 bg-espresso-200'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
