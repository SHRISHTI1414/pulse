import { Navigate, Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import Opportunities from './pages/Opportunities'
import CampaignReview from './pages/CampaignReview'
import Results from './pages/Results'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/opportunities" replace />} />
          <Route path="/opportunities" element={<Opportunities />} />
          <Route path="/campaigns/:id" element={<CampaignReview />} />
          <Route path="/campaigns/:id/results" element={<Results />} />
        </Routes>
      </main>
    </div>
  )
}
