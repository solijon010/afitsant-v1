const promises = new Map<string, Promise<string>>()
const resolved = new Map<string, string>()

function fullUrl(photo: string): string {
  return `${import.meta.env.VITE_API_URL ?? ''}/image/${photo}`
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function fetchOrLoad(photo: string): Promise<string> {
  if (resolved.has(photo)) return resolved.get(photo)!

  // 1. Disk cache (internet yo'q bo'lsa ham ishlaydi)
  try {
    const diskUrl = await window.afisant.imageCache.get(photo)
    if (diskUrl) {
      resolved.set(photo, diskUrl)
      return diskUrl
    }
  } catch {}

  // 2. Network fetch
  try {
    const r = await fetch(fullUrl(photo))
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const blob = await r.blob()
    const blobUrl = URL.createObjectURL(blob)
    resolved.set(photo, blobUrl)

    // Diskka saqlash (fon rejimida)
    blobToDataUrl(blob)
      .then((dataUrl) => window.afisant.imageCache.set(photo, dataUrl))
      .catch(() => {})

    return blobUrl
  } catch {
    // Fallback — original URL (yuklanmasa ham ko'rinadi xato sifatida)
    resolved.set(photo, fullUrl(photo))
    return fullUrl(photo)
  }
}

export function preloadImage(photo: string): void {
  if (promises.has(photo)) return
  promises.set(photo, fetchOrLoad(photo))
}

export function preloadImages(photos: Array<string | null | undefined>): void {
  for (const photo of photos) {
    if (photo) preloadImage(photo)
  }
}

export function getResolvedUrl(photo: string): string {
  return resolved.get(photo) ?? fullUrl(photo)
}

export async function getCachedImageUrl(photo: string): Promise<string> {
  if (!promises.has(photo)) preloadImage(photo)
  return promises.get(photo)!
}

export function clearImageCache(): void {
  for (const blobUrl of resolved.values()) {
    if (blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl)
  }
  promises.clear()
  resolved.clear()
  try {
    void window.afisant?.imageCache?.clear()
  } catch {}
}
