import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Languages, Printer, Server, Store, TestTube2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Lang, Settings } from '@shared/types'
import { useSettings } from '@/stores/settings'
import { cn } from '@/lib/cn'

export default function SettingsPage(): JSX.Element {
  const navigate = useNavigate()
  const { settings, load, patch } = useSettings()
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)

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
        <button onClick={() => navigate(-1)} className="btn-ghost">
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

        <Section title="Server" icon={<Server size={16} />}>
          <Field label="API URL">
            <input
              className="input font-mono text-xs"
              value={form.serverUrl}
              onChange={(e) => update('serverUrl', e.target.value)}
            />
          </Field>
          <Field label="WebSocket URL">
            <input
              className="input font-mono text-xs"
              value={form.serverWsUrl}
              onChange={(e) => update('serverWsUrl', e.target.value)}
            />
          </Field>
          <Field label="API Token">
            <input
              type="password"
              className="input font-mono text-xs"
              value={form.apiToken ?? ''}
              onChange={(e) => update('apiToken', e.target.value || null)}
            />
          </Field>
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
          {(form.printerType === 'usb' || form.printerType === 'windows') && (
            <Field label="Printer nomi">
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
          <button onClick={() => void testPrint()} className="btn-ghost mt-1">
            <TestTube2 size={14} /> Test chek
          </button>
        </Section>
      </main>
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
