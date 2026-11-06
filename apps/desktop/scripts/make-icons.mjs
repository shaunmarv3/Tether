// One-off: draws logo C ("the t") into the app and tray icons, and the installer / uninstaller wizard art.
// Run: node_modules/electron/dist/electron.exe apps/desktop/scripts/make-icons.mjs
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '../resources')
const TILE = '#24100A', PEACH = '#FFB27A', CREAM = '#F6E9DA', MUTED = '#8A7A6E'

// The mark in a 64×64 box. Thick = the small-size cut from AP-Logo (stroke 11, dot r 7).
const mark = (stem, bar, dot, thick) => {
  const w = thick ? 11 : 10, r = thick ? 7 : 6
  return `<path d="M24 6V40Q24 56 40 56H45" fill="none" stroke="${stem}" stroke-width="${w}" stroke-linecap="round"/>`
    + `<path d="M12 22H40" stroke="${bar}" stroke-width="${w}" stroke-linecap="round"/>`
    + `<circle cx="53" cy="56" r="${r}" fill="${dot}"/>`
}
// App icon: the mark on an oxblood rounded tile (radius 22 %), centred (mark spans x 7–59, y 1–62).
const appSvg = (thick) => {
  const s = thick ? 0.74 : 0.62, k = (256 * s) / 64
  const tx = 128 - 33 * k, ty = 128 - 31.5 * k
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">`
    + `<rect width="256" height="256" rx="56" fill="${TILE}"/>`
    + `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${k.toFixed(3)})">${mark(PEACH, CREAM, CREAM, thick)}</g></svg>`
}
const traySvg = (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${mark(c, c, c, true)}</svg>`

// One offscreen window; each mark is swapped into the page and taken from the next 'paint'
// (capturePage fails offscreen, and a second window fails to load on this PC).
let win, frame = null
async function render(svg, w = 512, h = 512) {
  if (!win) {
    win = new BrowserWindow({ show: false, width: 512, height: 512, frame: false, transparent: true, webPreferences: { offscreen: true } })
    win.webContents.on('paint', (_e, _dirty, img) => { frame = img })
    await win.loadURL('data:text/html,<body style="margin:0;background:transparent;overflow:hidden"></body>')
  }
  const html = svg.startsWith('<svg') ? svg.replace('<svg ', '<svg style="display:block;width:512px;height:512px" ') : svg
  await win.webContents.executeJavaScript(`document.body.innerHTML = ${JSON.stringify(html)}; document.fonts.ready.then(() => 1)`)
  frame = null
  win.webContents.invalidate() // fonts may have loaded after the last paint: ask for a fresh frame
  await new Promise((r) => setTimeout(r, 300))
  while (!frame || frame.isEmpty()) await new Promise((r) => setTimeout(r, 50)) // the first frame after load can be blank
  if (w === 512 && h === 512) return frame
  const k = frame.getSize().width / 512 // the frame may come at the display scale
  return frame.crop({ x: 0, y: 0, width: Math.round(w * k), height: Math.round(h * k) }).resize({ width: w, height: h, quality: 'best' })
}

// Wizard art (NSIS wants 24-bit BMPs): the side panel of the welcome/finish pages (164×314) and the header mark (150×57).
const font = (file, family, weight) => {
  const data = readFileSync(join(here, '../../../node_modules', file)).toString('base64')
  return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${data}) format('woff2')}`
}
const FONTS = font('@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2', 'Bricolage', '200 800')
  + font('@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2', 'DM Mono', 400)
const markSvg = (size, stem, bar, dot) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 64 64">${mark(stem, bar, dot, false)}</svg>`
const sidebar = (line) => `<style>${FONTS}</style>
<div style="width:164px;height:314px;box-sizing:border-box;padding:30px 20px 22px;display:flex;flex-direction:column;
  background-color:#24100A;background-image:radial-gradient(circle at 85% 12%,rgba(255,178,122,0.28),transparent 55%),
  radial-gradient(rgba(246,233,218,0.07) 1px,transparent 1.4px);background-size:100% 100%,10px 10px;color:#F6E9DA">
  ${markSvg(56, PEACH, CREAM, CREAM)}
  <div style="margin-top:14px;font-family:Bricolage;font-weight:600;font-size:32px;letter-spacing:-0.04em;line-height:1">Tether</div>
  <div style="margin-top:auto;font-family:'DM Mono';font-size:10px;line-height:1.45;color:#CDB4A0">${line}</div>
</div>`
const header = `<div style="width:150px;height:57px;display:flex;align-items:center;justify-content:flex-end;padding-right:10px;
  box-sizing:border-box;background:#F6E9DA">${markSvg(38, '#24100A', '#24100A', '#C2602F')}</div>`

function bmp(img) { // 24-bit, bottom-up rows padded to 4 bytes; nativeImage bitmaps are BGRA on Windows
  const { width: w, height: h } = img.getSize()
  const px = img.toBitmap(), row = Math.ceil((w * 3) / 4) * 4
  const buf = Buffer.alloc(54 + row * h)
  buf.write('BM', 0); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(w, 18); buf.writeInt32LE(h, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(row * h, 34)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, o = 54 + (h - 1 - y) * row + x * 3
      buf[o] = px[i]; buf[o + 1] = px[i + 1]; buf[o + 2] = px[i + 2]
    }
  }
  return buf
}
const at = (img, size) => img.resize({ width: size, height: size, quality: 'best' }).toPNG()

function ico(pngs) { // ICONDIR + one ICONDIRENTRY per size + the PNG blobs
  const head = Buffer.alloc(6 + 16 * pngs.length)
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4)
  let offset = head.length
  pngs.forEach(([size, png], i) => {
    const e = 6 + 16 * i
    head[e] = size >= 256 ? 0 : size; head[e + 1] = size >= 256 ? 0 : size
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([head, ...pngs.map(([, png]) => png)])
}

app.whenReady().then(async () => {
  const big = await render(appSvg(false))
  const small = await render(appSvg(true))
  const write = (name, buf) => { writeFileSync(join(out, name), buf); console.log(name, buf.length, 'bytes') }
  write('icon.svg', Buffer.from(appSvg(false) + '\n'))
  write('icon.png', at(big, 256))
  write('icon.ico', ico([16, 24, 32, 48, 64, 128, 256].map((s) => [s, at(s <= 32 ? small : big, s)])))
  write('tray-on.png', at(await render(traySvg(CREAM)), 32))
  write('tray-off.png', at(await render(traySvg(MUTED)), 32))
  write('installerSidebar.bmp', bmp(await render(sidebar('Your Android phone,<br>on this PC.'), 164, 314)))
  write('uninstallerSidebar.bmp', bmp(await render(sidebar('Your phone stays<br>as it is.'), 164, 314)))
  write('installerHeader.bmp', bmp(await render(header, 150, 57)))
  win.destroy()
  app.quit()
})
