import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import PointToast from './components/PointToast'
import Home from './pages/Home'
import BankPage from './pages/BankPage'
import PointsPage from './pages/PointsPage'
import ConfigPage from './pages/ConfigPage'
import DailyExplore from './components/DailyExplore'
import CheckinPage from './pages/CheckinPage'
import { CheckinProvider } from './contexts/CheckinContext'

// 路由切换时回到顶部，避免沿用上一页的滚动位置导致标题/顶部按钮被固定导航栏遮挡
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    const root = document.documentElement
    const prev = root.style.scrollBehavior
    root.style.scrollBehavior = 'auto' // 临时关掉平滑滚动，保证瞬间复位
    window.scrollTo(0, 0)
    root.style.scrollBehavior = prev
  }, [pathname])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <CheckinProvider>
        <Navbar />
        <PointToast />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/bank" element={<BankPage />} />
            <Route path="/points" element={<PointsPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/explore" element={<DailyExplore />} />
            <Route path="/checkin" element={<CheckinPage />} />
          </Routes>
        </main>
      </CheckinProvider>
    </BrowserRouter>
  )
}
