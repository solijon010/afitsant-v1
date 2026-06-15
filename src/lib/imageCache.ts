/**
 * Mahsulot rasmlarini bir marta yuklab, blob URL sifatida xotirada saqlaydi.
 * Keyingi so'rovlarda serverga murojaat qilmasdan xotiradan qaytaradi.
 */

const promises = new Map<string, Promise<string>>()
const resolved = new Map<string, string>()

function fullUrl(photo: string): string {
  return `${import.meta.env.VITE_API_URL ?? ''}/image/${photo}`
}

/** Bitta rasmni background da yuklab cache ga saqlaydi */
export function preloadImage(photo: string): void {
  const url = fullUrl(photo)
  if (promises.has(url)) return

  const p = fetch(url)
    .then((r) => r.blob())
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob)
      resolved.set(url, blobUrl)
      return blobUrl
    })
    .catch(() => {
      // Yuklanmasa original URL ni fallback sifatida qo'yamiz
      resolved.set(url, url)
      return url
    })

  promises.set(url, p)
}

/** Ko'p rasmlarni background da yuklab cache ga saqlaydi */
export function preloadImages(photos: Array<string | null | undefined>): void {
  for (const photo of photos) {
    if (photo) preloadImage(photo)
  }
}

/**
 * Agar rasm cache da bo'lsa — darhol blob URL qaytaradi.
 * Bo'lmasa — original URL qaytaradi (loading davomida).
 */
export function getResolvedUrl(photo: string): string {
  const url = fullUrl(photo)
  return resolved.get(url) ?? url
}

/** Cache da bo'lsa darhol, bo'lmasa yuklab blob URL qaytaradigan Promise */
export async function getCachedImageUrl(photo: string): Promise<string> {
  const url = fullUrl(photo)
  if (!promises.has(url)) preloadImage(photo)
  return promises.get(url)!
}

/** Cache ni tozalash (logout yoki sync da) */
export function clearImageCache(): void {
  for (const blobUrl of resolved.values()) {
    if (blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(blobUrl)
    }
  }
  promises.clear()
  resolved.clear()
}
