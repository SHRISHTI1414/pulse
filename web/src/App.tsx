import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import Opportunities from './pages/Opportunities'
import CohortDetail from './pages/CohortDetail'
import CampaignReview from './pages/CampaignReview'
import Results from './pages/Results'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/opportunities" replace />} />
        <Route path="/opportunities" element={<Opportunities />} />
        <Route path="/opportunities/:id" element={<CohortDetail />} />
        <Route path="/campaigns/:id" element={<CampaignReview />} />
        <Route path="/campaigns/:id/results" element={<Results />} />
      </Routes>
    </AppShell>
  )
}
