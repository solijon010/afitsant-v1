import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ClipboardList, Eye, EyeOff, FolderOpen, Globe, GripVertical, Languages, LayoutList, Printer, RefreshCw, ScanLine, Shield, ShieldCheck, Store, TestTube2, Users, X, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { Category, Lang, Settings, Waiter } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useMenu } from '@/stores/menu'
import { useSettings } from '@/stores/settings'
import { initials } from '@/lib/format'
import { cn } from '@/lib/cn'
import PinPad from '@/components/PinPad'

interface PrinterOption {
  vendorId: string
  productId: string
  manufacturer?: string
  product: string
  online?: boolean
  statusText?: string
}

interface DiagRecentOrder {
  id: string
  status: string
  room: string
  waiter: string
  total: number
  itemCount: number
  createdAt: string
}

interface WaiterDiagResult {
  branchId: string | null
  serverUrl: string
  chosenUrl: string | null
  count: number
  users: string[]
  blocked: Array<{ url: string; status: number | string }>
  note: string
}

interface RoomsDiagCheck {
  label: string
  chosenUrl: string | null
  blocked: Array<{ url: string; status: number | string }>
  count: number
  firstItemKeys: string[]
  sample: Array<{
    id: string
    name: string
    status?: string
    roomCategoryId?: string
    roomCategory?: { id: string; name: string }
    categoryId?: string
  }>
}

interface RoomsDiagResult {
  branchId: string | null
  serverUrl: string
  roomCategories: RoomsDiagCheck
  rooms: RoomsDiagCheck
}

