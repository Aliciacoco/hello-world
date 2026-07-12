import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import PointToast from './components/PointToast'
import Home from './pages/Home'
import BankPage from './pages/BankPage'
import PointsPage from './pages/PointsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <PointToast />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/bank" element={<BankPage />} />
          <Route path="/points" element={<PointsPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
