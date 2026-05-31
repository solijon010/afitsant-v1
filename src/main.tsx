import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App'
import './styles/globals.css'

// Global click sound effect
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
function playSoftClick() {
  if (audioCtx.state === 'suspended') void audioCtx.resume()
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(800, audioCtx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.05)
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05)
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start()
  osc.stop(audioCtx.currentTime + 0.05)
}

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  const isClickable = target.closest('button') || target.closest('a') || getComputedStyle(target).cursor === 'pointer'
  if (isClickable) {
    try { playSoftClick() } catch (err) { /* ignore audio errors */ }
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'rgba(10, 22, 40, 0.95)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#e6edf7'
          }
        }}
      />
    </HashRouter>
  </React.StrictMode>
)