export default function SettingsPage(): JSX.Element {
  const navigate = useNavigate()
  const { settings, load, patch } = useSettings()
  const waiter = useAuth((s) => s.waiter)
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [usbDevices, setUsbDevices] = useState<PrinterOption[]>([])
  const [detecting, setDetecting] = useState(false)
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [pinTarget, setPinTarget] = useState<Waiter | null>(null)
  const [diagInfo, setDiagInfo] = useState<{ hasToken: boolean; branchId: string | null; serverUrl: string; logPath: string } | null>(null)
  const [recentOrders, setRecentOrders] = useState<DiagRecentOrder[] | null>(null)
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [dbStatus, setDbStatus] = useState<{ waiters: { total: number; withServerId: number; list: string[] }; products: { total: number; withServerId: number }; tables: { total: number; withServerId: number; list: string[] }; token: string | null; branchId: string | null } | null>(null)
  const [loadingDb, setLoadingDb] = useState(false)
  const [roomsTest, setRoomsTest] = useState<RoomsDiagResult | null>(null)
  const [loadingRooms, setLoadingRooms] = useState(false)
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

  /* Manager yoki hech kim kirmagan (admin rejim) → texnik ma'lumotlar ko'rsatiladi */
  const isAdmin = !waiter || waiter.role === 'manager' || waiter.role === 'super_waiter'

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

  const isWindows = navigator.userAgent.toLowerCase().includes('windows')

  const detectUsb = async (): Promise<void> => {
    setDetecting(true)
    try {
      const devices = await window.afisant.printer.listUsb()
      const found: PrinterOption[] = devices
        .filter((d): d is PrinterOption => typeof d.product === 'string' && d.product.length > 0)
        .map((d) => ({
          vendorId: d.vendorId,
          productId: d.productId,
          manufacturer: d.manufacturer,
          product: d.product,
          online: d.online,
          statusText: d.statusText
        }))
      setUsbDevices(found)
      const onlineFound = found.filter((d) => d.online !== false)
      if (onlineFound.length === 1) {
        const d = onlineFound[0]
        if (isWindows) {
          const isUsbPort = d.vendorId === 'usb-port'
          if (isUsbPort) {
            setForm((f) => f ? {
              ...f,
              printerDevicePath: d.product,
              printerName: d.manufacturer ?? f.printerName
            } : f)
            toast.success(`USB port aniqlandi: ${d.product} — Test chek bosing`)
          } else {
            setForm((f) => f ? { ...f, printerType: 'windows', printerName: d.product } : f)
            toast.success(`Windows printer aniqlandi: ${d.product}`)
          }
        } else {
          setForm((f) => f ? { ...f, printerDevicePath: d.product } : f)
          toast.success(`Printer aniqlandi: ${d.product}`)
        }
      } else if (found.length === 1) {
        const d = found[0]
        toast.warning(`${d.product} topildi, lekin offline holatda: ${d.statusText ?? 'ulanmagan'}`)
      } else if (found.length > 1) {
        toast.info(`${found.length} ta printer topildi — online bo'lganini tanlang`)
      } else if (found.length === 0) {
        if (isWindows) {
          toast.warning("Windows printerlar topilmadi. Printer drayveri o'rnatilganligini tekshiring")
        } else {
          toast.warning("USB printer topilmadi. Printerni ulab qayta urining")
        }
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

  const handleBack = (): void => {
    if (waiter) navigate(-1)
    else navigate('/select-waiter')
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <button onClick={handleBack} className="btn-ghost">
          <ArrowLeft size={16} /> Orqaga
        </button>
        <h1 className="text-lg font-semibold">Sozlamalar</h1>
        <button onClick={() => void save()} className="btn-primary" disabled={saving}>
          {saving ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 pb-10">
        <Section title="Server" icon={<Globe size={16} />}>
          {isAdmin ? (
            /* ── Admin: to'liq server sozlamalari ── */
            <>
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
                  <button
                    onClick={async () => {
                      const res = await window.afisant.diag.testWaiters()
                      const waiterDiag = res as WaiterDiagResult
                      const lines = [
                        `branchId: ${waiterDiag.branchId ?? '—'}`,
                        `serverUrl: ${waiterDiag.serverUrl}`,
                        '',
                        waiterDiag.note,
                        ''
                      ]
                      if (waiterDiag.chosenUrl) {
                        lines.push(`Ishlagan endpoint: ${waiterDiag.chosenUrl}`)
                        lines.push(`Soni: ${waiterDiag.count} ta`)
                        lines.push(...(waiterDiag.users.length > 0 ? waiterDiag.users.map((u) => `  ${u}`) : ["  (bo'sh)"]))
                        lines.push('')
                      }
                      if (waiterDiag.blocked.length > 0) {
                        lines.push('Yopiq endpointlar:')
                        lines.push(...waiterDiag.blocked.map((b) => `  ${b.url}: HTTP ${b.status}`))
                      }
                      alert(`Afitsant API natijasi:\n\n${lines.join('\n')}`)
                      return
                      const msg = Object.entries(res)
                        .map(([k, v]: [string, any]) =>
                          v?.error !== undefined
                            ? `❌ ${k}: HTTP ${v.error}`
                            : v?.count !== undefined
                              ? `✅ ${k}: ${v.count} ta\n   ${(v.users as string[] ?? []).join('\n   ') || "(bo'sh)"}`
                              : `${k}: ${String(v)}`
                        ).join('\n\n')
                      alert(`Afitsant API natijasi:\n\n${msg}`)
                    }}
                    className="mt-1 flex items-center gap-1.5 text-brand-info hover:text-ink transition-colors"
                  >
                    <RefreshCw size={12} />
                    Afitsantlarni server dan tekshir
                  </button>
                </div>
              )}
            </>
          ) : (
            /* ── Oddiy afitsant: faqat ulanish holati ── */
            <div className="flex items-center gap-2 rounded-xl border border-line bg-bg-elevated px-4 py-3 text-sm">
              {diagInfo?.hasToken
                ? <CheckCircle2 size={15} className="text-brand-success shrink-0" />
                : <XCircle size={15} className="text-brand-danger shrink-0" />}
              <span className={diagInfo?.hasToken ? 'text-brand-success font-medium' : 'text-brand-danger'}>
                {diagInfo?.hasToken ? 'Server bilan ulangan' : "Ulanmagan — managerga murojaat qiling"}
              </span>
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
          <Field label="Manzil">
            <textarea
              className="input min-h-[84px] resize-y"
              placeholder="Andijon viloyat, Shahrixon tumani"
              value={form.organizationAddress ?? ''}
              onChange={(e) => update('organizationAddress', e.target.value || null)}
            />
          </Field>
          <Field label="Telefon">
            <input
              className="input"
              placeholder="+99833 904 20 20"
              value={form.organizationPhone ?? ''}
              onChange={(e) => update('organizationPhone', e.target.value || null)}
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
            isWindows ? (
              /* Windows: USB port orqali driver siz chop etish */
              <Field label="USB Port">
                <p className="mb-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 border border-green-200">
                  ✅ Driver kerak emas! Windows USB port orqali to'g'ridan chop etiladi.
                  Printer ulangan bo'lsa "Aniqlash" tugmasini bosing.
                </p>
                <p className="mb-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                  Faqat ESC/POS thermal chek printer uchun. Canon, HP, Epson A4 printerlar bu rejimda ishlamaydi.
                </p>
                {!!form.printerDevicePath && !form.printerName && (
                  <p className="mb-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 border border-red-200">
                    Printer nomi birikmagan. "Aniqlash" orqali XP-80C ni qayta tanlang.
                  </p>
                )}
                <div className="flex gap-2">
                  <input
                    className="input flex-1 font-mono text-sm"
                    placeholder="USB001"
                    value={form.printerDevicePath ?? 'USB001'}
                    onChange={(e) => update('printerDevicePath', e.target.value || 'USB001')}
                  />
                  <button
                    onClick={() => void detectUsb()}
                    disabled={detecting}
                    className="btn-ghost shrink-0"
                    title="USB printerlarni avtomatik aniqlash"
                  >
                    <ScanLine size={14} /> {detecting ? '…' : 'Aniqlash'}
                  </button>
                </div>
                {usbDevices.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {usbDevices.map((d) => (
                      <button
                        key={d.product}
                        onClick={() => {
                          const isUsbPort = d.vendorId === 'usb-port'
                          if (isUsbPort) {
                            update('printerDevicePath', d.product ?? 'USB001')
                            if (d.manufacturer) update('printerName', d.manufacturer)
                          } else {
                            update('printerType', 'windows')
                            update('printerName', d.product ?? '')
                          }
                        }}
                        className={cn(
                          'w-full rounded-xl border px-3 py-1.5 text-left text-xs transition-all',
                          d.online === false
                            ? 'border-brand-danger/30 bg-brand-danger/5 text-brand-danger'
                            : (form.printerDevicePath === d.product || form.printerName === d.product)
                              ? 'border-brand-success bg-brand-success/10 text-brand-success'
                              : 'border-line bg-bg-card text-ink-soft hover:border-line-strong hover:text-ink'
                        )}
                      >
                        {d.vendorId === 'usb-port' ? '🔌' : '🖨'} {d.product}
                        {d.manufacturer && <span className="ml-1 opacity-60">({d.manufacturer})</span>}
                        {d.online === false && <span className="ml-1 font-medium">(offline)</span>}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
            ) : (
              /* Linux: device path */
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
            )
          )}
          {form.printerType === 'windows' && (
            <Field label="Printer nomi (Windows)">
              <p className="mb-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                Thermal printer tanlang. Oddiy A4 printerlarda POS chek formati to'g'ri chiqmasligi mumkin.
              </p>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="XPrinter XP-58 yoki Windows printer nomi"
                  value={form.printerName ?? ''}
                  onChange={(e) => update('printerName', e.target.value || null)}
                />
                <button
                  onClick={() => void detectUsb()}
                  disabled={detecting}
                  className="btn-ghost shrink-0"
                  title="Windows printerlarni avtomatik aniqlash"
                >
                  <ScanLine size={14} /> {detecting ? '…' : 'Aniqlash'}
                </button>
              </div>
              {usbDevices.filter((d) => d.vendorId !== 'usb-port').length > 0 && (
                <div className="mt-2 space-y-1">
                  {usbDevices.filter((d) => d.vendorId !== 'usb-port').map((d) => (
                    <button
                      key={d.product}
                      onClick={() => update('printerName', d.product)}
                      className={cn(
                        'w-full rounded-xl border px-3 py-1.5 text-left text-xs transition-all',
                        d.online === false
                          ? 'border-brand-danger/30 bg-brand-danger/5 text-brand-danger'
                          : form.printerName === d.product
                            ? 'border-brand-success bg-brand-success/10 text-brand-success'
                            : 'border-line bg-bg-card text-ink-soft hover:border-line-strong hover:text-ink'
                      )}
                    >
                      🖨 {d.product}
                      {d.online === false && <span className="ml-1 font-medium">(offline)</span>}
                    </button>
                  ))}
                </div>
              )}
            </Field>
          )}
          <Field label="Chek sarlavhasi">
            <textarea
              className="input min-h-[84px] resize-y"
              placeholder={"CHOYXONA\nEST. 2010"}
              value={form.receiptHeader ?? ''}
              onChange={(e) => update('receiptHeader', e.target.value || null)}
            />
          </Field>
          <Field label="QR link yoki matn">
            <input
              className="input"
              placeholder="https://instagram.com/soxil.choyxona"
              value={form.receiptQrText ?? ''}
              onChange={(e) => update('receiptQrText', e.target.value || null)}
            />
          </Field>
          <Field label="QR osti yozuvi">
            <input
              className="input"
              placeholder="@soxil.choyxona"
              value={form.receiptQrLabel ?? ''}
              onChange={(e) => update('receiptQrLabel', e.target.value || null)}
            />
          </Field>
          <Field label="Chek pastki yozuvi">
            <textarea
              className="input min-h-[112px] resize-y"
              placeholder={"Sohil Choyxonasiga qaytib kelganingiz uchun rahmat!\nBiz bilan yana ko'rishguncha!"}
              value={form.receiptFooter ?? ''}
              onChange={(e) => update('receiptFooter', e.target.value || null)}
            />
          </Field>
          <div className="flex gap-2">
            <button onClick={() => void testPrint()} className="btn-ghost flex-1">
              <TestTube2 size={14} /> Test chek
            </button>
            {form.printerType === 'usb' && !isWindows && (
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
                  draggable
                  onDragStart={(e) => {
                    setDragIdx(i)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOverIdx(i)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragIdx !== null && dragIdx !== i) {
                      const next = [...catRows]
                      const [removed] = next.splice(dragIdx, 1)
                      next.splice(i, 0, removed)
                      setCatRows(next)
                    }
                    setDragIdx(null)
                    setDragOverIdx(null)
                  }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2 transition-all cursor-grab active:cursor-grabbing select-none',
                    dragIdx === i
                      ? 'opacity-30 border-line bg-bg-card'
                      : dragOverIdx === i
                        ? 'border-brand-primary bg-brand-primary/5 shadow-sm'
                        : 'border-line bg-bg-card hover:border-line-strong'
                  )}
                >
                  {/* Drag handle — ko'rinma uchun, asl drag div dan ishlaydi */}
                  <GripVertical size={15} className="shrink-0 text-ink-dim pointer-events-none" />

                  {/* Nom */}
                  <input
                    className="input flex-1 py-1.5 text-sm cursor-text select-text"
                    value={row.localName}
                    onMouseDown={(e) => e.stopPropagation()}
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

        {isAdmin && (
          <Section title="Server Zakazlar" icon={<ClipboardList size={16} />}>
            {/* ── DB Holati ── */}
            <button
              onClick={async () => {
                setLoadingDb(true)
                try { setDbStatus(await window.afisant.diag.dbStatus()) }
                finally { setLoadingDb(false) }
              }}
              disabled={loadingDb}
              className="btn-ghost w-full"
            >
              <ScanLine size={13} className={loadingDb ? 'animate-spin' : ''} />
              {loadingDb ? 'Tekshirilmoqda…' : 'DB holati — server_id bor/yo\'qligini tekshir'}
            </button>

            {dbStatus && (
              <div className="rounded-xl border border-line bg-bg-elevated p-3 text-xs space-y-2">
                <p className="font-semibold text-ink-soft uppercase tracking-wider text-[10px]">Mahalliy DB holati</p>

                {/* Token */}
                <div className="flex items-center gap-2">
                  {dbStatus.token ? <CheckCircle2 size={12} className="text-brand-success shrink-0" /> : <XCircle size={12} className="text-brand-danger shrink-0" />}
                  <span className="text-ink-soft">Token:</span>
                  <span className={cn('font-mono truncate', dbStatus.token ? 'text-brand-success' : 'text-brand-danger')}>
                    {dbStatus.token ?? 'YO\'Q — qayta login qiling'}
                  </span>
                </div>

                {/* branchId */}
                <div className="flex items-center gap-2">
                  {dbStatus.branchId ? <CheckCircle2 size={12} className="text-brand-success shrink-0" /> : <XCircle size={12} className="text-brand-danger shrink-0" />}
                  <span className="text-ink-soft">Branch ID:</span>
                  <span className={cn('font-mono', dbStatus.branchId ? 'text-ink' : 'text-brand-danger')}>
                    {dbStatus.branchId ? `${dbStatus.branchId.slice(0, 12)}…` : 'YO\'Q'}
                  </span>
                </div>

                {/* Afitsantlar */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {dbStatus.waiters.withServerId === dbStatus.waiters.total
                      ? <CheckCircle2 size={12} className="text-brand-success shrink-0" />
                      : <XCircle size={12} className="text-brand-danger shrink-0" />}
                    <span className="text-ink-soft">Afitsantlar:</span>
                    <span className={dbStatus.waiters.withServerId === dbStatus.waiters.total ? 'text-brand-success' : 'text-brand-danger'}>
                      {dbStatus.waiters.withServerId}/{dbStatus.waiters.total} ta server_id bilan
                    </span>
                  </div>
                  <div className="pl-5 space-y-0.5">
                    {dbStatus.waiters.list.map((w, i) => (
                      <p key={i} className={cn('text-[10px]', w.includes('YO\'Q') ? 'text-brand-danger' : 'text-ink-soft')}>{w}</p>
                    ))}
                  </div>
                </div>

                {/* Mahsulotlar */}
                <div className="flex items-center gap-2">
                  {dbStatus.products.withServerId === dbStatus.products.total
                    ? <CheckCircle2 size={12} className="text-brand-success shrink-0" />
                    : <XCircle size={12} className="text-brand-warn shrink-0" />}
                  <span className="text-ink-soft">Mahsulotlar:</span>
                  <span className={dbStatus.products.withServerId > 0 ? 'text-brand-success' : 'text-brand-danger'}>
                    {dbStatus.products.withServerId}/{dbStatus.products.total} ta server_id bilan
                  </span>
                  {dbStatus.products.withServerId === 0 && (
                    <span className="text-brand-danger font-semibold">← Sinxronlash kerak!</span>
                  )}
                </div>

                {/* Xonalar */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {dbStatus.tables.withServerId === dbStatus.tables.total
                      ? <CheckCircle2 size={12} className="text-brand-success shrink-0" />
                      : <XCircle size={12} className="text-brand-danger shrink-0" />}
                    <span className="text-ink-soft">Xonalar:</span>
                    <span className={dbStatus.tables.withServerId > 0 ? 'text-brand-success' : 'text-brand-danger'}>
                      {dbStatus.tables.withServerId}/{dbStatus.tables.total} ta server_id bilan
                    </span>
                  </div>
                  <div className="pl-5 space-y-0.5">
                    {dbStatus.tables.list.slice(0, 5).map((t, i) => (
                      <p key={i} className={cn('text-[10px]', t.includes('YO\'Q') ? 'text-brand-danger' : 'text-ink-soft')}>{t}</p>
                    ))}
                    {dbStatus.tables.list.length > 5 && (
                      <p className="text-[10px] text-ink-dim">… va yana {dbStatus.tables.list.length - 5} ta</p>
                    )}
                  </div>
                </div>

                {(dbStatus.products.withServerId === 0 || dbStatus.tables.withServerId === 0 || dbStatus.waiters.withServerId === 0) && (
                  <div className="rounded-lg bg-brand-danger/10 border border-brand-danger/30 px-3 py-2 text-brand-danger font-semibold text-[11px]">
                    ⚠️ Server_id lar yo'q — Sozlamalar → "To'liq sinxronlash" tugmasini bosing
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-line pt-3" />
            <button
              onClick={async () => {
                setLoadingOrders(true)
                try {
                  const orders = await window.afisant.diag.recentOrders()
                  setRecentOrders(orders)
                } finally {
                  setLoadingOrders(false)
                }
              }}
              disabled={loadingOrders}
              className="btn-ghost w-full"
            >
              <RefreshCw size={13} className={loadingOrders ? 'animate-spin' : ''} />
              {loadingOrders ? 'Yuklanmoqda…' : "Server dan so'nggi zakazlarni ko'rish"}
            </button>

            {recentOrders !== null && (
              recentOrders.length === 0 ? (
                <p className="text-center text-sm text-ink-soft py-2">
                  Server da zakas topilmadi — hali birorta yuborilmagan
                </p>
              ) : (
                <div className="mt-1 space-y-1.5 max-h-72 overflow-y-auto">
                  {recentOrders.map((o) => {
                    const statusColor = o.status === 'SUCCESS'
                      ? 'text-brand-success'
                      : o.status === 'CANCELED'
                        ? 'text-brand-danger'
                        : 'text-brand-warn'
                    const statusLabel = o.status === 'SUCCESS'
                      ? 'Yopildi' : o.status === 'CANCELED'
                        ? 'Bekor' : o.status === 'PENDING'
                          ? 'Kutilmoqda' : o.status
                    const dateStr = o.createdAt
                      ? new Date(o.createdAt).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                      : ''
                    return (
                      <div key={o.id} className="flex items-center justify-between rounded-xl border border-line bg-bg-elevated px-3 py-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-semibold ${statusColor}`}>{statusLabel}</span>
                            <span className="text-ink-dim">·</span>
                            <span className="font-medium text-ink truncate">{o.room}</span>
                          </div>
                          <div className="mt-0.5 text-ink-soft truncate">
                            {o.waiter} · {o.itemCount} ta mahsulot · {dateStr}
                          </div>
                        </div>
                        <div className="ml-2 shrink-0 font-bold text-ink">{o.total.toLocaleString()} so'm</div>
                      </div>
                    )
                  })}
                  <p className="text-center text-[10px] text-ink-dim pt-1">
                    ✅ Zakazlar server da — admin panel da ko'rinadi
                  </p>
                </div>
              )
            )}

            <div className="border-t border-line pt-3" />
            <button
              onClick={async () => {
                setLoadingRooms(true)
                try {
                  const data = await window.afisant.diag.testRooms() as RoomsDiagResult
                  setRoomsTest(data)
                } finally {
                  setLoadingRooms(false)
                }
              }}
              disabled={loadingRooms}
              className="btn-ghost w-full"
            >
              <RefreshCw size={13} className={loadingRooms ? 'animate-spin' : ''} />
              {loadingRooms ? 'Tekshirilmoqda…' : 'Xonalar API ni tekshirish'}
            </button>

            {roomsTest !== null && (
              <div className="mt-1 rounded-xl border border-line bg-bg-elevated p-3 text-xs space-y-2 max-h-80 overflow-y-auto">
                <p className="font-bold text-ink">branchId: {roomsTest.branchId ?? '—'}</p>
                {[roomsTest.roomCategories, roomsTest.rooms].map((section) => {
                  const val = { error: 'Ishlaydigan endpoint topilmadi.' }
                  return (
                  <div key={section.label} className="border-t border-line pt-2">
                    <p className="font-bold text-ink">{section.label}</p>
                    {!section.chosenUrl ? (
                      <p className="text-brand-danger">❌ {String(val.error)}</p>
                    ) : (
                      <>
                        <p className="font-mono text-ink-soft break-all">{section.chosenUrl}</p>
                        <p className="text-ink">Soni: <span className="font-bold">{section.count}</span></p>
                        {section.firstItemKeys.length > 0 && (
                          <p className="text-ink-soft">Fields: {section.firstItemKeys.join(', ')}</p>
                        )}
                        {section.blocked.length > 0 && (
                          <p className="text-ink-soft">
                            Fallback ishlatildi: {section.blocked.map((entry) => `${entry.url} (${entry.status})`).join(', ')}
                          </p>
                        )}
                        {section.sample.map((item, i) => (
                          <div key={`${section.label}-${item.id}-${i}`} className="mt-1 bg-stone-50 rounded p-1.5 text-[10px] font-mono">
                            <p><span className="text-ink-soft">id:</span> {item.id}</p>
                            <p><span className="text-ink-soft">name:</span> {item.name}</p>
                            <p><span className="text-ink-soft">status:</span> {item.status ?? "yo'q"}</p>
                            {item.roomCategoryId && <p><span className="text-ink-soft">roomCategoryId:</span> {item.roomCategoryId}</p>}
                            {item.roomCategory && <p><span className="text-ink-soft">roomCategory.id:</span> {item.roomCategory.id}</p>}
                            {item.categoryId && <p><span className="text-ink-soft">categoryId:</span> {item.categoryId}</p>}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  )
                })}
              </div>
            )}
          </Section>
        )}

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
