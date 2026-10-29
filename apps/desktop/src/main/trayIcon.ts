// Tray dot drawn in code: lit chartreuse = phone connected (rule 5), muted = no phone.
import { nativeImage, type NativeImage } from 'electron'

export function trayIcon(lit: boolean): NativeImage {
  const size = 32 // drawn at 2x for sharp edges on scaled displays
  const [r, g, b] = lit ? [0xd4, 0xff, 0x3a] : [0xa2, 0x9d, 0x93]
  const buf = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const alpha = Math.max(0, Math.min(1, 11.5 - Math.hypot(x - c, y - c))) // radius 11, soft edge
      const i = (y * size + x) * 4
      buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = Math.round(alpha * 255) // BGRA
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 })
}
