import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Languages, Printer, Shield, Store, TestTube2, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Lang, Settings, Waiter } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { initials } from '@/lib/format'
import { cn } from '@/lib/cn'
import PinPad from '@/components/PinPad'
import { KbInput } from '@/components/VirtualKeyboard'

export default function SettingsPage(): JSX.Element {
  const navigate = useNavigate()
  const { settings, load, patch } = useSettings()
  const waiter = useAuth((s) => s.waiter)
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [pinTarget, setPinTarget] = useState<Waiter | null>(null)

  useEffect(() => {
    void window.afisant.auth.listWaiters().then(setWaiters)
  }, [])

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

  const testPrint = async (): Promise<void> => {
    const r = await window.afisant.printer.test()
    if (r.ok) toast.success('Test chek yuborildi')
    else toast.error('Xatolik', { description: (r as any).error })
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
        <Section title="Tashkilot" icon={<Store size={16} />}>
          <Field label="Tashkilot nomi">
            <KbInput
              className="input"
              value={form.organizationName}
              onChange={(v) => update('organizationName', v)}
            />
          </Field>
          <Field label="Xizmat haqi (%)">
            <KbInput
              type="number"
              className="input"
              min={0}
              max={20}
              step={0.5}
              value={form.serviceFeePercent}
              onChange={(v) => update('serviceFeePercent', Number(v))}
              layout="numeric"
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
              <KbInput
                className="input font-mono text-sm"
                placeholder="192.168.1.100"
                value={form.printerIp ?? ''}
                onChange={(v) => update('printerIp', v || null)}
                layout="numeric"
              />
            </Field>
          )}
          {(form.printerType === 'usb' || form.printerType === 'windows') && (
            <Field label="Printer nomi">
              <KbInput
                className="input"
                placeholder="XPrinter XP-58 yoki Windows printer nomi"
                value={form.printerName ?? ''}
                onChange={(v) => update('printerName', v || null)}
              />
            </Field>
          )}
          <Field label="Chek sarlavhasi">
            <KbInput
              className="input"
              value={form.receiptHeader ?? ''}
              onChange={(v) => update('receiptHeader', v || null)}
            />
          </Field>
          <Field label="Chek pastki yozuvi">
            <KbInput
              className="input"
              value={form.receiptFooter ?? ''}
              onChange={(v) => update('receiptFooter', v || null)}
            />
          </Field>
          <button onClick={() => void testPrint()} className="btn-ghost mt-1">
            <TestTube2 size={14} /> Test chek
          </button>
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
