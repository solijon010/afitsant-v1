import https from 'node:https'
import { getSettings } from './settings'

const BOT_TOKEN = '8961588864:AAH1szI4i3OVfGM1XJH845hMJpN3LxZmqxM'
const CHAT_ID = '-1003961907645'

// So'nggi xatolar — bir xil xato spam qilmasin (60 soniya ichida bir marta)
const recentErrors = new Map<string, number>()
const DEDUP_MS = 60_000

function dedupKey(msg: string): string {
  return msg.slice(0, 120)
}

function sendToTelegram(text: string): void {
  const body = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' })
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

function now(): string {
  return new Date().toLocaleString('uz-UZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Tashkent'
  })
}

function branchInfo(): string {
  try {
    const s = getSettings()
    return s.organizationName ? `<b>${s.organizationName}</b>` : `Branch: ${s.branchId ?? 'noma\'lum'}`
  } catch {
    return 'POS'
  }
}

export function tgError(context: string, message: string): void {
  const key = dedupKey(`${context}:${message}`)
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < DEDUP_MS) return
  recentErrors.set(key, Date.now())

  const text =
    `🔴 <b>XATO</b> — ${branchInfo()}\n` +
    `📍 <b>Joy:</b> ${context}\n` +
    `❌ <b>Xato:</b> <code>${escHtml(message)}</code>\n` +
    `🕐 ${now()}`

  sendToTelegram(text)
}

export function tgWarn(context: string, message: string): void {
  const key = dedupKey(`warn:${context}:${message}`)
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < DEDUP_MS) return
  recentErrors.set(key, Date.now())

  const text =
    `🟡 <b>OGOHLANTIRISH</b> — ${branchInfo()}\n` +
    `📍 <b>Joy:</b> ${context}\n` +
    `⚠️ <b>Xabar:</b> <code>${escHtml(message)}</code>\n` +
    `🕐 ${now()}`

  sendToTelegram(text)
}

export function tgOrderSync(orderId: number | string, status: 'synced' | 'failed', detail?: string): void {
  if (status === 'failed') {
    tgError(`Buyurtma sinxron #${orderId}`, detail ?? 'noma\'lum xato')
    return
  }
  // Muvaffaqiyatli sync — loglamaymiz (spam bo'ladi)
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
    `🕐 ${now()}`

  sendToTelegram(text)
}

export function tgConnectStatus(online: boolean, branchId?: string | null): void {
  const key = `connect:${online}`
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < 5 * 60_000) return  // 5 daqiqada bir marta
  recentErrors.set(key, Date.now())

  const text = online
    ? `🟢 <b>ULANISH TIKLANDI</b> — ${branchInfo()}\n🕐 ${now()}`
    : `🔴 <b>INTERNET UZILDI</b> — ${branchInfo()}\n🕐 ${now()}`

  sendToTelegram(text)
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
