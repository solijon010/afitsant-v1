import https from 'node:https'
import { getSettings } from './settings'

const BOT_TOKEN = '8961588864:AAH1szI4i3OVfGM1XJH845hMJpN3LxZmqxM'
const CHAT_ID = '-1003961907645'

// Bir xil xato 60 soniya ichida bir marta — spam oldini olish
const recentErrors = new Map<string, number>()
const DEDUP_MS = 60_000

function dedupKey(msg: string): string {
  return msg.slice(0, 120)
}

function sendToTelegram(text: string): void {
  // Telegram 4096 belgi limitni qisqartirish
  const safe = text.length > 4000 ? text.slice(0, 4000) + '\n…(qisqartirildi)' : text
  const body = JSON.stringify({ chat_id: CHAT_ID, text: safe, parse_mode: 'HTML' })
  const req = https.request(
    {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    },
    (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        console.warn(`[TG] sendMessage HTTP ${res.statusCode}`)
      }
    }
  )
  req.on('error', (e) => console.warn('[TG] send error:', e.message))
  req.write(body)
  req.end()
}

function nowStr(): string {
  return new Date().toLocaleString('uz-UZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Tashkent'
  })
}

function branchInfo(): string {
  try {
    const s = getSettings()
    return s.organizationName ? `<b>${escHtml(s.organizationName)}</b>` : `Branch: <code>${s.branchId ?? 'noma\'lum'}</code>`
  } catch {
    return 'POS'
  }
}

/** Axios xato obyektidan to'liq ma'lumot olish */
function formatAxiosError(err: any): string {
  const lines: string[] = []
  const status = err?.response?.status
  const statusText = err?.response?.statusText
  const data = err?.response?.data
  const url = err?.config?.url ?? err?.request?.path ?? ''
  const method = (err?.config?.method ?? '').toUpperCase()

  if (method && url) lines.push(`${method} ${url}`)
  if (status) lines.push(`HTTP ${status}${statusText ? ` ${statusText}` : ''}`)
  if (data) {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    lines.push(`Response: ${dataStr}`)
  } else if (err?.message) {
    lines.push(`Message: ${err.message}`)
  }
  if (err?.stack && !status) {
    // Network xato — stack ham qo'shamiz
    lines.push(`Stack: ${err.stack.split('\n').slice(0, 5).join('\n')}`)
  }
  return lines.join('\n')
}

export function tgError(context: string, errOrMessage: any): void {
  const detail = typeof errOrMessage === 'string' ? errOrMessage : formatAxiosError(errOrMessage)
  const key = dedupKey(`err:${context}:${detail}`)
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < DEDUP_MS) return
  recentErrors.set(key, Date.now())

  const text =
    `🔴 <b>XATO</b> — ${branchInfo()}\n` +
    `📍 <b>Joy:</b> ${escHtml(context)}\n` +
    `❌ <b>Xato:</b>\n<code>${escHtml(detail)}</code>\n` +
    `🕐 ${nowStr()}`

  sendToTelegram(text)
}

export function tgWarn(context: string, errOrMessage: any): void {
  const detail = typeof errOrMessage === 'string' ? errOrMessage : formatAxiosError(errOrMessage)
  const key = dedupKey(`warn:${context}:${detail}`)
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < DEDUP_MS) return
  recentErrors.set(key, Date.now())

  const text =
    `🟡 <b>OGOHLANTIRISH</b> — ${branchInfo()}\n` +
    `📍 <b>Joy:</b> ${escHtml(context)}\n` +
    `⚠️ <b>Xabar:</b>\n<code>${escHtml(detail)}</code>\n` +
    `🕐 ${nowStr()}`

  sendToTelegram(text)
}

export function tgOfflineClose(tableId: number, total: number): void {
  const key = dedupKey(`offlineClose:${tableId}:${total}`)
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < DEDUP_MS) return
  recentErrors.set(key, Date.now())

  const text =
    `📴 <b>OFFLAYN YOPISH</b> — ${branchInfo()}\n` +
    `🪑 <b>Stol ID:</b> ${tableId}\n` +
    `💰 <b>Summa:</b> ${String(Math.round(total)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm\n` +
    `ℹ️ Internet kelganda serverga yuboriladi\n` +
    `🕐 ${nowStr()}`

  sendToTelegram(text)
}

export function tgConnectStatus(online: boolean): void {
  const key = `connect:${online}`
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < 5 * 60_000) return
  recentErrors.set(key, Date.now())

  const text = online
    ? `🟢 <b>ULANISH TIKLANDI</b> — ${branchInfo()}\n🕐 ${nowStr()}`
    : `🔴 <b>INTERNET UZILDI</b> — ${branchInfo()}\n🕐 ${nowStr()}`

  sendToTelegram(text)
}

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
