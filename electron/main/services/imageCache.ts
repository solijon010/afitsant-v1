import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

function getCacheDir(): string {
  const dir = join(app.getPath('userData'), 'image-cache')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function photoToFilename(photo: string): string {
  return photo.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 200)
}

export function getImageFromDisk(photo: string): string | null {
  try {
    const filePath = join(getCacheDir(), photoToFilename(photo))
    if (!existsSync(filePath)) return null
    return readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

export function saveImageToDisk(photo: string, dataUrl: string): void {
  try {
    writeFileSync(join(getCacheDir(), photoToFilename(photo)), dataUrl, 'utf8')
  } catch (e) {
    console.warn('[IMG_CACHE] save failed:', (e as Error)?.message)
  }
}

export function clearDiskImageCache(): void {
  try {
    const dir = join(app.getPath('userData'), 'image-cache')
    if (!existsSync(dir)) return
    for (const file of readdirSync(dir)) {
      rmSync(join(dir, file), { force: true })
    }
  } catch (e) {
    console.warn('[IMG_CACHE] clear failed:', (e as Error)?.message)
  }
}
