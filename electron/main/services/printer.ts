import { writeSync, openSync, closeSync, existsSync, fsyncSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import type { ReceiptPayload } from '@shared/types'
import { getSettings } from './settings'
import { getDb } from '../db/connection'

const ESC = 0x1b
const GS = 0x1d
const MAX_SAFE_RECEIPT_LOGO_BYTES = 64 * 1024
const RECEIPT_MONEY_UNIT = "so`m"
const RECEIPT_COPY_COUNT = 2

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

function fmtReceiptMoney(n: number): string {
  return `${fmt(n)} ${RECEIPT_MONEY_UNIT}`
}

function fmtDateTime(ts: number): { date: string; time: string } {
  const d = new Date(ts)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return { date: `${dd}.${mm}.${yyyy}`, time: `${hh}:${min}` }
}

function splitLines(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const RECEIPT_WIDTH = 48

function sanitizeReceiptText(text: string): string {
  return text
    .replace(/№/g, 'No')
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/ў/g, "'")
    .replace(/Ў/g, "'")
    .replace(/ʼ/g, "'")
}

function wrapText(text: string, width: number): string[] {
  const cleaned = sanitizeReceiptText(text).trim()
  if (!cleaned) return ['']

  const words = cleaned.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current)
        current = ''
      }
      for (let i = 0; i < word.length; i += width) {
        lines.push(word.slice(i, i + width))
      }
      continue
    }

    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= width) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
  }

  if (current) lines.push(current)
  return lines
}

function buildReceiptLines(
  payload: ReceiptPayload,
  width = RECEIPT_WIDTH,
  options: { brandedHeader?: boolean; includeQrLabel?: boolean; includeQrText?: boolean } = {}
): string[] {
  const brandedHeader = options.brandedHeader ?? false
  const includeQrLabel = options.includeQrLabel ?? false
  const includeQrText = options.includeQrText ?? false
  const qtyCol = width >= 40 ? 4 : 3
  const sumCol = Math.max(12, Math.floor(width * 0.34))
  const nameCol = Math.max(12, width - qtyCol - sumCol - 2)
  const line = '-'.repeat(width)
  const { date, time } = fmtDateTime(payload.printedAt)
  const receiptNo = formatReceiptNo(payload.orderLocalUuid, payload.receiptNumber)
  const headerLines = splitLines(payload.receiptHeader)
  const footerLines = splitLines(payload.receiptFooter)
  const lines: string[] = []

  if (!brandedHeader) {
    lines.push(center(sanitizeReceiptText(payload.organizationName).slice(0, width), width))
    for (const lineText of headerLines) {
      for (const row of wrapText(lineText, width)) lines.push(center(row, width))
    }
  }
  if (payload.organizationAddress) {
    for (const row of wrapText(payload.organizationAddress, width)) lines.push(center(row, width))
  }
  lines.push(center(sanitizeReceiptText(`Xizmatda: ${payload.waiterName}`).slice(0, width), width))
  if (payload.organizationPhone) {
    lines.push(center(sanitizeReceiptText(`Tel: ${payload.organizationPhone}`).slice(0, width), width))
  }
  lines.push(line)
  lines.push(pad(`CHEK No: ${receiptNo}`, `STOL: ${sanitizeReceiptText(payload.tableName)}`, width))
  lines.push(pad(`SANA: ${date}`, `VAQT: ${time}`, width))
  lines.push(line)
  lines.push('BUYURTMALAR'.padEnd(nameCol) + ' ' + 'SONI'.padStart(qtyCol) + ' ' + 'SUMMA'.padStart(sumCol))
  lines.push('-'.repeat(nameCol) + ' ' + '-'.repeat(qtyCol) + ' ' + '-'.repeat(sumCol))

  for (const item of payload.items) {
    const itemName = sanitizeReceiptText(item.name)
    const nameLines = wrapText(itemName, nameCol)
    const qty = fmtQty(item.quantity).padStart(qtyCol)
    const total = fmtReceiptMoney(item.total).padStart(sumCol)
    lines.push((nameLines.shift() ?? '').padEnd(nameCol) + ' ' + qty + ' ' + total)
    for (const rest of nameLines) {
      lines.push(rest.padEnd(nameCol))
    }
  }

  lines.push(line)
  if (payload.serviceFee > 0) {
    lines.push(pad(`Xizmat ${payload.serviceFeePercent}%:`, fmtReceiptMoney(payload.serviceFee), width))
    lines.push(line)
  }
  lines.push(pad('JAMI:', fmtReceiptMoney(payload.total), width))
  lines.push(line)

  for (const lineText of footerLines) {
    for (const row of wrapText(lineText, width)) lines.push(center(row, width))
  }
  if (includeQrLabel && payload.receiptQrLabel) {
    for (const row of wrapText(payload.receiptQrLabel, width)) lines.push(center(row, width))
  }
  if (includeQrText && payload.receiptQrText) {
    for (const row of wrapText(payload.receiptQrText, width)) lines.push(center(row, width))
  }

  return lines
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')
}

