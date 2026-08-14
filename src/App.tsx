import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import PointToast from './components/PointToast'
import Home from './pages/Home'
import BankPage from './pages/BankPage'
import PointsPage from './pages/PointsPage'
import DailyExplore from './components/DailyExplore'
import CheckinPage from './pages/CheckinPage'
import { CheckinProvider } from './contexts/CheckinContext'

export default function App() {
  return (
    <BrowserRouter>
      <CheckinProvider>
        <Navbar />
        <PointToast />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/bank" element={<BankPage />} />
            <Route path="/points" element={<PointsPage />} />
            <Route path="/explore" element={<DailyExplore />} />
            <Route path="/checkin" element={<CheckinPage />} />
          </Routes>
        </main>
      </CheckinProvider>
    </BrowserRouter>
  )
}
