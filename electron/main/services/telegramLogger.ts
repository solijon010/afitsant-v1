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
  const safe = text.length > 4096 ? text.slice(0, 4000) + '\n\n…<i>(matn qisqartirildi)</i>' : text
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
        // Read response to avoid memory leak
        res.resume()
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
    const bid = s.branchId ? `<code>${escHtml(s.branchId)}</code>` : null
    return [name, bid].filter(Boolean).join(' · ') || 'POS'
  } catch {
    return 'POS'
  }
}

function fmt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

interface ParsedErr {
  message: string
  code: string
  httpStatus: string
  httpMethod: string
  httpUrl: string
  requestBody: string
  responseBody: string
  stack: string
}

function parseErr(err: any): ParsedErr {
  const isAxios = !!(err?.config || err?.response)
  const message = err?.message ?? 'Noma\'lum xato'
  const code = err?.code ?? (err?.response?.status ? '' : 'UNKNOWN')
  const httpStatus = err?.response?.status ? `${err.response.status}` : ''
  const httpMethod = isAxios ? (err?.config?.method ?? '').toUpperCase() : ''
  const httpUrl = isAxios ? (err?.config?.url ?? err?.request?.path ?? '') : ''

  // Request body (what was sent to server)
  let requestBody = ''
  if (isAxios && err?.config?.data) {
    try {
      const d = typeof err.config.data === 'string' ? JSON.parse(err.config.data) : err.config.data
      requestBody = JSON.stringify(d, null, 2)
    } catch {
      requestBody = String(err.config.data)
    }
  }

  // Response body (server's answer)
  let responseBody = ''
  if (err?.response?.data) {
    const d = err.response.data
    responseBody = typeof d === 'string' ? d : JSON.stringify(d, null, 2)
  }

  // Stack trace (skip first line = error message repeated)
  const rawStack = err?.stack ?? ''
  const stackLines = rawStack.split('\n').filter((l: string) => l.trim().startsWith('at '))
  const stack = stackLines.slice(0, 12).join('\n')

  return { message, code, httpStatus, httpMethod, httpUrl, requestBody, responseBody, stack }
}

function buildMsg(icon: string, label: string, context: string, err: any, extra?: Record<string, string>): string {
  const isRaw = typeof err === 'string'
  const p = isRaw ? null : parseErr(err)

  const sep = '─'.repeat(30)
  const lines: string[] = []

  lines.push(`${icon} <b>${escHtml(label)}</b> ${icon}`)
  lines.push(``)
  lines.push(`🏪 <b>Filial:</b> ${branchLine()}`)
  lines.push(`📍 <b>Amal:</b> <code>${escHtml(context)}</code>`)

  // Extra context (order id, table, items, etc.)
  if (extra && Object.keys(extra).length > 0) {
    lines.push(``)
    for (const [k, v] of Object.entries(extra)) {
      lines.push(`   ${escHtml(k)}: <code>${escHtml(v)}</code>`)
    }
  }

  lines.push(``)
  lines.push(`${sep}`)

  if (isRaw) {
    lines.push(`✍️ <b>Xato xabari:</b>`)
    lines.push(`<pre>${escHtml(String(err))}</pre>`)
  } else if (p) {
    lines.push(`✍️ <b>Xato xabari:</b> ${escHtml(p.message)}`)
    if (p.code) lines.push(`🔑 <b>Xato kodi:</b> <code>${escHtml(p.code)}</code>`)

    if (p.httpStatus || p.httpUrl) {
      lines.push(``)
      lines.push(`🌐 <b>So'rov:</b> <code>${escHtml(p.httpMethod)} ${escHtml(p.httpUrl)}</code>`)
      if (p.httpStatus) lines.push(`🔢 <b>HTTP Status:</b> <code>${escHtml(p.httpStatus)}</code>`)
    }

    if (p.requestBody) {
      lines.push(``)
      lines.push(`📤 <b>Yuborilgan ma'lumot (Request Body):</b>`)
      lines.push(`<pre>${escHtml(p.requestBody.slice(0, 800))}</pre>`)
    }

    if (p.responseBody) {
      lines.push(``)
      lines.push(`📥 <b>Server javobi (Response Body):</b>`)
      lines.push(`<pre>${escHtml(p.responseBody.slice(0, 800))}</pre>`)
    }

    if (p.stack) {
      lines.push(``)
      lines.push(`📋 <b>Stack Trace:</b>`)
      lines.push(`<pre>${escHtml(p.stack.slice(0, 900))}</pre>`)
    }
  }

  lines.push(``)
  lines.push(`${sep}`)
  lines.push(`🕐 <b>Vaqt:</b> ${nowStr()}`)

  return lines.join('\n')
}