function formatReceiptNo(orderLocalUuid: string, dailyNo?: number): string {
  if (dailyNo !== undefined) return String(dailyNo).padStart(5, '0')
  const digits = orderLocalUuid.replace(/\D/g, '')
  if (digits.length > 0) return digits.slice(-5).padStart(5, '0')
  return orderLocalUuid.slice(0, 8).toUpperCase()
}

function getReceiptCopyCount(): number {
  return Math.max(1, RECEIPT_COPY_COUNT)
}

function getLocalReceiptDateKey(ts = Date.now()): string {
  const d = new Date(ts)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function peekNextDailyReceiptNo(): number {
  const db = getDb()
  const today = getLocalReceiptDateKey()
  const getRow = (key: string) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null

  const storedDate = getRow('receiptDailyDate')
  const storedCount = getRow('receiptDailyCount')
  return storedDate === today && storedCount ? parseInt(storedCount, 10) + 1 : 1
}

function commitDailyReceiptNo(count: number, ts = Date.now()): void {
  const db = getDb()
  const today = getLocalReceiptDateKey(ts)
  const upsert = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
  upsert.run('receiptDailyDate', today)
  upsert.run('receiptDailyCount', String(count))
}

function nextDailyReceiptNo(): number {
  const count = peekNextDailyReceiptNo()
  commitDailyReceiptNo(count)
  return count
}

function buildQrEscPos(url: string): Buffer {
  const data = Buffer.from(url, 'utf8')
  const storeLen = data.length + 3
  const pL = storeLen & 0xff
  const pH = (storeLen >> 8) & 0xff
  const storeHeader = Buffer.from([GS, 0x28, 0x6b, pL, pH, 49, 80, 48])
  return Buffer.concat([
    Buffer.from([GS, 0x28, 0x6b, 4, 0, 49, 65, 50, 0]),
    Buffer.from([GS, 0x28, 0x6b, 3, 0, 49, 67, 8]),
    Buffer.from([GS, 0x28, 0x6b, 3, 0, 49, 69, 49]),
    Buffer.concat([storeHeader, data]),
    Buffer.from([GS, 0x28, 0x6b, 3, 0, 49, 81, 48])
  ])
}

function resolveReceiptHeaderAssetPath(): string | null {
  const roots = Array.from(new Set([app.getAppPath(), process.cwd()]))
  const fileCandidates = roots.flatMap((root) => [
    join(root, 'src', 'assets', 'receipt-header-thermal-clean.png'),
    join(root, 'src', 'assets', 'receipt-header-thermal.png'),
    join(root, 'src', 'assets', 'receipt-header.png')
  ])
  for (const filePath of fileCandidates) {
    if (existsSync(filePath)) return filePath
  }

  // Packaged EXE: extraResources papkasidan qidirish
  try {
    const resPath = process.resourcesPath
    if (resPath) {
      const resCandidates = [
        join(resPath, 'receipt-header-thermal-clean.png'),
        join(resPath, 'receipt-header-thermal.png'),
        join(resPath, 'receipt-header.png'),
      ]
      for (const filePath of resCandidates) {
        if (existsSync(filePath)) return filePath
      }
    }
  } catch { /* ignore */ }

  const assetDirs = roots.map((root) => join(root, 'out', 'renderer', 'assets'))
  for (const dir of assetDirs) {
    if (!existsSync(dir)) continue
    try {
      const file =
        readdirSync(dir).find((name) => /^receipt-header-thermal-clean.*\.png$/i.test(name)) ??
        readdirSync(dir).find((name) => /^receipt-header-thermal.*\.png$/i.test(name)) ??
        readdirSync(dir).find((name) => /^receipt-header.*\.png$/i.test(name))
      if (file) return join(dir, file)
    } catch {
      // ignore lookup errors
    }
  }

  return null
}

function resolveReceiptTemplatePath(): string | null {
  const roots = Array.from(new Set([app.getAppPath(), process.cwd()]))
  const fileCandidates = roots.flatMap((root) => [
    join(root, 'src', 'assets', 'chek-template.png'),
    join(root, 'chek.jpg'),
    join(root, 'chek.png'),
    join(root, 'src', 'assets', 'chek.jpg'),
    join(root, 'src', 'assets', 'chek.png')
  ])

  for (const filePath of fileCandidates) {
    if (existsSync(filePath)) return filePath
  }

  const assetDirs = roots.map((root) => join(root, 'out', 'renderer', 'assets'))
  for (const dir of assetDirs) {
    if (!existsSync(dir)) continue
    try {
      const file = readdirSync(dir).find((name) => /^chek.*\.(png|jpg|jpeg)$/i.test(name))
      if (file) return join(dir, file)
    } catch {
      // ignore lookup errors
    }
  }

  return null
}

function resolveAppLogoPath(): string | null {
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

function resolveReceiptLogoPath(): string | null {
  return resolveReceiptHeaderAssetPath() ?? resolveAppLogoPath()
}

function isSafeReceiptLogo(path: string): boolean {
  try {
    const stats = statSync(path)
    return stats.size > 0 && stats.size <= MAX_SAFE_RECEIPT_LOGO_BYTES
  } catch {
    return false
  }
}

async function buildQrImageFile(qrText: string | null | undefined): Promise<string | null> {
  if (!qrText) return null
  const qrImagePath = join(tmpdir(), `afisant-qr-${Date.now()}.png`)
  try {
    const QRCode = await import('qrcode')
    await QRCode.toFile(qrImagePath, qrText, {
      type: 'png',
      margin: 0,
      width: 220,
      color: { dark: '#000000', light: '#FFFFFF' }
    })
    return qrImagePath
  } catch (e) {
    console.warn('[PRINTER] QR image build skipped:', (e as Error)?.message ?? e)
    return null
  }
}

function buildEscPosSingle(payload: ReceiptPayload): Buffer {
  const W = RECEIPT_WIDTH
  const lines = buildReceiptLines(payload, W)
  const totalText = fmtReceiptMoney(payload.total)

  const parts: Uint8Array[] = [
    bytes(ESC, 0x40),
    bytes(ESC, 0x61, 0x00),
  ]

  for (const lineText of lines) {
    if (lineText.trim().startsWith('JAMI:')) {
      parts.push(bytes(ESC, 0x45, 0x01))
      parts.push(textBytes('JAMI:\n'))
      parts.push(bytes(ESC, 0x61, 0x02))
      parts.push(bytes(GS, 0x21, 0x21))
      parts.push(textBytes(totalText + '\n'))
      parts.push(bytes(GS, 0x21, 0x00))
      parts.push(bytes(ESC, 0x61, 0x00))
      parts.push(bytes(ESC, 0x45, 0x00))
    } else {
      parts.push(textBytes(lineText + '\n'))
    }
  }
  if (payload.receiptQrText) {
    parts.push(bytes(ESC, 0x61, 0x01))
    parts.push(bytes(ESC, 0x64, 1))
    parts.push(buildQrEscPos(payload.receiptQrText))
    parts.push(bytes(ESC, 0x64, 1))
    if (payload.receiptQrLabel) {
      parts.push(textBytes(sanitizeReceiptText(payload.receiptQrLabel) + '\n'))
      parts.push(bytes(ESC, 0x64, 1))
    }
  }
  parts.push(bytes(ESC, 0x64, 3))
  parts.push(bytes(GS, 0x56, 0x00))
  return concat(...parts)
}

function buildEscPos(payload: ReceiptPayload): Buffer {
  const copies = Array.from({ length: getReceiptCopyCount() }, () => buildEscPosSingle(payload))
  return Buffer.concat(copies)
}

function buildReceiptText(payload: ReceiptPayload, width = RECEIPT_WIDTH): string {
  return buildReceiptLines(payload, width).join('\n')
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

  const devicePath = `\\\\.\\${normalizedPort}`
  try {
    const fd = openSync(devicePath, 'w')
    try {
      writeSync(fd, data)
      try { fsyncSync(fd) } catch { /* ba'zi USB drayverlar fsync qo'llab-quvvatlamaydi */ }
    } finally {
      closeSync(fd)
    }
    return { ok: true }
  } catch (e: any) {
    const msg = String(e?.message ?? 'USB port xatosi')
    const usbPrinter = findWindowsPrinterByPort(normalizedPort)
    const printerName = usbPrinter?.name ?? 'Thermal printer'
    console.error('[PRINTER] Windows USB error:', msg)

    if (/no such file|cannot find|enoent/i.test(msg)) {
      return {
        ok: false,
        error: `USB port topilmadi (${normalizedPort}).\nWindows printer porti o'zgargan bo'lishi mumkin — Sozlamalar > Aniqlash ni bosing.`
      }
    }
    if (/access is denied|eacces|permission/i.test(msg)) {
      return {
        ok: false,
        error: `${printerName} (${normalizedPort}) ga ruxsat yo'q.\nPrinterni qayta ulab ko'ring yoki administratordan ruxsat so'rang.`
      }
    }
    return {
      ok: false,
      error: `Windows USB print xatosi (${normalizedPort}):\n${msg}\n\nSozlamalar > Printer > USB Port ni tekshiring`
    }
  }
}

async function printRawWindowsQueue(data: Buffer, printerName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const dataFile = join(tmpdir(), `afisant-raw-${Date.now()}.bin`)
  const scriptFile = join(tmpdir(), `afisant-raw-${Date.now()}.ps1`)
  const safePrinterName = printerName.replace(/'/g, "''")
  const safeDataFile = dataFile.replace(/'/g, "''")

  const script = [
    '$ErrorActionPreference = "Stop"',
    "Add-Type -TypeDefinition @'",
    'using System;',
    'using System.ComponentModel;',
    'using System.Runtime.InteropServices;',
    'public static class RawPrinterHelper {',
    '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
    '  public class DOCINFO {',
    '    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;',
    '    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;',
    '    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;',
    '  }',
    '  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]',
    '  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);',
    '  [DllImport("winspool.Drv", SetLastError = true)]',
    '  public static extern bool ClosePrinter(IntPtr hPrinter);',
    '  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]',
    '  public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO di);',
    '  [DllImport("winspool.Drv", SetLastError = true)]',
    '  public static extern bool EndDocPrinter(IntPtr hPrinter);',
    '  [DllImport("winspool.Drv", SetLastError = true)]',
    '  public static extern bool StartPagePrinter(IntPtr hPrinter);',
    '  [DllImport("winspool.Drv", SetLastError = true)]',
    '  public static extern bool EndPagePrinter(IntPtr hPrinter);',
    '  [DllImport("winspool.Drv", SetLastError = true)]',
    '  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);',
    '  public static void Send(string printerName, byte[] bytes) {',
    '    IntPtr hPrinter = IntPtr.Zero;',
    '    var di = new DOCINFO { pDocName = "Afisant Receipt", pDataType = "RAW" };',
    '    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());',
    '    try {',
    '      if (StartDocPrinter(hPrinter, 1, di) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());',
    '      try {',
    '        if (!StartPagePrinter(hPrinter)) throw new Win32Exception(Marshal.GetLastWin32Error());',
    '        try {',
    '          int written;',
    '          if (!WritePrinter(hPrinter, bytes, bytes.Length, out written)) throw new Win32Exception(Marshal.GetLastWin32Error());',
    '          if (written != bytes.Length) throw new Exception("RAW bytes to\'liq yuborilmadi");',
    '        } finally {',
    '          EndPagePrinter(hPrinter);',
    '        }',
    '      } finally {',
    '        EndDocPrinter(hPrinter);',
    '      }',
    '    } finally {',
    '      ClosePrinter(hPrinter);',
    '    }',
    '  }',
    '}',
    "'@",
    `$printerName = '${safePrinterName}'`,
    `$dataFile = '${safeDataFile}'`,
    '$bytes = [System.IO.File]::ReadAllBytes($dataFile)',
    '[RawPrinterHelper]::Send($printerName, $bytes)'
  ].join("\r\n")

  try {
    writeFileSync(dataFile, data)
    writeFileSync(scriptFile, script, 'utf8')
    execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`, {
      timeout: 20000,
      stdio: 'pipe'
    })
    return { ok: true }
  } catch (e: any) {
    const msg = String(e?.stderr ?? e?.message ?? 'Windows RAW printer xatosi')
    return {
      ok: false,
      error: `Windows RAW printer xatosi (${printerName}):\n${msg}`
    }
  } finally {
    try { unlinkSync(dataFile) } catch { /* ignore */ }
    try { unlinkSync(scriptFile) } catch { /* ignore */ }
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
  const savedPort = s.printerDevicePath?.trim()

  if (s.printerName) {
    const printer = findWindowsPrinterByName(s.printerName)
    if (printer && /^USB\d+$/i.test(printer.portName.trim())) {
      return printer.portName.trim().toUpperCase()
    }
  }

  if (savedPort && /^USB\d+$/i.test(savedPort)) {
    return savedPort.toUpperCase()
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
  const logoPath = resolveReceiptLogoPath()
  let brandedHeader = false
  const totalText = fmtReceiptMoney(payload.total)

  if (logoPath && isSafeReceiptLogo(logoPath)) {
    printer.alignCenter()
    try {
      await printer.printImage(logoPath)
      printer.newLine()
      brandedHeader = true
    } catch (e) {
      console.warn('[PRINTER] logo print skipped:', (e as Error)?.message ?? e)
    }
  } else if (logoPath) {
    console.warn('[PRINTER] logo print skipped: unsafe logo asset size')
  }

  const lines = buildReceiptLines(payload, RECEIPT_WIDTH, { brandedHeader })
  printer.alignLeft()
  for (const lineText of lines) {
    if (lineText.trim().startsWith('JAMI:')) {
      printer.bold(true)
      printer.println('JAMI:')
      printer.alignRight()
      if (typeof printer.setTextQuadArea === 'function') {
        printer.setTextQuadArea()
      } else {
        printer.setTextDoubleWidth()
        printer.setTextDoubleHeight()
      }
      printer.println(totalText)
      printer.setTextNormal()
      printer.alignLeft()
      printer.bold(false)
      continue
    }
    printer.println(lineText)
  }
  if (payload.receiptQrText) {
    printer.alignCenter()
    printer.newLine()
    printer.printQR(payload.receiptQrText, { cellSize: 7, correction: 'M', model: 2 })
    if (payload.receiptQrLabel) {
      printer.newLine()
      printer.println(sanitizeReceiptText(payload.receiptQrLabel))
    }
    printer.newLine()
  }
  printer.cut()
}

async function renderReceiptCopies(printer: any, payload: ReceiptPayload): Promise<void> {
  for (let index = 0; index < getReceiptCopyCount(); index += 1) {
    await renderReceipt(printer, payload)
  }
}

async function buildThermalBuffer(payload: ReceiptPayload): Promise<Buffer | null> {
  const mod = await loadPrinter()
  if (!mod) return null

  const { ThermalPrinter, PrinterTypes } = mod as any
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: join(tmpdir(), `afisant-buffer-${Date.now()}.tmp`),
    width: RECEIPT_WIDTH,
    characterSet: 'PC866_CYRILLIC2',
    removeSpecialCharacters: false,
    lineCharacter: '-'
  })

  await renderReceiptCopies(printer, payload)
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
  const jsonFile = join(tmpdir(), `afisant-receipt-${Date.now()}.json`)
  const scriptFile = join(tmpdir(), `afisant-receipt-${Date.now()}.ps1`)
  const headerImagePath = resolveReceiptLogoPath()
  const qrImagePath = await buildQrImageFile(payload.receiptQrText)
  const safePrinterName = printerName.replace(/'/g, "''")
  const safeJsonFile = jsonFile.replace(/'/g, "''")
  const { date, time } = fmtDateTime(payload.printedAt)
  const receiptNo = formatReceiptNo(payload.orderLocalUuid, payload.receiptNumber)
  const headerTextLines = headerImagePath
    ? []
    : [
        sanitizeReceiptText(payload.organizationName),
        ...splitLines(payload.receiptHeader).map((line) => sanitizeReceiptText(line))
      ]

  const itemRows = payload.items.flatMap((item) => {
    const nameLines = wrapText(item.name, 24)
    return nameLines.map((name, index) => ({
      name,
      quantity: index === 0 ? fmtQty(item.quantity) : '',
      total: index === 0 ? fmtReceiptMoney(item.total) : ''
    }))
  })

  if (payload.serviceFee > 0) {
    itemRows.push({
      name: `Xizmat (${payload.serviceFeePercent}%)`,
      quantity: '',
      total: fmtReceiptMoney(payload.serviceFee)
    })
  }

  const footerLines = splitLines(payload.receiptFooter).map((line) => sanitizeReceiptText(line))
  const paperHeight = Math.min(
    2600,
    Math.max(
      720,
      220 +
        headerTextLines.length * 24 +
        itemRows.length * 24 +
        footerLines.length * 22 +
        (headerImagePath ? 120 : 0) +
        (qrImagePath ? 150 : 0)
    )
  )

  const renderModel = {
    headerImagePath: headerImagePath ?? '',
    qrImagePath: qrImagePath ?? '',
    qrLabel: payload.receiptQrLabel ?? '',
    headerTextLines,
    organizationAddress: payload.organizationAddress ? sanitizeReceiptText(payload.organizationAddress) : '',
    waiterLine: sanitizeReceiptText(`Xizmatda: ${payload.waiterName}`),
    phoneLine: payload.organizationPhone ? sanitizeReceiptText(`Tel: ${payload.organizationPhone}`) : '',
    receiptNo,
    tableName: sanitizeReceiptText(payload.tableName),
    date,
    time,
    items: itemRows,
    totalText: fmtReceiptMoney(payload.total),
    footerLines,
    paperHeight,
    paperWidth: 288,
    contentInset: 12,
    headerWidth: 180,
    qrSize: 150,
    copies: getReceiptCopyCount(),
    bodyFontSize: 9.0,
    smallFontSize: 8.4,
    boldFontSize: 10.8
  }

  const script = [
    "Add-Type -AssemblyName System.Drawing",
    `$printerName = '${safePrinterName}'`,
    `$jsonFile = '${safeJsonFile}'`,
    '$data = Get-Content -Path $jsonFile -Raw | ConvertFrom-Json',
    '$doc = New-Object System.Drawing.Printing.PrintDocument',
    '$doc.PrinterSettings.PrinterName = $printerName',
    '$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController',
    "$doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('AfisantReceipt', [int]$data.paperWidth, [Math]::Max(520, [int]$data.paperHeight))",
    '$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)',
    '$doc.add_PrintPage({',
    '  param($sender, $e)',
    '  $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality',
    '  $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic',
    '  $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality',
    '  $e.Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality',
    '  $e.Graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit',
    '  $e.Graphics.TranslateTransform(-[float]$e.PageSettings.HardMarginX, -[float]$e.PageSettings.HardMarginY)',
    '  $pageWidth = [double]$data.paperWidth',
    '  $left = [double]$data.contentInset',
    '  $right = [double]$data.paperWidth - [double]$data.contentInset',
    '  $width = $right - $left',
    '  $nameWidth = $width - 42.0 - 82.0 - 12.0',
    '  $qtyLeft = $left + $nameWidth + 6.0',
    '  $sumLeft = $qtyLeft + 42.0 + 6.0',
    '  $y = 6.0',
    '  $headerImage = if ($data.headerImagePath -and (Test-Path ([string]$data.headerImagePath))) { [System.Drawing.Image]::FromFile([string]$data.headerImagePath) } else { $null }',
    '  $qrImage = if ($data.qrImagePath -and (Test-Path ([string]$data.qrImagePath))) { [System.Drawing.Image]::FromFile([string]$data.qrImagePath) } else { $null }',
    '  try {',
    '    $black = [System.Drawing.Brushes]::Black',
    '    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1)',
    "    $bodyFont = New-Object System.Drawing.Font('Arial', [float]$data.bodyFontSize, [System.Drawing.FontStyle]::Regular)",
    "    $smallFont = New-Object System.Drawing.Font('Arial', [float]$data.smallFontSize, [System.Drawing.FontStyle]::Regular)",
    "    $boldFont = New-Object System.Drawing.Font('Arial', [float]$data.boldFontSize, [System.Drawing.FontStyle]::Bold)",
    "    $totalFont = New-Object System.Drawing.Font('Arial', ([float]$data.boldFontSize + 7.0), [System.Drawing.FontStyle]::Bold)",
    '    $center = New-Object System.Drawing.StringFormat',
    '    $center.Alignment = [System.Drawing.StringAlignment]::Center',
    '    $center.LineAlignment = [System.Drawing.StringAlignment]::Center',
    '    $leftFmt = New-Object System.Drawing.StringFormat',
    '    $leftFmt.Alignment = [System.Drawing.StringAlignment]::Near',
    '    $leftFmt.LineAlignment = [System.Drawing.StringAlignment]::Center',
    '    $rightFmt = New-Object System.Drawing.StringFormat',
    '    $rightFmt.Alignment = [System.Drawing.StringAlignment]::Far',
    '    $rightFmt.LineAlignment = [System.Drawing.StringAlignment]::Center',
    '    try {',
    '      if ($headerImage) {',
    '        $targetWidth = [double][Math]::Min([double]$data.headerWidth, [double]$width)',
    '        $targetHeight = [double]($headerImage.Height * ($targetWidth / $headerImage.Width))',
    '        if ($targetHeight -gt 150) {',
    '          $scale = 150 / $targetHeight',
    '          $targetWidth *= $scale',
    '          $targetHeight = 150',
    '        }',
    '        $x = [double](($pageWidth - $targetWidth) / 2.0)',
    '        $e.Graphics.DrawImage($headerImage, $x, $y, $targetWidth, $targetHeight)',
    '        $y += $targetHeight + 8',
    '      } else {',
    '        foreach ($line in $data.headerTextLines) {',
    '          $rect = New-Object System.Drawing.RectangleF($left, $y, $width, 22)',
    '          $e.Graphics.DrawString([string]$line, $boldFont, $black, $rect, $center)',
    '          $y += 22',
    '        }',
    '      }',
    '      foreach ($meta in @($data.organizationAddress, $data.waiterLine, $data.phoneLine)) {',
    '        if ($meta) {',
    '          $rect = New-Object System.Drawing.RectangleF($left, $y, $width, 20)',
    '          $e.Graphics.DrawString([string]$meta, $bodyFont, $black, $rect, $center)',
    '          $y += 20',
    '        }',
    '      }',
    '      $y += 4',
    '      $e.Graphics.DrawLine($pen, $left, $y, $right, $y)',
    '      $y += 6',
    '      $halfWidth = [double](($width - 8.0) / 2.0)',
    '      $metaLeft = New-Object System.Drawing.RectangleF($left, $y, $halfWidth, 22)',
    '      $metaRight = New-Object System.Drawing.RectangleF(($left + $halfWidth + 8), $y, $halfWidth, 22)',
    '      $e.Graphics.DrawString(("CHEK No: " + [string]$data.receiptNo), $bodyFont, $black, $metaLeft, $leftFmt)',
    '      $e.Graphics.DrawString(("STOL: " + [string]$data.tableName), $bodyFont, $black, $metaRight, $rightFmt)',
    '      $y += 22',
    '      $metaLeft = New-Object System.Drawing.RectangleF($left, $y, $halfWidth, 22)',
    '      $metaRight = New-Object System.Drawing.RectangleF(($left + $halfWidth + 8), $y, $halfWidth, 22)',
    '      $e.Graphics.DrawString(("SANA: " + [string]$data.date), $bodyFont, $black, $metaLeft, $leftFmt)',
    '      $e.Graphics.DrawString(("VAQT: " + [string]$data.time), $bodyFont, $black, $metaRight, $rightFmt)',
    '      $y += 24',
    '      $e.Graphics.DrawLine($pen, $left, $y, $right, $y)',
    '      $y += 6',
    '      $e.Graphics.DrawString("BUYURTMALAR", $boldFont, $black, (New-Object System.Drawing.RectangleF($left, $y, $nameWidth, 22)), $leftFmt)',
    '      $e.Graphics.DrawString("SONI", $boldFont, $black, (New-Object System.Drawing.RectangleF($qtyLeft, $y, 42, 22)), $center)',
    '      $e.Graphics.DrawString("SUMMA", $boldFont, $black, (New-Object System.Drawing.RectangleF($sumLeft, $y, ($right - $sumLeft), 22)), $rightFmt)',
    '      $y += 24',
    '      $e.Graphics.DrawLine($pen, $left, $y, $right, $y)',
    '      $y += 6',
    '      foreach ($item in $data.items) {',
    '        $e.Graphics.DrawString([string]$item.name, $bodyFont, $black, (New-Object System.Drawing.RectangleF($left, $y, $nameWidth, 22)), $leftFmt)',
    '        if ([string]$item.quantity) {',
    '          $e.Graphics.DrawString([string]$item.quantity, $bodyFont, $black, (New-Object System.Drawing.RectangleF($qtyLeft, $y, 42, 22)), $center)',
    '        }',
    '        if ([string]$item.total) {',
    '          $e.Graphics.DrawString([string]$item.total, $bodyFont, $black, (New-Object System.Drawing.RectangleF($sumLeft, $y, ($right - $sumLeft), 22)), $rightFmt)',
    '        }',
    '        $y += 22',
    '      }',
    '      $e.Graphics.DrawLine($pen, $left, $y, $right, $y)',
    '      $y += 8',
    '      $e.Graphics.DrawString("JAMI:", $boldFont, $black, (New-Object System.Drawing.RectangleF($left, $y, 70, 24)), $leftFmt)',
    '      $y += 24',
    '      $e.Graphics.DrawString([string]$data.totalText, $totalFont, $black, (New-Object System.Drawing.RectangleF($left, $y, $width, 32)), $rightFmt)',
    '      $y += 34',
    '      $e.Graphics.DrawLine($pen, $left, $y, $right, $y)',
    '      $y += 8',
    '      foreach ($line in $data.footerLines) {',
    '        $rect = New-Object System.Drawing.RectangleF($left, $y, $width, 20)',
    '        $e.Graphics.DrawString([string]$line, $bodyFont, $black, $rect, $center)',
    '        $y += 20',
    '      }',
    '      if ($qrImage) {',
    '        $y += 6',
    '        $qrSize = [double][Math]::Min([double]$data.qrSize, [double]$width)',
    '        $qrX = [double](($pageWidth - $qrSize) / 2.0)',
    '        $e.Graphics.DrawImage($qrImage, $qrX, $y, $qrSize, $qrSize)',
    '        $y += $qrSize + 4',
    '      }',
    '      if ($data.qrLabel) {',
    '        $rect = New-Object System.Drawing.RectangleF($left, $y, $width, 20)',
    '        $e.Graphics.DrawString([string]$data.qrLabel, $bodyFont, $black, $rect, $center)',
    '        $y += 20',
    '      }',
    '    } finally {',
    '      $pen.Dispose()',
    '      $center.Dispose()',
    '      $leftFmt.Dispose()',
    '      $rightFmt.Dispose()',
    '      $bodyFont.Dispose()',
    '      $smallFont.Dispose()',
    '      $boldFont.Dispose()',
    '      $totalFont.Dispose()',
    '    }',
    '  } finally {',
    '    if ($headerImage) { $headerImage.Dispose() }',
    '    if ($qrImage) { $qrImage.Dispose() }',
    '    }',
    '  $e.HasMorePages = $false',
    '})',
    'try {',
    '  $copies = [Math]::Max(1, [int]$data.copies)',
    '  for ($copyIndex = 0; $copyIndex -lt $copies; $copyIndex++) {',
    '    $doc.Print()',
    '  }',
    "} catch { throw $_ } finally {",
    '  $doc.Dispose()',
    '}'
  ].join("\r\n")

  try {
    writeFileSync(jsonFile, JSON.stringify(renderModel), 'utf8')
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
    try { unlinkSync(jsonFile) } catch { /* ignore */ }
    try { unlinkSync(scriptFile) } catch { /* ignore */ }
    if (qrImagePath) {
      try { unlinkSync(qrImagePath) } catch { /* ignore */ }
    }
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
      width: RECEIPT_WIDTH,
      characterSet: 'PC866_CYRILLIC2',
      removeSpecialCharacters: false
    })

    const connected = await printer.isPrinterConnected()
    if (!connected) return { ok: false, error: 'Printer ulanmagan' }
    await renderReceiptCopies(printer, payload)
    await printer.execute()
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Printerda xatolik' }
  }
}

async function printReceiptInternal(
  payload: ReceiptPayload,
  options: { useDailyReceiptNumber: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSettings()
  if (!s.printerType) return { ok: false, error: 'Printer sozlanmagan' }

  const receiptNumber = payload.receiptNumber ?? (options.useDailyReceiptNumber ? peekNextDailyReceiptNo() : undefined)
  const resolvedPayload: ReceiptPayload =
    receiptNumber !== undefined ? { ...payload, receiptNumber } : payload

  let result: { ok: true } | { ok: false; error: string }

  if (process.platform === 'win32') {
    const needsRawBuffer = s.printerType === 'usb' || s.printerType === 'raw' || s.printerType === 'windows'
    const receiptBuffer = needsRawBuffer ? await buildReceiptBuffer(resolvedPayload) : null

    if ((s.printerType === 'usb' || s.printerType === 'raw' || s.printerType === 'windows') && s.printerName && receiptBuffer) {
      result = await printRawWindowsQueue(receiptBuffer, s.printerName)
      if (!result.ok && (s.printerType === 'usb' || s.printerType === 'raw')) {
        const rawPort = resolveWindowsRawPort()
        if (rawPort) {
          result = await printRawWindowsPort(receiptBuffer, rawPort)
        }
      }
      if (!result.ok && s.printerType === 'windows') {
        result = await printViaWindowsDocument(resolvedPayload, s.printerName)
      }
    } else if (s.printerType === 'usb' || s.printerType === 'raw') {
      const rawPort = resolveWindowsRawPort()
      if (rawPort && receiptBuffer) {
        result = await printRawWindowsPort(receiptBuffer, rawPort)
      } else if (s.printerName) {
        result = await printViaWindowsDocument(resolvedPayload, s.printerName)
      } else {
        result = { ok: false, error: 'Printer sozlanmagan: USB port (USB001/USB002) yoki printer nomi kiritilmagan' }
      }
    } else if (s.printerType === 'windows') {
      result = { ok: false, error: 'Windows printer nomi kiritilmagan' }
    } else {
      result = await printViaThermalLib(resolvedPayload)
    }
  } else if (s.printerType === 'usb') {
    const receiptBuffer = await buildReceiptBuffer(resolvedPayload)
    result = await printRaw(receiptBuffer)
  } else {
    result = await printViaThermalLib(resolvedPayload)
  }

  if (result.ok && options.useDailyReceiptNumber && receiptNumber !== undefined) {
    commitDailyReceiptNo(receiptNumber)
  }
  return result
}

export async function printReceipt(payload: ReceiptPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSettings()
  const augmented: ReceiptPayload = {
    ...payload,
    organizationName:    payload.organizationName    || s.organizationName    || 'SOHIL',
    organizationAddress: payload.organizationAddress || s.organizationAddress || 'Andijon viloyat, Shahrixon tumani',
    organizationPhone:   payload.organizationPhone   || s.organizationPhone   || '+99833 904 20 20',
    receiptHeader:       payload.receiptHeader       || s.receiptHeader       || 'CHOYXONA\nEST. 2005',
    receiptFooter:       payload.receiptFooter       || s.receiptFooter       || "Sohil Choyxonasiga qaytib kelganingiz uchun rahmat!\nBiz bilan yana ko'rishguncha!",
    receiptQrText:       payload.receiptQrText       || s.receiptQrText       || 'https://instagram.com/soxil.choyxona',
    receiptQrLabel:      payload.receiptQrLabel      || s.receiptQrLabel      || '@soxil.choyxona',
  }
  return printReceiptInternal(augmented, { useDailyReceiptNumber: payload.receiptNumber === undefined })
}

export async function testPrint(): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSettings()
  return printReceiptInternal({
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
    receiptHeader: s.receiptHeader || 'CHOYXONA\nEST. 2005',
    receiptFooter: s.receiptFooter || "Sohil Choyxonasiga qaytib kelganingiz uchun rahmat!\nBiz bilan yana ko'rishguncha!",
    receiptQrText: s.receiptQrText || 'https://instagram.com/soxil.choyxona',
    receiptQrLabel: s.receiptQrLabel || '@soxil.choyxona'
  }, { useDailyReceiptNumber: false })
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
