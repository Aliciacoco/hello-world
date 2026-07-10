import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import WrongAnswers from './pages/WrongAnswers'

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/wrong-answers" element={<WrongAnswers />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
