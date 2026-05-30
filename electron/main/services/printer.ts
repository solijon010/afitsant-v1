import { writeSync, openSync, closeSync, existsSync, fsyncSync } from 'node:fs'
import { execSync } from 'node:child_process'
import type { ReceiptPayload } from '@shared/types'
import { getSettings } from './settings'

const ESC = 0x1b
const GS = 0x1d

function bytes(...args: number[]): Uint8Array {
  return new Uint8Array(args)
}

function textBytes(text: string): Uint8Array {
  return Buffer.from(text, 'utf8')
}

function concat(...parts: Uint8Array[]): Buffer {
  return Buffer.concat(parts.map((p) => Buffer.from(p)))
}

function pad(left: string, right: string, width = 42): string {
  const total = width - right.length
  return left.slice(0, total).padEnd(total, ' ') + right
}

function center(text: string, width = 42): string {
  if (text.length >= width) return text.slice(0, width)
  const spaces = Math.floor((width - text.length) / 2)
  return ' '.repeat(spaces) + text
}

function fmt(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(n))
}

function fmtDateTime(ts: number): { date: string; time: string } {
  const d = new Date(ts)
  const date = d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
  return { date, time }
}

function buildEscPos(payload: ReceiptPayload): Buffer {
  const W = 30
  const line = '-'.repeat(W)
  const { date, time } = fmtDateTime(payload.printedAt)

  const parts: Uint8Array[] = [
    bytes(ESC, 0x40),                    // reset
    bytes(ESC, 0x61, 0x01),              // center
    bytes(ESC, 0x45, 0x01),              // bold on
    textBytes(payload.organizationName.slice(0, W) + '\n'),
    bytes(ESC, 0x45, 0x00),              // bold off
    bytes(ESC, 0x61, 0x00),              // left
    textBytes(line + '\n'),
    textBytes(`Stol : ${payload.tableName}\n`),
    textBytes(`Vaqt : ${date} ${time}\n`),
    textBytes(line + '\n'),
  ]

  for (const item of payload.items) {
    parts.push(textBytes(item.name.slice(0, W) + '\n'))
    parts.push(textBytes(
      pad(`  ${fmt(item.quantity)}x${fmt(item.unitPrice)}`, fmt(item.total), W) + '\n'
    ))
  }

  parts.push(textBytes(line + '\n'))

  if (payload.serviceFee > 0) {
    parts.push(textBytes(
      pad(`Xizmat ${payload.serviceFeePercent}%:`, fmt(payload.serviceFee), W) + '\n'
    ))
  }

  parts.push(
    bytes(ESC, 0x61, 0x01),              // center
    bytes(ESC, 0x45, 0x01),              // bold on
    textBytes(`JAMI: ${fmt(payload.total)} som\n`),
    bytes(ESC, 0x45, 0x00),              // bold off
    bytes(ESC, 0x61, 0x00),              // left
    textBytes(line + '\n'),
    textBytes('Rahmat! Yana keling!\n'),
  )

  // Qog'oz surish (auto-cutter bo'lmasa ham yirtish uchun qulay)
  parts.push(bytes(ESC, 0x64, 3))        // 3 qator surish
  parts.push(bytes(GS, 0x56, 0x00))      // kesish (cutter bo'lsa ishlaydi)

  return concat(...parts)
}

async function printRaw(data: Buffer): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSettings()
  const devicePath = s.printerDevicePath ?? '/dev/usb/lp0'

  if (!existsSync(devicePath)) {
    return {
      ok: false,
      error: `USB printer topilmadi: ${devicePath}\nPrinterni ulang va Sozlamalar > Aniqlash tugmasini bosing`
    }
  }

  try {
    const fd = openSync(devicePath, 'w')
    writeSync(fd, data)
    try { fsyncSync(fd) } catch { /* ba'zi USB drayverlar fsync qo'llab-quvvatlamaydi */ }
    closeSync(fd)
    return { ok: true }
  } catch (e: any) {
    const msg = e?.message ?? 'Chop etishda xatolik'
    if (msg.includes('EACCES') || msg.includes('permission')) {
      try {
        execSync(`pkexec chmod a+w ${devicePath}`, { timeout: 30000 })
        const fd = openSync(devicePath, 'w')
        writeSync(fd, data)
        try { fsyncSync(fd) } catch { /* ignore */ }
        closeSync(fd)
        return { ok: true }
      } catch {
        return {
          ok: false,
          error: `Ruxsat yo'q: ${devicePath}\nTerminalda: sudo chmod a+w ${devicePath}`
        }
      }
    }
    return { ok: false, error: msg }
  }
}

export async function fixPrinterPerms(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const rule = `KERNEL=="lp[0-9]*", SUBSYSTEM=="usb", MODE="0666"`
    execSync(`pkexec bash -c "echo '${rule}' > /etc/udev/rules.d/99-afisant-printer.rules && udevadm control --reload-rules && udevadm trigger"`, { timeout: 30000 })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Ruxsat berishda xatolik' }
  }
}

type PrinterModule = typeof import('node-thermal-printer')

async function loadPrinter(): Promise<PrinterModule | null> {
  try {
    return await import('node-thermal-printer')
  } catch {
    return null
  }
}