export function tgError(context: string, errOrMsg: any, extra?: Record<string, string>): void {
  const isRaw = typeof errOrMsg === 'string'
  const p = isRaw ? null : parseErr(errOrMsg)
  const key = dedupKey(`err:${context}:${isRaw ? errOrMsg : (p?.httpStatus ?? p?.code ?? '')}:${p?.responseBody ?? ''}`)
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < DEDUP_MS) return
  recentErrors.set(key, Date.now())
  sendToTelegram(buildMsg('❌', 'Xatolik Ogohlantirishi', context, errOrMsg, extra))
}

export function tgWarn(context: string, errOrMsg: any, extra?: Record<string, string>): void {
  const isRaw = typeof errOrMsg === 'string'
  const p = isRaw ? null : parseErr(errOrMsg)
  const key = dedupKey(`warn:${context}:${isRaw ? errOrMsg : (p?.httpStatus ?? p?.code ?? '')}:${p?.responseBody ?? ''}`)
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < DEDUP_MS) return
  recentErrors.set(key, Date.now())
  sendToTelegram(buildMsg('⚠️', 'Ogohlantirish', context, errOrMsg, extra))
}

export function tgOfflineClose(tableId: number, tableName: string, total: number, itemCount: number): void {
  const key = dedupKey(`offline:${tableId}:${total}`)
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < DEDUP_MS) return
  recentErrors.set(key, Date.now())

  const sep = '─'.repeat(30)
  const lines: string[] = []
  lines.push(`📴 <b>Oflayn Yopish</b> 📴`)
  lines.push(``)
  lines.push(`🏪 <b>Filial:</b> ${branchLine()}`)
  lines.push(`${sep}`)
  lines.push(`🪑 <b>Stol:</b> <code>${escHtml(tableName)}</code> (ID: ${tableId})`)
  lines.push(`🛒 <b>Mahsulotlar:</b> ${itemCount} ta`)
  lines.push(`💰 <b>Jami summa:</b> <b>${fmt(total)} so'm</b>`)
  lines.push(`${sep}`)
  lines.push(`ℹ️ Internet tiklangach serverga avtomatik yuboriladi`)
  lines.push(`🕐 <b>Vaqt:</b> ${nowStr()}`)

  sendToTelegram(lines.join('\n'))
}

export function tgConnectStatus(online: boolean): void {
  const key = `connect:${online}`
  const last = recentErrors.get(key) ?? 0
  if (Date.now() - last < 5 * 60_000) return
  recentErrors.set(key, Date.now())

  const sep = '─'.repeat(30)
  if (online) {
    const lines = [
      `🟢 <b>Internet Ulandi</b> 🟢`,
      ``,
      `🏪 <b>Filial:</b> ${branchLine()}`,
      `${sep}`,
      `✅ Barcha pending buyurtmalar sinxronlanadi`,
      `🕐 <b>Vaqt:</b> ${nowStr()}`
    ]
    sendToTelegram(lines.join('\n'))
  } else {
    const lines = [
      `🔴 <b>Internet Uzildi</b> 🔴`,
      ``,
      `🏪 <b>Filial:</b> ${branchLine()}`,
      `${sep}`,
      `⚠️ Oflayn rejimda ishlashda davom etilmoqda`,
      `💾 Barcha buyurtmalar qurilmada saqlanadi`,
      `🕐 <b>Vaqt:</b> ${nowStr()}`
    ]
    sendToTelegram(lines.join('\n'))
  }
}

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
