import { writeSync, openSync, closeSync, existsSync } from 'node:fs'
import type { ReceiptPayload } from '@shared/types'
import { getSettings } from './settings'

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

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

function fmt(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(n)
}

function buildEscPos(payload: ReceiptPayload): Buffer {
  const W = 42
  const divider = '-'.repeat(W)

  const parts: Uint8Array[] = [
    bytes(ESC, 0x40),
    bytes(ESC, 0x61, 0x01),
    bytes(ESC, 0x45, 0x01),
    bytes(GS, 0x21, 0x11),
    textBytes(payload.organizationName + '\n'),
    bytes(GS, 0x21, 0x00),
    bytes(ESC, 0x45, 0x00),
  ]

  if (payload.receiptHeader) {
    parts.push(textBytes(payload.receiptHeader + '\n'))
  }
  parts.push(textBytes(divider + '\n'))

  parts.push(bytes(ESC, 0x61, 0x00))
  parts.push(textBytes(`Stol: ${payload.tableName}\n`))
  parts.push(textBytes(`Afitsant: ${payload.waiterName}\n`))
  parts.push(textBytes(`Vaqt: ${new Date(payload.printedAt).toLocaleString('uz-UZ')}\n`))
  parts.push(textBytes(`Chek: ${payload.orderLocalUuid.slice(0, 8).toUpperCase()}\n`))
  parts.push(textBytes(divider + '\n'))

  for (const item of payload.items) {
    parts.push(textBytes(item.name.slice(0, W) + '\n'))
    const detail = pad(`  ${fmt(item.quantity)} x ${fmt(item.unitPrice)} so'm`, `${fmt(item.total)} so'm`, W)
    parts.push(textBytes(detail + '\n'))
  }

  parts.push(textBytes(divider + '\n'))
  parts.push(textBytes(pad("Jami mahsulotlar:", `${fmt(payload.subtotal)} so'm`, W) + '\n'))
  if (payload.serviceFee > 0) {
    parts.push(textBytes(pad(`Xizmat (${payload.serviceFeePercent}%):`, `${fmt(payload.serviceFee)} so'm`, W) + '\n'))
  }
  parts.push(textBytes(divider + '\n'))

  parts.push(bytes(ESC, 0x45, 0x01))
  parts.push(bytes(GS, 0x21, 0x11))
  parts.push(textBytes(pad("JAMI:", `${fmt(payload.total)} so'm`, W) + '\n'))
  parts.push(bytes(GS, 0x21, 0x00))
  parts.push(bytes(ESC, 0x45, 0x00))
  parts.push(textBytes(divider + '\n'))

  if (payload.receiptFooter) {
    parts.push(bytes(ESC, 0x61, 0x01))
    parts.push(textBytes(payload.receiptFooter + '\n'))
  }

  parts.push(bytes(ESC, 0x64, 4))
  parts.push(bytes(GS, 0x56, 0x01))

  return concat(...parts)
}

async function printRaw(data: Buffer): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSettings()
  const devicePath = s.printerDevicePath ?? '/dev/usb/lp0'

  if (!existsSync(devicePath)) {
    return { ok: false, error: `Printer qurilmasi topilmadi: ${devicePath}` }
  }

  try {
    const fd = openSync(devicePath, 'w')
    writeSync(fd, data)
    closeSync(fd)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Chop etishda xatolik' }
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
  else if (s.printerType === 'windows' && s.printerName) iface = `printer:${s.printerName}`
  else return { ok: false, error: 'Printer manzili to\'g\'ri sozlanmagan' }

  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: iface,
    width: 42,
    characterSet: 'PC866',
    removeSpecialCharacters: false
  })

  try {
    const connected = await printer.isPrinterConnected()
    if (!connected) return { ok: false, error: 'Printer ulanmagan' }

    printer.alignCenter()
    printer.bold(true)
    printer.setTextSize(1, 1)
    printer.println(payload.organizationName)
    printer.bold(false)
    printer.setTextNormal()
    if (payload.receiptHeader) printer.println(payload.receiptHeader)
    printer.drawLine()
    printer.alignLeft()
    printer.println(`Stol: ${payload.tableName}`)
    printer.println(`Afitsant: ${payload.waiterName}`)
    printer.println(`Vaqt: ${new Date(payload.printedAt).toLocaleString('uz-UZ')}`)
    printer.println(`Chek: ${payload.orderLocalUuid.slice(0, 8).toUpperCase()}`)
    printer.drawLine()

    for (const item of payload.items) {
      printer.println(item.name)
      printer.leftRight(`  ${fmt(item.quantity)} x ${fmt(item.unitPrice)}`, `${fmt(item.total)} so'm`)
    }
    printer.drawLine()
    printer.leftRight('Mahsulotlar:', `${fmt(payload.subtotal)} so'm`)
    if (payload.serviceFee > 0)
      printer.leftRight(`Xizmat (${payload.serviceFeePercent}%):`, `${fmt(payload.serviceFee)} so'm`)
    printer.bold(true)
    printer.setTextSize(1, 1)
    printer.leftRight('JAMI:', `${fmt(payload.total)} so'm`)
    printer.bold(false)
    printer.setTextNormal()
    printer.drawLine()
    if (payload.receiptFooter) {
      printer.alignCenter()
      printer.println(payload.receiptFooter)
    }
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

  if (s.printerType === 'usb' || s.printerType === 'raw') {
    const data = buildEscPos(payload)
    return printRaw(data)
  }

  return printViaThermalLib(payload)
}

export async function testPrint(): Promise<{ ok: true } | { ok: false; error: string }> {
  return printReceipt({
    organizationName: 'TEST CHEK',
    tableName: '1-stol',
    waiterName: 'Test afitsant',
    orderLocalUuid: 'test1234',
    items: [{ name: 'Test mahsulot', quantity: 2, unitPrice: 10000, total: 20000 }],
    subtotal: 20000,
    serviceFeePercent: 0,
    serviceFee: 0,
    total: 20000,
    printedAt: Date.now(),
    receiptHeader: 'Xush kelibsiz!',
    receiptFooter: 'Test muvaffaqiyatli'
  })
}

export async function listUsbPrinters(): Promise<
  Array<{ vendorId: string; productId: string; manufacturer?: string; product?: string }>
> {
  const devices: Array<{ vendorId: string; productId: string; product: string }> = []
  const paths = ['/dev/usb/lp0', '/dev/usb/lp1', '/dev/lp0', '/dev/lp1']
  for (const p of paths) {
    if (existsSync(p)) {
      devices.push({ vendorId: '0', productId: '0', product: p })
    }
  }
  return devices
}
