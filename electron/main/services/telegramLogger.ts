import https from 'node:https'
import { getSettings } from './settings'

const BOT_TOKEN = '8961588864:AAH1szI4i3OVfGM1XJH845hMJpN3LxZmqxM'
const CHAT_ID = '-1003961907645'

const recentErrors = new Map<string, number>()
const DEDUP_MS = 60_000

function dedupKey(msg: string): string {
  return msg.slice(0, 120)
}

function sendToTelegram(text: string): void {
  const safe = text.length > 4000 ? text.slice(0, 3950) + '\n\n…(matn qisqartirildi)' : text
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

function branchLine(): string {
  try {
    const s = getSettings()
    const name = s.organizationName ? escHtml(s.organizationName) : null
    const bid = s.branchId ? `<code>${s.branchId}</code>` : null
    return [name, bid].filter(Boolean).join(' · ') || 'POS'
  } catch {
    return 'POS'
  }
}

function parseAxiosError(err: any): { status: string; endpoint: string; body: string; message: string } {
  const status = err?.response?.status ? `HTTP ${err.response.status}` : (err?.code ?? 'NETWORK_ERROR')
  const method = (err?.config?.method ?? '').toUpperCase()
  const url = err?.config?.url ?? err?.request?.path ?? ''
  const endpoint = method && url ? `${method} ${url}` : ''
  const data = err?.response?.data
  let body = ''
  if (data) {
    body = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  }
  const message = err?.message ?? 'Noma\'lum xato'
  return { status, endpoint, body, message }
}

export function tgError(context: string, errOrMsg: any): void {
  const raw = typeof errOrMsg === 'string' ? errOrMsg : null
  const parsed = raw ? null : parseAxiosError(errOrMsg)

  const key = dedupKey(`err:${context}:${raw ?? parsed?.status ?? ''}:${raw ?? parsed?.body ?? ''}`)
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < DEDUP_MS) return
  recentErrors.set(key, Date.now())

  const lines: string[] = []
  lines.push(`❌ <b>Xatolik Ogohlantirishi</b> ❌`)
  lines.push(``)
  lines.push(`🏪 <b>Filial:</b> ${branchLine()}`)
  lines.push(`📍 <b>Joy:</b> ${escHtml(context)}`)
  lines.push(``)

  if (raw) {
    lines.push(`✍️ <b>Xabar:</b> ${escHtml(raw)}`)
  } else if (parsed) {
    lines.push(`✍️ <b>Xabar:</b> ${escHtml(parsed.message)}`)
    if (parsed.status) lines.push(`🔢 <b>Status:</b> ${escHtml(parsed.status)}`)
    if (parsed.endpoint) lines.push(`🌐 <b>Endpoint:</b> <code>${escHtml(parsed.endpoint)}</code>`)
    if (parsed.body) {
      lines.push(`🔖 <b>Server javobi:</b>`)
      lines.push(`<pre>${escHtml(parsed.body.slice(0, 800))}</pre>`)
    }
  }

  lines.push(``)
  lines.push(`🕐 <b>Vaqt:</b> ${nowStr()}`)

  sendToTelegram(lines.join('\n'))
}

export function tgWarn(context: string, errOrMsg: any): void {
  const raw = typeof errOrMsg === 'string' ? errOrMsg : null
  const parsed = raw ? null : parseAxiosError(errOrMsg)

  const key = dedupKey(`warn:${context}:${raw ?? parsed?.status ?? ''}:${raw ?? parsed?.body ?? ''}`)
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < DEDUP_MS) return
  recentErrors.set(key, Date.now())

  const lines: string[] = []
  lines.push(`⚠️ <b>Ogohlantirish</b> ⚠️`)
  lines.push(``)
  lines.push(`🏪 <b>Filial:</b> ${branchLine()}`)
  lines.push(`📍 <b>Joy:</b> ${escHtml(context)}`)
  lines.push(``)

  if (raw) {
    lines.push(`✍️ <b>Xabar:</b> ${escHtml(raw)}`)
  } else if (parsed) {
    lines.push(`✍️ <b>Xabar:</b> ${escHtml(parsed.message)}`)
    if (parsed.status) lines.push(`🔢 <b>Status:</b> ${escHtml(parsed.status)}`)
    if (parsed.endpoint) lines.push(`🌐 <b>Endpoint:</b> <code>${escHtml(parsed.endpoint)}</code>`)
    if (parsed.body) {
      lines.push(`🔖 <b>Server javobi:</b>`)
      lines.push(`<pre>${escHtml(parsed.body.slice(0, 800))}</pre>`)
    }
  }

  lines.push(``)
  lines.push(`🕐 <b>Vaqt:</b> ${nowStr()}`)

  sendToTelegram(lines.join('\n'))
}

export function tgOfflineClose(tableId: number, total: number): void {
  const key = dedupKey(`offline:${tableId}:${total}`)
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < DEDUP_MS) return
  recentErrors.set(key, Date.now())

  const lines: string[] = []
  lines.push(`📴 <b>Oflayn Yopish</b> 📴`)
  lines.push(``)
  lines.push(`🏪 <b>Filial:</b> ${branchLine()}`)
  lines.push(`🪑 <b>Stol ID:</b> ${tableId}`)
  lines.push(`💰 <b>Summa:</b> ${String(Math.round(total)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`)
  lines.push(``)
  lines.push(`ℹ️ Internet tiklanganda serverga yuboriladi`)
  lines.push(`🕐 <b>Vaqt:</b> ${nowStr()}`)

  sendToTelegram(lines.join('\n'))
}

export function tgConnectStatus(online: boolean): void {
  const key = `connect:${online}`
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < 5 * 60_000) return
  recentErrors.set(key, Date.now())

  if (online) {
    const lines = [
      `🟢 <b>Ulanish Tiklandi</b> 🟢`,
      ``,
      `🏪 <b>Filial:</b> ${branchLine()}`,
      `🕐 <b>Vaqt:</b> ${nowStr()}`
    ]
    sendToTelegram(lines.join('\n'))
  } else {
    const lines = [
      `🔴 <b>Internet Uzildi</b> 🔴`,
      ``,
      `🏪 <b>Filial:</b> ${branchLine()}`,
      `⚠️ Oflayn rejimda ishlashda davom etilmoqda`,
      `🕐 <b>Vaqt:</b> ${nowStr()}`
    ]
    sendToTelegram(lines.join('\n'))
  }
}

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
