import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App'
import { KeyboardProvider } from './components/VirtualKeyboard'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <KeyboardProvider>
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
      </KeyboardProvider>
    </HashRouter>
  </React.StrictMode>
)