async function printViaThermalLib(payload: ReceiptPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSettings()
  const mod = await loadPrinter()
  if (!mod) return { ok: false, error: 'node-thermal-printer moduli yuklanmadi' }

  const { ThermalPrinter, PrinterTypes } = mod as any
  let iface = ''
  if (s.printerType === 'network' && s.printerIp) iface = `tcp://${s.printerIp}:9100`
  else if ((s.printerType === 'windows' || s.printerType === 'usb') && s.printerName)
    iface = `printer:${s.printerName}`
  else return { ok: false, error: 'Printer nomi kiritilmagan (Sozlamalar > Printer nomi)' }

  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: iface,
    width: 42,
    characterSet: 'PC866',
    removeSpecialCharacters: false
  })

  const { date, time } = fmtDateTime(payload.printedAt)

  try {
    const connected = await printer.isPrinterConnected()
    if (!connected) return { ok: false, error: 'Printer ulanmagan' }

    // Organization name
    printer.alignCenter()
    printer.bold(true)
    printer.setTextSize(1, 1)
    printer.println(payload.organizationName)
    printer.bold(false)
    printer.setTextNormal()
    printer.drawLine()

    // Header
    if (payload.receiptHeader) {
      printer.println(payload.receiptHeader)
      printer.drawLine()
    }

    // Order info
    printer.alignLeft()
    printer.println(`Stol    : ${payload.tableName}`)
    printer.println(`Afitsant: ${payload.waiterName}`)
    printer.println(`Sana    : ${date}`)
    printer.println(`Vaqt    : ${time}`)
    printer.println(`Chek #  : ${payload.orderLocalUuid.slice(0, 8).toUpperCase()}`)
    printer.drawLine()

    // Column header
    printer.leftRight('Mahsulot', 'Jami')
    printer.drawLine()

    // Items
    for (const item of payload.items) {
      printer.println(item.name)
      printer.leftRight(
        `  ${fmt(item.quantity)} x ${fmt(item.unitPrice)} so'm`,
        `${fmt(item.total)} so'm`
      )
    }
    printer.drawLine()

    // Totals
    printer.leftRight('Mahsulotlar jami:', `${fmt(payload.subtotal)} so'm`)
    if (payload.serviceFee > 0) {
      printer.leftRight(`Xizmat (${payload.serviceFeePercent}%):`, `${fmt(payload.serviceFee)} so'm`)
    }
    printer.drawLine()

    // Grand total
    printer.alignCenter()
    printer.bold(true)
    printer.setTextSize(1, 1)
    printer.println(`JAMI: ${fmt(payload.total)} so'm`)
    printer.bold(false)
    printer.setTextNormal()
    printer.drawLine()

    // Footer
    printer.alignCenter()
    printer.println('Rahmat! Yana keling!')
    if (payload.receiptFooter) printer.println(payload.receiptFooter)
    printer.println('* * *')

    printer.cut()
    await printer.execute()
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Printerda xatolik' }
  }
}

export async function printReceipt(payload: ReceiptPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSettings()
  if (!s.printerType) return { ok: false, error: 'Printer sozlanmagan' }

  // Linux USB: to'g'ridan device pathga yozish (ESC/POS raw)
  if (s.printerType === 'usb' && process.platform !== 'win32') {
    return printRaw(buildEscPos(payload))
  }

  // Windows USB + network + windows: node-thermal-printer orqali
  return printViaThermalLib(payload)
}

export async function testPrint(): Promise<{ ok: true } | { ok: false; error: string }> {
  return printReceipt({
    organizationName: 'AFISANT TEST',
    tableName: 'Sori 1',
    waiterName: 'Test Afitsant',
    orderLocalUuid: 'test1234abcd',
    items: [
      { name: 'Choy', quantity: 2, unitPrice: 12000, total: 24000 },
      { name: 'Osh', quantity: 1, unitPrice: 45000, total: 45000 }
    ],
    subtotal: 69000,
    serviceFeePercent: 10,
    serviceFee: 6900,
    total: 75900,
    printedAt: Date.now(),
    receiptHeader: 'Xush kelibsiz!',
    receiptFooter: 'Bizga yana tashrif buyuring!'
  })
}

export async function listUsbPrinters(): Promise<
  Array<{ vendorId: string; productId: string; manufacturer?: string; product?: string }>
> {
  // Windows: wmic orqali o'rnatilgan printerlarni ro'yxatlaymiz
  if (process.platform === 'win32') {
    try {
      const out = execSync('wmic printer get Name /format:list', { encoding: 'utf8', timeout: 5000 })
      const names = out.split('\n')
        .map((l) => l.replace(/^Name=/, '').trim())
        .filter((l) => l.length > 0)
      return names.map((name) => ({
        vendorId: 'windows',
        productId: 'printer',
        manufacturer: 'Windows',
        product: name
      }))
    } catch {
      return []
    }
  }

  // Linux: /dev/usb/lp* device fayllarini tekshiramiz
  const devices: Array<{ vendorId: string; productId: string; product: string }> = []
  const paths = ['/dev/usb/lp0', '/dev/usb/lp1', '/dev/lp0', '/dev/lp1']
  for (const p of paths) {
    if (existsSync(p)) {
      devices.push({ vendorId: '0', productId: '0', product: p })
    }
  }
  return devices
}
