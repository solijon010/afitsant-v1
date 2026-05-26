import type { ReceiptPayload } from '@shared/types'
import { getSettings } from './settings'

type PrinterModule = typeof import('node-thermal-printer')

async function loadPrinter(): Promise<PrinterModule | null> {
  try {
    return await import('node-thermal-printer')
  } catch {
    return null
  }
}

function fmt(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(n)
}

function lineDivider(printer: any): void {
  printer.drawLine()
}

export async function printReceipt(payload: ReceiptPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSettings()
  if (!s.printerType) return { ok: false, error: 'Printer sozlanmagan' }

  const mod = await loadPrinter()
  if (!mod) return { ok: false, error: 'Printer modulini yuklab bo\'lmadi' }

  const { ThermalPrinter, PrinterTypes } = mod as any
  let iface = ''
  if (s.printerType === 'network' && s.printerIp) iface = `tcp://${s.printerIp}:9100`
  else if (s.printerType === 'usb' && s.printerName) iface = `printer:${s.printerName}`
  else if (s.printerType === 'windows' && s.printerName) iface = `printer:${s.printerName}`
  else return { ok: false, error: 'Printer manzili sozlanmagan' }

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

    if (payload.receiptHeader) {
      printer.println(payload.receiptHeader)
    }
    lineDivider(printer)

    printer.alignLeft()
    printer.println(`Stol: ${payload.tableName}`)
    printer.println(`Afitsant: ${payload.waiterName}`)
    printer.println(`Vaqt: ${new Date(payload.printedAt).toLocaleString('uz-UZ')}`)
    printer.println(`Chek #: ${payload.orderLocalUuid.slice(0, 8).toUpperCase()}`)
    lineDivider(printer)

    for (const item of payload.items) {
      printer.println(`${item.name}`)
      printer.leftRight(`  ${fmt(item.quantity)} x ${fmt(item.unitPrice)}`, `${fmt(item.total)} so'm`)
    }
    lineDivider(printer)

    printer.leftRight('Mahsulotlar:', `${fmt(payload.subtotal)} so'm`)
    if (payload.serviceFee > 0)
      printer.leftRight(`Xizmat (${payload.serviceFeePercent}%):`, `${fmt(payload.serviceFee)} so'm`)
    printer.bold(true)
    printer.setTextSize(1, 1)
    printer.leftRight('JAMI:', `${fmt(payload.total)} so'm`)
    printer.bold(false)
    printer.setTextNormal()
    lineDivider(printer)

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

export async function testPrint(): Promise<{ ok: true } | { ok: false; error: string }> {
  return printReceipt({
    organizationName: 'TEST CHEK',
    tableName: 'Test',
    waiterName: 'Test afitsant',
    orderLocalUuid: 'test1234',
    items: [{ name: 'Test mahsulot', quantity: 1, unitPrice: 1000, total: 1000 }],
    subtotal: 1000,
    serviceFeePercent: 0,
    serviceFee: 0,
    total: 1000,
    printedAt: Date.now(),
    receiptHeader: null,
    receiptFooter: 'Test muvaffaqiyatli'
  })
}

export async function listUsbPrinters(): Promise<
  Array<{ vendorId: string; productId: string; manufacturer?: string; product?: string }>
> {
  return []
}
