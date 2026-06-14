import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Header from './Header'
import WorkflowSteps from './WorkflowSteps'
import ProductFlowVisual from './ProductFlowVisual'

export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  const workflowStep = pathname.endsWith('/results') ? 6
    : pathname.startsWith('/campaigns/') ? 4
    : pathname.startsWith('/opportunities/') && pathname !== '/opportunities' ? 3
    : 2

  return (
    <div className="min-h-screen flex flex-col bg-cream-100">
      <Header />
      <div className="flex-1 flex">
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-espresso-100 bg-white/60 backdrop-blur-sm px-4 py-6 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
          <WorkflowSteps />
        </aside>
        <main className="flex-1 min-w-0">
          <div className="lg:hidden border-b border-espresso-100 bg-white/80 px-4 py-3 overflow-x-auto">
            <WorkflowSteps compact />
          </div>
          <div className="max-w-6xl w-full mx-auto px-5 sm:px-8">
            <div className="hidden lg:block pt-8 pb-2">
              <ProductFlowVisual activeStep={workflowStep} />
            </div>
            <div className="py-6 sm:py-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
