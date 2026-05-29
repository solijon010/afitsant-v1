import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, FolderOpen, Globe, GripVertical, Languages, LayoutList, Printer, ScanLine, Shield, ShieldCheck, Store, TestTube2, Users, X, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { Category, Lang, Settings, Waiter } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useMenu } from '@/stores/menu'
import { useSettings } from '@/stores/settings'
import { initials } from '@/lib/format'
import { cn } from '@/lib/cn'
import PinPad from '@/components/PinPad'

export default function SettingsPage(): JSX.Element {
  const navigate = useNavigate()
  const { settings, load, patch } = useSettings()
  const waiter = useAuth((s) => s.waiter)
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [usbDevices, setUsbDevices] = useState<Array<{ product: string }>>([])
  const [detecting, setDetecting] = useState(false)
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [pinTarget, setPinTarget] = useState<Waiter | null>(null)
  const [diagInfo, setDiagInfo] = useState<{ hasToken: boolean; branchId: string | null; serverUrl: string; logPath: string } | null>(null)
  const [catRows, setCatRows] = useState<CatRow[]>([])
  const [catSaving, setCatSaving] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const loadMenu = useMenu((s) => s.load)

  useEffect(() => {
    void window.afisant.auth.listWaiters().then(setWaiters)
    void window.afisant.diag.getInfo().then(setDiagInfo)
    void loadCatRows()
  }, [])

  const loadCatRows = async (): Promise<void> => {
    const [cats, configs] = await Promise.all([
      window.afisant.menu.getCategories(),
      window.afisant.category.configGet()
    ])
    const configMap = new Map(configs.map((c) => [c.serverId, c]))
    const rows: CatRow[] = cats.map((cat, i) => {
      const cfg = cat.serverId ? configMap.get(cat.serverId) : undefined
      return {
        cat,
        localName: cfg?.localName ?? cat.nameUzLatn,
        sortOrder: cfg?.sortOrderOverride ?? i,
        isHidden: cfg?.isHidden ?? false,
        moveTarget: null
      }
    }).sort((a, b) => a.sortOrder - b.sortOrder)
    // Agar config bo'lmasa ham barcha serverId'li kategoriyalarni ko'rsatamiz
    setCatRows(rows)
  }

  const saveCatConfigs = async (): Promise<void> => {
    setCatSaving(true)
    try {
      const configs = catRows
        .filter((r) => r.cat.serverId)
        .map((r, i) => ({
          serverId: r.cat.serverId!,
          localName: r.localName.trim() || null,
          sortOrderOverride: i,
          isHidden: r.isHidden
        }))
      await window.afisant.category.configSave(configs)
      // Kesh yangilash — Order sahifasi ham yangi tartibni ko'rsin
      await Promise.all([loadCatRows(), loadMenu()])
      toast.success("Kategoriyalar saqlandi")
    } catch (e: any) {
      toast.error("Saqlashda xatolik", { description: e?.message })
    } finally {
      setCatSaving(false)
    }
  }

  useEffect(() => {
    if (!settings) void load()
  }, [settings, load])

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  if (!form) return <div className="grid h-full place-items-center"><div className="card h-24 w-72 animate-pulse" /></div>

  const update = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await patch(form)
      toast.success('Saqlandi')
    } finally {
      setSaving(false)
    }
  }

  const detectUsb = async (): Promise<void> => {
    setDetecting(true)
    try {
      const devices = await window.afisant.printer.listUsb()
      const found = devices.filter((d) => d.product).map((d) => ({ product: d.product! }))
      setUsbDevices(found)
      if (found.length === 1) {
        setForm((f) => f ? { ...f, printerDevicePath: found[0].product } : f)
        toast.success(`Qurilma aniqlandi: ${found[0].product}`)
      } else if (found.length === 0) {
        toast.warning('USB printer topilmadi. /dev/usb/lp0 yo\'lini tekshiring')
      }
    } finally {
      setDetecting(false)
    }
  }

  const testPrint = async (): Promise<void> => {
    // Avval joriy sozlamalarni saqlab, keyin test qilamiz
    if (form) {
      try { await patch(form) } catch { /* saqlanmasa ham testni davom ettir */ }
    }
    const r = await window.afisant.printer.test()
    if (r.ok) toast.success('Test chek yuborildi')
    else toast.error('Printer xatosi', { description: (r as any).error })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <button onClick={() => navigate(waiter ? -1 : '/select-waiter')} className="btn-ghost">
          <ArrowLeft size={16} /> Orqaga
        </button>
        <h1 className="text-lg font-semibold">Sozlamalar</h1>
        <button onClick={() => void save()} className="btn-primary" disabled={saving}>
          {saving ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 pb-10">
        <Section title="Server" icon={<Globe size={16} />}>
          <Field label="Server manzili (URL)">
            <input
              className="input font-mono text-sm"
              placeholder="https://api-restaurant.hisobchim.uz"
              value={form.serverUrl ?? ''}
              onChange={(e) => update('serverUrl', e.target.value)}
            />
          </Field>
          {diagInfo && (
            <div className="mt-2 rounded-xl border border-line bg-bg-elevated p-3 space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                {diagInfo.hasToken
                  ? <CheckCircle2 size={13} className="text-brand-success shrink-0" />
                  : <XCircle size={13} className="text-brand-danger shrink-0" />}
                <span className="text-ink-soft">Token: </span>
                <span className={diagInfo.hasToken ? 'text-brand-success' : 'text-brand-danger'}>
                  {diagInfo.hasToken ? 'Mavjud' : "Yo'q — qayta login qiling"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {diagInfo.branchId
                  ? <CheckCircle2 size={13} className="text-brand-success shrink-0" />
                  : <XCircle size={13} className="text-brand-danger shrink-0" />}
                <span className="text-ink-soft">Filial ID: </span>
                <span className={cn('font-mono', diagInfo.branchId ? 'text-ink' : 'text-brand-danger')}>
                  {diagInfo.branchId ? `${diagInfo.branchId.slice(0, 8)}…` : "Saqlanmagan"}
                </span>
              </div>
              <button
                onClick={() => void window.afisant.diag.openLogs()}
                className="mt-1 flex items-center gap-1.5 text-ink-soft hover:text-ink transition-colors"
              >
                <FolderOpen size={12} />
                Log papkasini och
              </button>
            </div>
          )}
        </Section>

        <Section title="Tashkilot" icon={<Store size={16} />}>
          <Field label="Tashkilot nomi">
            <input
              className="input"
              value={form.organizationName}
              onChange={(e) => update('organizationName', e.target.value)}
            />
          </Field>
          <Field label="Xizmat haqi (%)">
            <input
              type="number"
              className="input"
              min={0}
              max={20}
              step={0.5}
              value={form.serviceFeePercent}
              onChange={(e) => update('serviceFeePercent', Number(e.target.value))}
            />
          </Field>
        </Section>

        <Section title="Til" icon={<Languages size={16} />}>
          <div className="grid grid-cols-2 gap-2">
            {(['uz-latn', 'uz-cyrl'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => update('language', l)}
                className={cn(
                  'rounded-2xl border px-4 py-3 text-sm font-medium transition-all',
                  form.language === l
                    ? 'border-brand-success bg-brand-success/10 text-brand-success'
                    : 'border-line bg-bg-card text-ink-soft hover:border-line-strong hover:text-ink'
                )}
              >
                {l === 'uz-latn' ? "O'zbek (lotin)" : 'Ўзбек (кирилл)'}
              </button>
            ))}
          </div>
        </Section>


        <Section title="Printer" icon={<Printer size={16} />}>
          <Field label="Turi">
            <div className="grid grid-cols-3 gap-2">
              {(['usb', 'network', 'windows'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => update('printerType', t)}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-sm transition-all',
                    form.printerType === t
                      ? 'border-brand-success bg-brand-success/10 text-brand-success'
                      : 'border-line bg-bg-card text-ink-soft hover:border-line-strong hover:text-ink'
                  )}
                >
                  {t.toUpperCase()}
                </button>
              ))}
              <button
                onClick={() => update('printerType', null)}
                className={cn(
                  'col-span-3 rounded-xl border px-3 py-2 text-xs transition-all',
                  !form.printerType
                    ? 'border-brand-warn/40 bg-brand-warn/10 text-brand-warn'
                    : 'border-line bg-bg-card text-ink-dim hover:text-ink'
                )}
              >
                {form.printerType ? "O'chirish" : 'Printer ulanmagan'}
              </button>
            </div>
          </Field>
          {form.printerType === 'network' && (
            <Field label="Printer IP">
              <input
                className="input font-mono text-sm"
                placeholder="192.168.1.100"
                value={form.printerIp ?? ''}
                onChange={(e) => update('printerIp', e.target.value || null)}
              />
            </Field>
          )}
          {form.printerType === 'usb' && (
            <Field label="USB qurilma yo'li">
              <div className="flex gap-2">
                <input
                  className="input flex-1 font-mono text-sm"
                  placeholder="/dev/usb/lp0"
                  value={form.printerDevicePath ?? '/dev/usb/lp0'}
                  onChange={(e) => update('printerDevicePath', e.target.value || '/dev/usb/lp0')}
                />
                <button
                  onClick={() => void detectUsb()}
                  disabled={detecting}
                  className="btn-ghost shrink-0"
                  title="USB qurilmalarni avtomatik aniqlash"
                >
                  <ScanLine size={14} /> {detecting ? '…' : 'Aniqlash'}
                </button>
              </div>
              {usbDevices.length > 1 && (
                <div className="mt-2 space-y-1">
                  {usbDevices.map((d) => (
                    <button
                      key={d.product}
                      onClick={() => update('printerDevicePath', d.product)}
                      className={cn(
                        'w-full rounded-xl border px-3 py-1.5 text-left font-mono text-xs transition-all',
                        form.printerDevicePath === d.product
                          ? 'border-brand-success bg-brand-success/10 text-brand-success'
                          : 'border-line bg-bg-card text-ink-soft hover:border-line-strong hover:text-ink'
                      )}
                    >
                      {d.product}
                    </button>
                  ))}
                </div>
              )}
            </Field>
          )}
          {form.printerType === 'windows' && (
            <Field label="Printer nomi (Windows)">
              <input
                className="input"
                placeholder="XPrinter XP-58 yoki Windows printer nomi"
                value={form.printerName ?? ''}
                onChange={(e) => update('printerName', e.target.value || null)}
              />
            </Field>
          )}
          <Field label="Chek sarlavhasi">
            <input
              className="input"
              value={form.receiptHeader ?? ''}
              onChange={(e) => update('receiptHeader', e.target.value || null)}
            />
          </Field>
          <Field label="Chek pastki yozuvi">
            <input
              className="input"
              value={form.receiptFooter ?? ''}
              onChange={(e) => update('receiptFooter', e.target.value || null)}
            />
          </Field>
          <div className="flex gap-2">
            <button onClick={() => void testPrint()} className="btn-ghost flex-1">
              <TestTube2 size={14} /> Test chek
            </button>
            {form.printerType === 'usb' && (
              <button
                onClick={() => void (async () => {
                  const r = await window.afisant.printer.fixPerms()
                  if (r.ok) toast.success('Printer ruxsati muvaffaqiyatli o\'rnatildi!')
                  else toast.error('Ruxsat berishda xatolik', { description: (r as any).error })
                })()}
                className="btn-ghost flex-1"
                title="USB printer uchun udev qoidasini o'rnatish (parol so'ralishi mumkin)"
              >
                <ShieldCheck size={14} /> Ruxsat berish
              </button>
            )}
          </div>
        </Section>

        <Section title="Kategoriyalar" icon={<LayoutList size={16} />}>
          {catRows.length === 0 ? (
            <p className="text-sm text-ink-soft">Kategoriyalar topilmadi. Avval sinxronlang.</p>
          ) : (
            <div className="space-y-1.5">
              {catRows.map((row, i) => (
                <div
                  key={row.cat.id}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (dragOverIdx !== i) setDragOverIdx(i)
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverIdx(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragIdx === null || dragIdx === i) { setDragOverIdx(null); return }
                    const next = [...catRows]
                    const [removed] = next.splice(dragIdx, 1)
                    next.splice(i, 0, removed)
                    setCatRows(next)
                    setDragIdx(null)
                    setDragOverIdx(null)
                  }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2 transition-all',
                    dragIdx === i
                      ? 'opacity-30 border-line bg-bg-card'
                      : dragOverIdx === i
                        ? 'border-brand-primary bg-brand-primary/5 shadow-sm'
                        : 'border-line bg-bg-card hover:border-line-strong'
                  )}
                >
                  {/* Drag handle */}
                  <GripVertical
                    size={15}
                    draggable
                    onDragStart={(e) => {
                      setDragIdx(i)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    className="shrink-0 cursor-grab text-ink-dim select-none active:cursor-grabbing"
                  />

                  {/* Nom */}
                  <input
                    className="input flex-1 py-1.5 text-sm"
                    value={row.localName}
                    onChange={(e) => {
                      const next = [...catRows]
                      next[i] = { ...next[i], localName: e.target.value }
                      setCatRows(next)
                    }}
                  />

                  {/* Ko'rinish toggle */}
                  <button
                    onClick={() => {
                      const next = [...catRows]
                      next[i] = { ...next[i], isHidden: !next[i].isHidden }
                      setCatRows(next)
                    }}
                    title={row.isHidden ? "Ko'rsatish" : "Yashirish"}
                    className={cn('transition-colors', row.isHidden ? 'text-brand-danger' : 'text-ink-soft hover:text-ink')}
                  >
                    {row.isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>

                  {/* Mahsulotlarni ko'chirish */}
                  <select
                    className="rounded-lg border border-line bg-bg-card px-2 py-1 text-xs text-ink-soft"
                    defaultValue=""
                    onChange={async (e) => {
                      const toId = e.target.value
                      if (!toId || !row.cat.serverId) return
                      const r = await window.afisant.category.moveProducts(row.cat.serverId, toId)
                      toast.success(`${r.moved} mahsulot ko'chirildi`)
                      e.target.value = ''
                    }}
                  >
                    <option value="">Ko'chirish…</option>
                    {catRows
                      .filter((r) => r.cat.id !== row.cat.id && r.cat.serverId)
                      .map((r) => (
                        <option key={r.cat.id} value={r.cat.serverId!}>
                          → {r.localName}
                        </option>
                      ))}
                  </select>
                </div>
              ))}
              <button
                onClick={() => void saveCatConfigs()}
                disabled={catSaving}
                className="btn-primary mt-2 w-full"
              >
                {catSaving ? 'Saqlanmoqda…' : 'Kategoriyalarni saqlash'}
              </button>
            </div>
          )}
        </Section>

        <Section title="Afitsantlar" icon={<Users size={16} />}>
          {waiters.length === 0 ? (
            <p className="text-sm text-ink-soft">Afitsantlar topilmadi</p>
          ) : (
            <div className="space-y-2">
              {waiters.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between rounded-xl border border-line bg-bg-elevated px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-info/30 to-brand-purple/30 text-sm font-semibold">
                      {initials(w.firstName, w.lastName)}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-tight">
                        {w.firstName} {w.lastName}
                      </p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-ink-soft">
                        {w.role === 'super_waiter' && <Shield size={9} />}
                        {w.role === 'super_waiter' ? 'Super afitsant' : w.role === 'manager' ? 'Manager' : 'Afitsant'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setPinTarget(w)}
                    className="rounded-lg border border-line bg-bg-card px-3 py-1.5 text-xs text-ink-soft hover:border-line-strong hover:text-ink transition-all"
                  >
                    PIN o'zgartirish
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </main>

      {pinTarget && (
        <PinModal
          waiter={pinTarget}
          onClose={() => setPinTarget(null)}
          onSaved={() => setPinTarget(null)}
        />
      )}
    </div>
  )
}

interface CatRow {
  cat: Category
  localName: string
  sortOrder: number
  isHidden: boolean
  moveTarget: string | null
}

function Section({
  title,
  icon,
  children
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}): JSX.Element {
  return (
    <section className="card mt-4 p-5">
      <h2 className="mb-4 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ink-soft">
        {icon}
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  )
}

function PinModal({
  waiter,
  onClose,
  onSaved
}: {
  waiter: Waiter
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [pin, setPin] = useState('')
  const [saving, setSaving] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    overlayRef.current?.focus()
  }, [])

  // Escape tugmasi — PinPad keyboard listener Escape ni tutmaydi
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async (raw: string): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      const res = await window.afisant.auth.setPin(waiter.id, raw)
      if (res.ok) {
        toast.success(`${waiter.firstName} uchun PIN saqlandi`)
        onSaved()
      } else {
        toast.error(res.message ?? 'Xatolik')
        setPin('')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm outline-none"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-xs rounded-3xl border border-line bg-bg-card p-7 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-ink-dim hover:bg-bg-elevated hover:text-ink transition-all"
        >
          <X size={16} />
        </button>

        <div className="mb-1 flex flex-col items-center gap-2">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-brand-info/30 to-brand-purple/30 text-lg font-semibold">
            {initials(waiter.firstName, waiter.lastName)}
          </div>
          <p className="text-base font-semibold">{waiter.firstName} {waiter.lastName}</p>
          <p className="text-xs text-ink-soft">Yangi 4 xonali PIN kiriting</p>
        </div>

        <PinPad
          pin={pin}
          onChange={setPin}
          disabled={saving}
          onSubmit={(raw) => void save(raw)}
        />
      </div>
    </div>
  )
}
