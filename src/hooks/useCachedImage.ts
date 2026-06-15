import { useEffect, useState } from 'react'
import { getCachedImageUrl, getResolvedUrl } from '@/lib/imageCache'

/**
 * Mahsulot rasmini cache dan qaytaradi.
 * Agar cache da bo'lsa — darhol blob URL.
 * Bo'lmasa — yuklab, so'ng blob URL bilan yangilanadi.
 */
export function useCachedImage(photo: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(() => {
    if (!photo) return null
    return getResolvedUrl(photo) // Darhol cache dan (yoki original URL)
  })

  useEffect(() => {
    if (!photo) {
      setSrc(null)
      return
    }
    let mounted = true
    // Cache da bo'lsa darhol qaytadi, bo'lmasa fetch qiladi
    void getCachedImageUrl(photo).then((url) => {
      if (mounted) setSrc(url)
    })
    return () => {
      mounted = false
    }
  }, [photo])

  return src
}
