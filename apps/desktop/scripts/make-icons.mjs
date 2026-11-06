// One-off: draws logo C ("the t") into the app and tray icons.
// Run: node_modules/electron/dist/electron.exe apps/desktop/scripts/make-icons.mjs
import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '../resources')
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
async function render(svg) {
  if (!win) {
    win = new BrowserWindow({ show: false, width: 512, height: 512, frame: false, transparent: true, webPreferences: { offscreen: true } })
    win.webContents.on('paint', (_e, _dirty, img) => { frame = img })
    await win.loadURL('data:text/html,<body style="margin:0;background:transparent;overflow:hidden"></body>')
  }
  const html = svg.replace('<svg ', '<svg style="display:block;width:512px;height:512px" ')
  await win.webContents.executeJavaScript(`document.body.innerHTML = ${JSON.stringify(html)}`)
  frame = null
  while (!frame) await new Promise((r) => setTimeout(r, 50))
  await new Promise((r) => setTimeout(r, 200))
  return frame
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
  win.destroy()
  app.quit()
})
