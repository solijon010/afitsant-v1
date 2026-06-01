import { writeSync, openSync, closeSync, existsSync, fsyncSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
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

function splitLines(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')
}

function formatReceiptNo(orderLocalUuid: string): string {
  const digits = orderLocalUuid.replace(/\D/g, '')
  if (digits.length > 0) return digits.slice(-5).padStart(5, '0')
  return orderLocalUuid.slice(0, 8).toUpperCase()
}

function resolveReceiptLogoPath(): string | null {
  const roots = Array.from(new Set([app.getAppPath(), process.cwd()]))
  const fileCandidates = roots.map((root) => join(root, 'src', 'assets', 'logo.png'))
  for (const filePath of fileCandidates) {
    if (existsSync(filePath)) return filePath
  }

  const assetDirs = roots.map((root) => join(root, 'out', 'renderer', 'assets'))
  for (const dir of assetDirs) {
    if (!existsSync(dir)) continue
    try {
      const file = readdirSync(dir).find((name) => /^logo.*\.png$/i.test(name))
      if (file) return join(dir, file)
    } catch {
      // ignore lookup errors
    }
  }
  return null
}

function buildEscPos(payload: ReceiptPayload): Buffer {
  const W = 30
  const line = '-'.repeat(W)
  const { date, time } = fmtDateTime(payload.printedAt)
  const headerLines = splitLines(payload.receiptHeader)
  const footerLines = splitLines(payload.receiptFooter)
  const receiptNo = formatReceiptNo(payload.orderLocalUuid)

  const parts: Uint8Array[] = [
    bytes(ESC, 0x40),                    // reset
    bytes(ESC, 0x61, 0x01),              // center
    bytes(ESC, 0x45, 0x01),              // bold on
    textBytes(payload.organizationName.slice(0, W) + '\n'),
    bytes(ESC, 0x45, 0x00),              // bold off
  ]

  for (const lineText of headerLines) {
    parts.push(textBytes(center(lineText, W) + '\n'))
  }
  if (payload.organizationAddress) parts.push(textBytes(center(payload.organizationAddress.slice(0, W), W) + '\n'))
  parts.push(textBytes(center(`Xizmata: ${payload.waiterName}`.slice(0, W), W) + '\n'))
  if (payload.organizationPhone) parts.push(textBytes(center(`Tel: ${payload.organizationPhone}`.slice(0, W), W) + '\n'))

  parts.push(
    bytes(ESC, 0x61, 0x00),              // left
    textBytes(line + '\n'),
    textBytes(pad(`CHEK №: ${receiptNo}`, `STOL: ${payload.tableName}`, W) + '\n'),
    textBytes(pad(`SANA: ${date}`, `VAQT: ${time}`, W) + '\n'),
    textBytes(line + '\n'),
    textBytes(pad('BUYURTMALAR', 'SONI', W - 11) + 'SUMMA\n'),
    textBytes(line + '\n')
  )

  for (const item of payload.items) {
    const itemName = item.name.slice(0, 16)
    const qty = fmtQty(item.quantity).padStart(4, ' ')
    const total = `${fmt(item.total)} so'm`
    parts.push(textBytes(itemName.padEnd(16, ' ') + qty + total.padStart(W - 20, ' ') + '\n'))
  }

  parts.push(textBytes(line + '\n'))

  if (payload.serviceFee > 0) {
    parts.push(textBytes(
      pad(`Xizmat ${payload.serviceFeePercent}%:`, fmt(payload.serviceFee), W) + '\n'
    ))
  }

  parts.push(
    bytes(ESC, 0x45, 0x01),              // bold on
    textBytes(pad('JAMI:', `${fmt(payload.total)} so'm`, W) + '\n'),
    bytes(ESC, 0x45, 0x00),              // bold off
    textBytes(line + '\n'),
  )

  parts.push(bytes(ESC, 0x61, 0x01))
  for (const lineText of footerLines) {
    parts.push(textBytes(center(lineText.slice(0, W), W) + '\n'))
  }
  if (payload.receiptQrLabel) {
    parts.push(textBytes(center(payload.receiptQrLabel.slice(0, W), W) + '\n'))
  }

  // Qog'oz surish (auto-cutter bo'lmasa ham yirtish uchun qulay)
  parts.push(bytes(ESC, 0x64, 3))        // 3 qator surish
  parts.push(bytes(GS, 0x56, 0x00))      // kesish (cutter bo'lsa ishlaydi)

  return concat(...parts)
}

function buildReceiptText(payload: ReceiptPayload, width = 32): string {
  const line = '-'.repeat(width)
  const { date, time } = fmtDateTime(payload.printedAt)
  const receiptNo = formatReceiptNo(payload.orderLocalUuid)
  const headerLines = splitLines(payload.receiptHeader)
  const footerLines = splitLines(payload.receiptFooter)
  const lines: string[] = []

  lines.push(center(payload.organizationName.slice(0, width), width))
  for (const lineText of headerLines) lines.push(center(lineText.slice(0, width), width))
  if (payload.organizationAddress) lines.push(center(payload.organizationAddress.slice(0, width), width))
  lines.push(center(`Xizmata: ${payload.waiterName}`.slice(0, width), width))
  if (payload.organizationPhone) lines.push(center(`Tel: ${payload.organizationPhone}`.slice(0, width), width))
  lines.push(line)
  lines.push(pad(`CHEK №: ${receiptNo}`, `STOL: ${payload.tableName}`, width))
  lines.push(pad(`SANA: ${date}`, `VAQT: ${time}`, width))
  lines.push(line)
  lines.push(pad('BUYURTMALAR', 'SONI', width - 11) + 'SUMMA')
  lines.push(line)

  for (const item of payload.items) {
    const itemName = item.name.slice(0, 16)
    const qty = fmtQty(item.quantity).padStart(4, ' ')
    const total = `${fmt(item.total)} so'm`
    lines.push(itemName.padEnd(16, ' ') + qty + total.padStart(Math.max(1, width - 20), ' '))
  }

  lines.push(line)
  if (payload.serviceFee > 0) {
    lines.push(pad(`Xizmat ${payload.serviceFeePercent}%:`, `${fmt(payload.serviceFee)} so'm`, width))
    lines.push(line)
  }
  lines.push(pad('JAMI:', `${fmt(payload.total)} so'm`, width))
  lines.push(line)

  for (const lineText of footerLines) lines.push(center(lineText.slice(0, width), width))
  if (payload.receiptQrLabel) lines.push(center(payload.receiptQrLabel.slice(0, width), width))
  if (payload.receiptQrText) lines.push(center(payload.receiptQrText.slice(0, width), width))

  return lines.join('\n')
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

// Windows: driver siz, to'g'ridan USB portiga raw ESC/POS yozish
// USB001 porti Windows USB Printing Support class driveri orqali ishlaydi
async function printRawWindowsPort(data: Buffer, usbPort: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalizedPort = usbPort.trim().toUpperCase()
  if (!/^USB\d+$/i.test(normalizedPort)) {
    return {
      ok: false,
      error: `USB port noto'g'ri sozlangan: ${usbPort || '(bo\'sh)'}.\nPrinter porti USB001, USB002 kabi bo'lishi kerak.`
    }
  }

  const usbPrinter = findWindowsPrinterByPort(normalizedPort)
  const usbStatus = probeWindowsUsbPort(normalizedPort)
  if (!usbStatus.online) {
    return {
      ok: false,
      error: `USB printer ulanmagan yoki offline: ${usbPrinter?.name ?? 'Thermal printer'} (${normalizedPort}).\nUSB kabelini, printerning elektrini va Windows portini tekshiring.`
    }
  }
  const tmpFile = join(tmpdir(), `afisant-print-${Date.now()}.bin`)

  try {
    writeFileSync(tmpFile, data)
    // Windows copy /b — binary mode, to'g'ridan device pathga.
    // Yalang'och "USB002" yozuvi cwd ichida oddiy fayl yaratib yuborishi mumkin,
    // shuning uchun faqat haqiqiy device path bilan urinamiz.
    const commands = [
      `copy /b "${tmpFile}" "\\\\.\\${normalizedPort}"`
    ]
    let lastError = ''
    for (const command of commands) {
      try {
        execSync(command, {
          shell: process.env['ComSpec'] ?? 'cmd.exe',
          timeout: 10000,
          stdio: 'pipe'
        })
        return { ok: true }
      } catch (e: any) {
        lastError = String(e?.stderr ?? e?.message ?? lastError)
      }
    }
    throw new Error(lastError || 'USB port xatosi')
  } catch (e: any) {
    const msg = String(e?.stderr ?? e?.message ?? 'USB port xatosi')
    console.error('[PRINTER] Windows USB error:', msg)
    return {
      ok: false,
      error: `Windows USB print xatosi (${normalizedPort}):\n${msg}\n\nSozlamalar > Printer > USB Port ni tekshiring`
    }
  } finally {
    try { unlinkSync(tmpFile) } catch { /* ignore */ }
  }
}

async function printRawWindows(data: Buffer): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSettings()
  const rawPort = s.printerDevicePath?.trim() ?? ''
  if ((!rawPort || !/^USB\d+$/i.test(rawPort)) && s.printerName) {
    return {
      ok: false,
      error: `USB port noto'g'ri sozlangan: ${rawPort || '(bo\'sh)'}.\nWindows printer nomi tanlangan bo'lsa printer turini WINDOWS ga o'tkazing.`
    }
  }
  const usbPort = /^USB\d+$/i.test(rawPort) ? rawPort.toUpperCase() : 'USB001'
  return printRawWindowsPort(data, usbPort)
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
type WindowsPrinterInfo = {
  name: string
  portName: string
  workOffline: boolean
  printerStatus?: number
  extendedPrinterStatus?: number
}

type PrinterDiscoveryItem = {
  vendorId: string
  productId: string
  manufacturer?: string
  product?: string
  online?: boolean
  statusText?: string
}

async function loadPrinter(): Promise<PrinterModule | null> {
  try {
    return await import('node-thermal-printer')
  } catch {
    return null
  }
}

function parsePowerShellJson<T>(raw: string): T[] {
  const text = raw.trim()
  if (!text) return []
  const parsed = JSON.parse(text) as T | T[]
  return Array.isArray(parsed) ? parsed : [parsed]
}

function normalizeWindowsPrinterInfo(record: any): WindowsPrinterInfo | null {
  const name = String(record?.Name ?? record?.name ?? '').trim()
  const portName = String(record?.PortName ?? record?.portName ?? '').trim()
  if (!name) return null
  return {
    name,
    portName,
    workOffline: Boolean(record?.WorkOffline ?? record?.workOffline ?? false),
    printerStatus: Number(record?.PrinterStatus ?? record?.printerStatus ?? 0) || undefined,
    extendedPrinterStatus: Number(record?.ExtendedPrinterStatus ?? record?.extendedPrinterStatus ?? 0) || undefined
  }
}

function listWindowsPrinters(): WindowsPrinterInfo[] {
  const seen = new Set<string>()
  const printers: WindowsPrinterInfo[] = []
  const push = (printer: WindowsPrinterInfo | null): void => {
    if (!printer) return
    const key = `${printer.name}::${printer.portName}`
    if (seen.has(key)) return
    seen.add(key)
    printers.push(printer)
  }

  const sources = [
    'Get-CimInstance Win32_Printer | Select-Object Name,PortName,WorkOffline,PrinterStatus,ExtendedPrinterStatus | ConvertTo-Json -Compress',
    'Get-WmiObject Win32_Printer | Select-Object Name,PortName,WorkOffline,PrinterStatus,ExtendedPrinterStatus | ConvertTo-Json -Compress'
  ]

  for (const command of sources) {
    try {
      const out = execSync(`powershell.exe -NoProfile -Command "${command}"`, {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      for (const record of parsePowerShellJson<any>(out)) {
        push(normalizeWindowsPrinterInfo(record))
      }
      if (printers.length > 0) return printers
    } catch {
      // next fallback
    }
  }

  try {
    const out = execSync('wmic path Win32_Printer get Name,PortName,WorkOffline,PrinterStatus,ExtendedPrinterStatus /format:csv', {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const lines = out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length > 1) {
      const headers = lines[0].split(',').map((part) => part.trim())
      for (const line of lines.slice(1)) {
        const cols = line.split(',')
        const record: Record<string, string> = {}
        headers.forEach((header, index) => {
          record[header] = cols[index] ?? ''
        })
        push(normalizeWindowsPrinterInfo(record))
      }
    }
  } catch {
    // ignore fallback failure
  }

  return printers
}

function isVirtualPrinter(name: string): boolean {
  return /(pdf|xps|fax|onenote)/i.test(name)
}

function probeWindowsUsbPort(portName: string): { online: boolean; statusText: string } {
  const normalized = portName.trim().toUpperCase()
  if (!/^USB\d+$/i.test(normalized)) {
    return { online: false, statusText: "noto'g'ri USB port" }
  }

  try {
    const fd = openSync(`\\\\.\\${normalized}`, 'w')
    closeSync(fd)
    return { online: true, statusText: 'online' }
  } catch (e: any) {
    const msg = String(e?.message ?? '')
    if (/no such file|cannot find|enoent/i.test(msg)) return { online: false, statusText: 'ulanmagan' }
    if (/busy|ebusy/i.test(msg)) return { online: true, statusText: 'band' }
    if (/access is denied|eacces|permission/i.test(msg)) return { online: true, statusText: "band yoki ruxsat yo'q" }
    return { online: false, statusText: 'offline' }
  }
}

function getWindowsPrinterStatus(printer: WindowsPrinterInfo): { online: boolean; statusText: string } {
  if (/^USB\d+$/i.test(printer.portName)) {
    const usbStatus = probeWindowsUsbPort(printer.portName)
    if (usbStatus.online) return usbStatus
  }
  if (printer.workOffline) return { online: false, statusText: 'offline' }
  return { online: true, statusText: 'online' }
}

function findWindowsPrinterByName(name: string): WindowsPrinterInfo | null {
  const wanted = name.trim().toLowerCase()
  return listWindowsPrinters().find((printer) => printer.name.trim().toLowerCase() === wanted) ?? null
}

function findWindowsPrinterByPort(portName: string): WindowsPrinterInfo | null {
  const wanted = portName.trim().toUpperCase()
  return listWindowsPrinters().find((printer) => printer.portName.trim().toUpperCase() === wanted) ?? null
}

function resolveWindowsRawPort(): string | null {
  const s = getSettings()

  if (s.printerDevicePath && /^USB\d+$/i.test(s.printerDevicePath.trim())) {
    return s.printerDevicePath.trim().toUpperCase()
  }

  if (s.printerName) {
    const printer = findWindowsPrinterByName(s.printerName)
    if (printer && /^USB\d+$/i.test(printer.portName.trim())) {
      return printer.portName.trim().toUpperCase()
    }
  }

  return null
}

function loadWindowsPrinterDriver(): any | null {
  try {
    // Optional native module. Ko'p buildlarda yo'q bo'ladi.
    return require('printer')
  } catch {
    return null
  }
}

async function renderReceipt(printer: any, payload: ReceiptPayload): Promise<void> {
  const { date, time } = fmtDateTime(payload.printedAt)
  const receiptNo = formatReceiptNo(payload.orderLocalUuid)
  const headerLines = splitLines(payload.receiptHeader)
  const footerLines = splitLines(payload.receiptFooter)
  const logoPath = resolveReceiptLogoPath()

  printer.alignCenter()
  if (logoPath) {
    try {
      await printer.printImage(logoPath)
      printer.newLine()
    } catch (e) {
      console.warn('[PRINTER] logo print skipped:', (e as Error)?.message ?? e)
    }
  }
  printer.bold(true)
  printer.setTextDoubleWidth()
  printer.println(payload.organizationName)
  printer.setTextNormal()
  printer.bold(false)

  for (const lineText of headerLines) {
    printer.println(lineText)
  }
  if (payload.organizationAddress) printer.println(payload.organizationAddress)
  printer.println(`Xizmata: ${payload.waiterName}`)
  if (payload.organizationPhone) printer.println(`Tel: ${payload.organizationPhone}`)
  printer.drawLine()

  printer.alignLeft()
  printer.leftRight(`CHEK №: ${receiptNo}`, `STOL: ${payload.tableName}`)
  printer.leftRight(`SANA: ${date}`, `VAQT: ${time}`)
  printer.drawLine()

  printer.tableCustom([
    { text: 'BUYURTMALAR', align: 'LEFT', width: 0.56, bold: true },
    { text: 'SONI', align: 'CENTER', width: 0.14, bold: true },
    { text: 'SUMMA', align: 'RIGHT', width: 0.30, bold: true }
  ])
  printer.drawLine()

  for (const item of payload.items) {
    printer.tableCustom([
      { text: item.name, align: 'LEFT', width: 0.56 },
      { text: fmtQty(item.quantity), align: 'CENTER', width: 0.14 },
      { text: `${fmt(item.total)} so'm`, align: 'RIGHT', width: 0.30 }
    ])
  }
  printer.drawLine()

  if (payload.serviceFee > 0) {
    printer.tableCustom([
      { text: `Xizmat (${payload.serviceFeePercent}%)`, align: 'LEFT', width: 0.56 },
      { text: '', align: 'CENTER', width: 0.14 },
      { text: `${fmt(payload.serviceFee)} so'm`, align: 'RIGHT', width: 0.30 }
    ])
    printer.drawLine()
  }

  printer.bold(true)
  printer.tableCustom([
    { text: 'JAMI:', align: 'LEFT', width: 0.35, bold: true },
    { text: `${fmt(payload.total)} so'm`, align: 'RIGHT', width: 0.65, bold: true }
  ])
  printer.bold(false)
  printer.drawLine()

  printer.alignCenter()
  for (const lineText of footerLines) {
    printer.println(lineText)
  }
  if (payload.receiptQrText) {
    printer.newLine()
    printer.printQR(payload.receiptQrText, { cellSize: 5, correction: 'M', model: 2 })
    printer.newLine()
  }
  if (payload.receiptQrLabel) {
    printer.println(payload.receiptQrLabel)
  }

  printer.cut()
}

async function buildThermalBuffer(payload: ReceiptPayload): Promise<Buffer | null> {
  const mod = await loadPrinter()
  if (!mod) return null

  const { ThermalPrinter, PrinterTypes } = mod as any
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: join(tmpdir(), `afisant-buffer-${Date.now()}.tmp`),
    width: 42,
    characterSet: 'PC866_CYRILLIC2',
    removeSpecialCharacters: false,
    lineCharacter: '-'
  })

  await renderReceipt(printer, payload)
  return Buffer.from(printer.getBuffer() ?? Buffer.alloc(0))
}

async function buildReceiptBuffer(payload: ReceiptPayload): Promise<Buffer> {
  try {
    const buffer = await buildThermalBuffer(payload)
    if (buffer && buffer.length > 0) return buffer
  } catch (e) {
    console.warn('[PRINTER] thermal buffer build failed:', (e as Error)?.message ?? e)
  }
  return buildEscPos(payload)
}

async function printViaWindowsDocument(payload: ReceiptPayload, printerName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const textFile = join(tmpdir(), `afisant-receipt-${Date.now()}.txt`)
  const scriptFile = join(tmpdir(), `afisant-receipt-${Date.now()}.ps1`)
  const logoPath = resolveReceiptLogoPath()
  const receiptText = buildReceiptText(payload)
  const safePrinterName = printerName.replace(/'/g, "''")
  const safeTextFile = textFile.replace(/'/g, "''")
  const safeLogoPath = (logoPath ?? '').replace(/'/g, "''")
  const paperHeight = Math.max(700, 220 + receiptText.split(/\r?\n/).length * 22)

  const script = [
    "Add-Type -AssemblyName System.Drawing",
    `$printerName = '${safePrinterName}'`,
    `$textFile = '${safeTextFile}'`,
    `$logoPath = '${safeLogoPath}'`,
    '$lines = Get-Content -Path $textFile',
    '$doc = New-Object System.Drawing.Printing.PrintDocument',
    '$doc.PrinterSettings.PrinterName = $printerName',
    '$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController',
    `$doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('AfisantReceipt', 315, ${paperHeight})`,
    '$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(6, 6, 6, 6)',
    '$doc.add_PrintPage({',
    '  param($sender, $e)',
    '  $y = 8',
    '  if ($logoPath -and (Test-Path $logoPath)) {',
    '    $img = [System.Drawing.Image]::FromFile($logoPath)',
    '    try {',
    '      $targetWidth = 140',
    '      $targetHeight = [int]($img.Height * ($targetWidth / $img.Width))',
    '      $x = [int](($e.PageBounds.Width - $targetWidth) / 2)',
    '      $e.Graphics.DrawImage($img, $x, $y, $targetWidth, $targetHeight)',
    '      $y += $targetHeight + 8',
    '    } finally {',
    '      $img.Dispose()',
    '    }',
    '  }',
    "  $font = New-Object System.Drawing.Font('Consolas', 10)",
    "  $bold = New-Object System.Drawing.Font('Consolas', 11, [System.Drawing.FontStyle]::Bold)",
    '  try {',
    '    foreach ($line in $lines) {',
    "      $currentFont = if ($line.Trim().StartsWith('JAMI:') -or $line.Trim().StartsWith('CHEK')) { $bold } else { $font }",
    '      $e.Graphics.DrawString($line, $currentFont, [System.Drawing.Brushes]::Black, 8, $y)',
    '      $y += [int]([Math]::Ceiling($currentFont.GetHeight($e.Graphics))) + 2',
    '    }',
    '  } finally {',
    '    $font.Dispose()',
    '    $bold.Dispose()',
    '  }',
    '  $e.HasMorePages = $false',
    '})',
    'try {',
    '  $doc.Print()',
    "} catch { throw $_ } finally {",
    '  $doc.Dispose()',
    '}'
  ].join("\r\n")

  try {
    writeFileSync(textFile, receiptText, 'utf8')
    writeFileSync(scriptFile, script, 'utf8')
    execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`, {
      timeout: 20000,
      stdio: 'pipe'
    })
    return { ok: true }
  } catch (e: any) {
    const msg = String(e?.stderr ?? e?.message ?? 'Windows printer xatosi')
    return {
      ok: false,
      error: `Windows printer xatosi (${printerName}):\n${msg}`
    }
  } finally {
    try { unlinkSync(textFile) } catch { /* ignore */ }
    try { unlinkSync(scriptFile) } catch { /* ignore */ }
  }
}

async function printViaThermalLib(payload: ReceiptPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSettings()
  const mod = await loadPrinter()
  if (!mod) return { ok: false, error: 'node-thermal-printer moduli yuklanmadi' }

  try {
    const { ThermalPrinter, PrinterTypes } = mod as any
    let iface = ''
    let driver: any | undefined

    if (process.platform === 'win32' && s.printerName) {
      const windowsPrinter = findWindowsPrinterByName(s.printerName)
      if (!windowsPrinter) {
        return { ok: false, error: `Windows printer topilmadi: ${s.printerName}` }
      }
      const status = getWindowsPrinterStatus(windowsPrinter)
      if (!status.online) {
        return {
          ok: false,
          error: `Windows printer offline: ${windowsPrinter.name}${windowsPrinter.portName ? ` (${windowsPrinter.portName})` : ''}.\nPrinter elektri, USB kabeli va Windows holatini tekshiring.`
        }
      }
      driver = loadWindowsPrinterDriver() ?? undefined
      if (!driver) {
        return { ok: false, error: 'Windows printer driver moduli topilmadi. USB thermal printer uchun USB rejimidan foydalaning.' }
      }
    }

    if (s.printerType === 'network' && s.printerIp) iface = `tcp://${s.printerIp}:9100`
    else if ((s.printerType === 'windows' || s.printerType === 'usb') && s.printerName) iface = `printer:${s.printerName}`
    else return { ok: false, error: 'Printer nomi kiritilmagan (Sozlamalar > Printer nomi)' }

    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: iface,
      driver,
      width: 42,
      characterSet: 'PC866_CYRILLIC2',
      removeSpecialCharacters: false
    })

    const connected = await printer.isPrinterConnected()
    if (!connected) return { ok: false, error: 'Printer ulanmagan' }
    await renderReceipt(printer, payload)
    await printer.execute()
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Printerda xatolik' }
  }
}

export async function printReceipt(payload: ReceiptPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSettings()
  if (!s.printerType) return { ok: false, error: 'Printer sozlanmagan' }
  const receiptBuffer = await buildReceiptBuffer(payload)

  // Linux USB: to'g'ridan device pathga yozish (ESC/POS raw)
  if (s.printerType === 'usb' && process.platform !== 'win32') {
    return printRaw(receiptBuffer)
  }

  // Windows thermal printerlar odatda USB001/USB002 portiga ulangan bo'ladi.
  // Agar printer nomidan USB portni aniqlasak, WINDOWS rejimida ham raw ESC/POS ishlatamiz.
  if (process.platform === 'win32' && (s.printerType === 'usb' || s.printerType === 'windows')) {
    const rawPort = resolveWindowsRawPort()
    if (rawPort) {
      const rawResult = await printRawWindowsPort(receiptBuffer, rawPort)
      if (rawResult.ok) return rawResult

      if (s.printerName) {
        const windowsDoc = await printViaWindowsDocument(payload, s.printerName)
        if (windowsDoc.ok) return windowsDoc
      }

      if (s.printerType === 'usb') return rawResult

      const fallback = await printViaThermalLib(payload)
      if (fallback.ok) return fallback

      return {
        ok: false,
        error: `${rawResult.error}\n\nWindows printer fallback ham ishlamadi:\n${fallback.error}`
      }
    }
  }

  // Old konfiguratsiyalarda Windows printer nomi USB turiga tushib qolgan bo'lishi mumkin.
  if (
    s.printerType === 'usb' &&
    process.platform === 'win32' &&
    (!s.printerDevicePath || !/^USB\d+$/i.test(s.printerDevicePath)) &&
    s.printerName
  ) {
    return printViaThermalLib(payload)
  }

  // Windows USB: driver siz, copy /b orqali USB portiga to'g'ridan yozish
  if (s.printerType === 'usb' && process.platform === 'win32') {
    const rawResult = await printRawWindows(receiptBuffer)
    if (rawResult.ok || !s.printerName) return rawResult

    const fallback = await printViaThermalLib(payload)
    if (fallback.ok) return fallback

    return {
      ok: false,
      error: `${rawResult.error}\n\nWindows printer fallback ham ishlamadi:\n${fallback.error}`
    }
  }

  // Network + Windows driver: node-thermal-printer orqali
  return printViaThermalLib(payload)
}

export async function testPrint(): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSettings()
  return printReceipt({
    organizationName: s.organizationName || 'SOHIL',
    organizationAddress: s.organizationAddress || 'Andijon viloyat, Shahrixon tumani',
    organizationPhone: s.organizationPhone || '+99833 904 20 20',
    tableName: '07',
    waiterName: 'Bobirjon',
    orderLocalUuid: 'test1234abcd',
    items: [
      { name: 'Norin', quantity: 2, unitPrice: 30000, total: 60000 },
      { name: 'Manti (Qovurilgan)', quantity: 1, unitPrice: 35000, total: 35000 },
      { name: 'Non', quantity: 2, unitPrice: 3000, total: 6000 },
      { name: 'Choy (Dammalama)', quantity: 1, unitPrice: 12000, total: 12000 },
      { name: 'Salat (Achchiq)', quantity: 1, unitPrice: 10000, total: 10000 }
    ],
    subtotal: 123000,
    serviceFeePercent: 0,
    serviceFee: 0,
    total: 123000,
    printedAt: Date.now(),
    receiptHeader: s.receiptHeader || 'CHOYXONA\nEST. 2010',
    receiptFooter: s.receiptFooter || 'Sohil Choyxonasiga qaytib kelganingiz uchun rahmat!\nBiz bilan yana ko‘rishguncha!',
    receiptQrText: s.receiptQrText || 'https://instagram.com/soxil.choyxona',
    receiptQrLabel: s.receiptQrLabel || '@soxil.choyxona'
  })
}

export async function listUsbPrinters(): Promise<PrinterDiscoveryItem[]> {
  // Windows: USB printer portlarini va o'rnatilgan printerlarni ro'yxatlaymiz
  if (process.platform === 'win32') {
    const results: PrinterDiscoveryItem[] = []
    const printers = listWindowsPrinters()

    // 1. USB printer portlarini topamiz (USB001, USB002 ...) — driver siz ishlaydi
    const seen = new Set<string>()
    const pushUnique = (item: PrinterDiscoveryItem): void => {
      const key = `${item.vendorId}:${item.productId}:${item.product ?? ''}`
      if (seen.has(key)) return
      seen.add(key)
      results.push(item)
    }

    for (const printer of printers) {
      if (!printer.name || isVirtualPrinter(printer.name)) continue
      const status = getWindowsPrinterStatus(printer)

      if (/^USB\d+$/i.test(printer.portName)) {
        pushUnique({
          vendorId: 'usb-port',
          productId: printer.portName.toUpperCase(),
          manufacturer: printer.name,
          product: printer.portName.toUpperCase(),
          online: status.online,
          statusText: status.statusText
        })
      }

      pushUnique({
        vendorId: 'windows',
        productId: printer.portName || 'printer',
        manufacturer: printer.portName || 'Windows Printer',
        product: printer.name,
        online: status.online,
        statusText: status.statusText
      })
    }

    return results
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
