import { useEffect, useState } from 'react'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/cn'

export default function StatusBar({ className }: { className?: string }): JSX.Element {
  const [online, setOnline] = useState(false)
  const [queued, setQueued] = useState(0)

  useEffect(() => {
    void window.afisant.sync.status().then((s) => {
      setOnline(s.online)
      setQueued(s.queued)
    })
    const off = window.afisant.on.syncStatus((s) => {
      setOnline(s.online)
      setQueued(s.queued)
    })
    const t = setInterval(() => {
      void window.afisant.sync.status().then((s) => {
        setOnline(s.online)
        setQueued(s.queued)
      })
    }, 5000)
    return () => {
      off()
      clearInterval(t)
    }
  }, [])

  return (
    <div className={cn('flex items-center gap-3 text-xs', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
          online ? 'bg-brand-success/15 text-brand-success' : 'bg-brand-warn/15 text-brand-warn'
        )}
      >
        {online ? <Wifi size={12} /> : <WifiOff size={12} />}
        {online ? 'Onlayn' : 'Oflayn'}
      </span>
      {queued > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-info/15 px-2.5 py-1 text-brand-info">
          <RefreshCw size={12} className="animate-spin" />
          {queued} sinx
        </span>
      )}
    </div>
  )
}
