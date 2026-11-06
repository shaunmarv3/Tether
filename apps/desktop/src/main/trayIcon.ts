// Tray icon = logo C in one flat colour (rule 5): cream = phone connected, muted = no phone.
// Pre-rendered 32×32 PNGs (scripts/make-icons.mjs), drawn for scale factor 2.
import { app, nativeImage, type NativeImage } from 'electron'
import { join } from 'node:path'

const file = (name: string) => app.isPackaged ? join(process.resourcesPath, name) : join(__dirname, '../../resources', name)

export function trayIcon(lit: boolean): NativeImage {
  const img = nativeImage.createFromPath(file(lit ? 'tray-on.png' : 'tray-off.png'))
  return nativeImage.createFromBitmap(img.toBitmap(), { width: 32, height: 32, scaleFactor: 2 })
}
