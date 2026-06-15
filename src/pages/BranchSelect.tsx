import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Building2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import type { BranchInfo } from '@shared/types'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'
import { cn } from '@/lib/cn'

export default function BranchSelectPage(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const loadMenu = useMenu((s) => s.load)
  const loadTables = useTables((s) => s.load)

  useEffect(() => {
    const state = location.state as { branches?: BranchInfo[] } | null
    if (state?.branches && state.branches.length > 0) {
      setBranches(state.branches)
    } else {
      navigate('/server-login', { replace: true })
    }
  }, [location.state, navigate])

  const handleSelect = async (branch: BranchInfo): Promise<void> => {
    setSelected(branch.id)
    setLoading(true)
    try {
      const res = await window.afisant.auth.selectBranch(branch.id, branch.name)
      if (!res.ok) {
        toast.error("Filial tanlanmadi")
        return
      }
      toast.loading("Ma'lumotlar yuklanmoqda…", { id: 'sync' })
      const syncRes = await window.afisant.sync.fullPull()
      toast.dismiss('sync')
      if (syncRes.ok) {
        await Promise.all([loadMenu(), loadTables()])
        toast.success(`${branch.name} fililiga ulandi`)
      } else {
        toast.error("Ma'lumotlar yuklanmadi, qayta urinib ko'ring")
      }
      navigate('/select-waiter', { replace: true })
    } catch {
      toast.error('Xatolik yuz berdi')
    } finally {
      setLoading(false)
      setSelected(null)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-8">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-primary/15 text-brand-primary">
            <Building2 size={26} />
          </div>
          <h2 className="text-2xl font-semibold">Filial tanlang</h2>
          <p className="mt-1 text-sm text-ink-soft">Qaysi filialda ishlayapsiz?</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {branches.map((branch, idx) => (
            <button
              key={branch.id}
              onClick={() => void handleSelect(branch)}
              disabled={loading}
              className={cn(
                'relative flex flex-col items-start gap-2 rounded-2xl border p-5 text-left transition-all',
                selected === branch.id
                  ? 'border-brand-primary bg-brand-primary/10 shadow-glow-amber'
                  : 'border-line bg-bg-card hover:border-brand-primary/40 hover:bg-bg-elevated'
              )}
            >
              <div className="flex w-full items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-primary/10 text-brand-primary">
                  <Building2 size={18} />
                </div>
                <div>
                  <p className="font-semibold">{branch.name}</p>
                  {branch.addres && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
                      <MapPin size={10} /> {branch.addres}
                    </p>
                  )}
                </div>
              </div>
              {selected === branch.id && loading && (
                <div className="absolute inset-0 grid place-items-center rounded-2xl bg-bg-card/80">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
