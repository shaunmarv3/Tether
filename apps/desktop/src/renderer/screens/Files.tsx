import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'
import type { RemoteEntry } from '@tether/core'
import type { AppState, Place } from '../../shared/api'
import { tether } from '../tether'

export const ROOT = '/sdcard/'
const TYPE_COLORS: Record<string, string> = { JPG: '#8FE3D0', JPEG: '#8FE3D0', MP4: '#C7B8FF', PNG: '#FFE07A' }
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export const errText = (err: unknown) => String((err as Error)?.message ?? err).replace(/^.*Error: /, '').toUpperCase()
const join = (dir: string, name: string) => `${dir.replace(/\/$/, '')}/${name}`
const same = (a: string, b: string) => a.replace(/\/$/, '') === b.replace(/\/$/, '')

// Path bar pieces. '/sdcard/' is Android's name for the phone's own storage, so it shows as PHONE;
// a removable card ('/storage/6137-3639/') shows as SD CARD.
export function crumbs(dir: string): { label: string; path: string }[] {
  const sd = /^\/storage\/[0-9A-F]{4}-[0-9A-F]{4}\//.exec(dir)
  const root = sd ? sd[0] : ROOT
  const rest = dir.slice(root.length).split('/').filter(Boolean)
  return [{ label: sd ? 'SD CARD' : 'PHONE', path: root },
    ...rest.map((p, i) => ({ label: p.toUpperCase(), path: `${root}${rest.slice(0, i + 1).join('/')}/` }))]
}
export const friendlyPath = (dir: string) => crumbs(dir).map((c) => c.label).join(' / ')

export function fmtSize(n: number): string {
  if (n < 1000) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1000
  let u = 0
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++ }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[u]}`
}

// '2026-10-26T18:42' → '26 OCT 18:42' (phone time, as ls shows it)
const fmtDate = (m: string) => `${Number(m.slice(8, 10))} ${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(11, 16)}`

function typeOf(e: RemoteEntry): string {
  if (e.dir) return 'DIR'
  const dot = e.name.lastIndexOf('.')
  return dot > 0 ? e.name.slice(dot + 1, dot + 5).toUpperCase() : '—'
}

export function Files({ state, dir, setDir }: { state: AppState; dir: string; setDir: (d: string) => void }) {
  const [places, setPlaces] = useState<Place[]>([])
  const [entries, setEntries] = useState<RemoteEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [folderName, setFolderName] = useState<string | null>(null)
  const ready = state.device?.state === 'device'
  const { status, fileOp } = state
  const wasBusy = useRef(fileOp.busy)
  const crumb = useRef<HTMLDivElement>(null)
  const parts = crumbs(dir)

  const load = () => {
    setError(null)
    tether.listDir(dir).then(
      (list) => {
        // Folders A–Z, then files newest first (as in the mockup); dot-files stay hidden.
        const shown = list.filter((e) => !e.name.startsWith('.'))
        setEntries([...shown.filter((e) => e.dir), ...shown.filter((e) => !e.dir).sort((a, b) => b.mtime.localeCompare(a.mtime))])
        setSelected([])
      },
      (err) => { setEntries([]); setError(errText(err)) },
    )
  }

  useEffect(() => { if (ready) void tether.countPlaces().then(setPlaces, () => setPlaces([])) }, [ready])
  useEffect(() => { setConfirmDelete(false); if (ready) load() }, [dir, ready])
  // A long path shows its end: the folder you are in.
  useEffect(() => { if (crumb.current) crumb.current.scrollLeft = crumb.current.scrollWidth }, [dir, ready])
  // A send / delete / new folder just finished: show the folder as it is now.
  useEffect(() => {
    if (wasBusy.current && !fileOp.busy && ready) load()
    wasBusy.current = fileOp.busy
  }, [fileOp.busy])

  const picked = (entries ?? []).filter((e) => selected.includes(e.name))
  const pickedSize = picked.reduce((n, e) => n + (e.dir ? 0 : e.size), 0)
  const onlyFiles = picked.every((e) => !e.dir)
  const open = (e: RemoteEntry) => (e.dir ? setDir(join(dir, e.name) + '/') : void tether.previewFile(join(dir, e.name)))
  const toggle = (name: string) => setSelected((s) => (s.includes(name) ? s.filter((n) => n !== name) : [...s, name]))
  const used = status?.storageUsedGb
  const total = status?.storageTotalGb
  const usedPct = used != null && total ? Math.round((used / total) * 100) : null

  function makeFolder(e: FormEvent) {
    e.preventDefault()
    const name = folderName?.trim()
    if (!name || /[/\\]/.test(name) || name === '.' || name === '..') return
    setFolderName(null)
    void tether.newFolder(join(dir, name))
  }

  return (
    <main className="main">
      <header className="row between wrap end">
        <div className="col">
          <span className="mono small muted">{used != null && total != null ? `${used} OF ${total} GB USED` : 'PHONE STORAGE'}</span>
          <h1 className="headline">Phone storage, <span className="accent-text">on your desk.</span></h1>
        </div>
        <div className="row wrap">
          {folderName === null ? (
            <button className="key tall" disabled={!ready} onClick={() => setFolderName('')}>NEW FOLDER</button>
          ) : (
            <form className="row" onSubmit={makeFolder}>
              <input className="field name-field folder-field" autoFocus maxLength={120} placeholder="Folder name" aria-label="Folder name"
                value={folderName} onChange={(e) => setFolderName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setFolderName(null) }} />
              <button className="key tall" type="submit">MAKE</button>
              <button className="key tall" type="button" onClick={() => setFolderName(null)}>CANCEL</button>
            </form>
          )}
          <button className="key accent tall" disabled={!ready || fileOp.busy} onClick={() => void tether.pickAndSend(dir)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
            SEND TO PHONE
          </button>
        </div>
      </header>

      {!ready ? (
        <section className="lcd status"><div className="lcd-title">NO PHONE · PLUG IN A USB CABLE</div></section>
      ) : (
        <div className="files-layout">
          <div className="files-side">
            <nav className="places" aria-label="Places">
              {places.map((p) => (
                <button key={p.dir} className={`place ${same(dir, p.dir) ? 'current' : ''}`} aria-current={same(dir, p.dir) ? 'page' : undefined}
                  onClick={() => setDir(p.dir)}>
                  {p.name}<span className="mono tiny muted">{p.count?.toLocaleString('en-US')}</span>
                </button>
              ))}
              <button className={`place ${dir === ROOT ? 'current' : ''}`} onClick={() => setDir(ROOT)}>Phone storage</button>
            </nav>
            {usedPct !== null && (
              <div className="lcd store">
                <div className="row between tiny"><span>STORE</span><span>{usedPct}%</span></div>
                <div className="store-bars">
                  {Array.from({ length: 10 }, (_, i) => <span key={i} className={i < Math.round(usedPct / 10) ? 'on' : ''} />)}
                </div>
                <span className="dim tiny">{total! - used!} GB FREE</span>
              </div>
            )}
          </div>

          <section className="files-card" aria-label={`Files in ${dir}`}>
            <div className="files-bar">
              <button className="up-key" aria-label="Up one folder" disabled={parts.length === 1} onClick={() => setDir(parts[parts.length - 2].path)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <nav className="crumb" ref={crumb} aria-label="Folder path">
                {parts.map((p, i) => (
                  <Fragment key={p.path}>
                    {i > 0 && <span className="crumb-sep">/</span>}
                    <button className="crumb-part" disabled={i === parts.length - 1} onClick={() => setDir(p.path)}>{p.label}</button>
                  </Fragment>
                ))}
              </nav>
            </div>
            <div className="files-scroll">
              <div className="files-table">
                <div className="file-row head mono"><span /><span>TYPE</span><span>NAME</span><span>SIZE</span><span>DATE</span></div>
                {entries === null && <div className="files-empty mono small muted">READING…</div>}
                {error && <div className="files-empty mono small danger-text">{error}</div>}
                {entries?.length === 0 && !error && <div className="files-empty mono small muted">EMPTY FOLDER</div>}
                {entries?.map((e) => {
                  const type = typeOf(e)
                  const on = selected.includes(e.name)
                  return (
                    <label key={e.name} className={`file-row ${on ? 'on' : ''}`} onDoubleClick={() => open(e)}>
                      <input type="checkbox" checked={on} onChange={() => toggle(e.name)} />
                      <span className="type-chip mono" style={{ color: TYPE_COLORS[type] ?? (e.dir ? 'var(--accent)' : 'var(--muted)') }}>{type}</span>
                      <span className="file-name">{e.name}</span>
                      <span className="mono small file-meta">{e.dir ? '—' : fmtSize(e.size)}</span>
                      <span className="mono small file-meta">{fmtDate(e.mtime)}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="files-foot">
              {picked.length ? (
                <>
                  <span className="mono small accent-text">{picked.length} SELECTED{pickedSize ? ` · ${fmtSize(pickedSize)}` : ''}</span>
                  {confirmDelete ? (
                    <div className="row confirm">
                      <span className="mono tiny">DELETE {picked.length} FILE{picked.length === 1 ? '' : 'S'}?</span>
                      <button className="small-key danger-text" onClick={() => { setConfirmDelete(false); void tether.deleteFiles(picked.map((p) => join(dir, p.name))) }}>YES</button>
                      <button className="small-key" onClick={() => setConfirmDelete(false)}>NO</button>
                    </div>
                  ) : (
                    <div className="row">
                      {onlyFiles && <button className="small-key danger-text" disabled={fileOp.busy} onClick={() => setConfirmDelete(true)}>DELETE</button>}
                      {picked.length === 1 && <button className="small-key" disabled={fileOp.busy} onClick={() => open(picked[0])}>OPEN</button>}
                      <button className="small-key accent-key" disabled={fileOp.busy} onClick={() => void tether.saveToPc(picked.map((p) => join(dir, p.name)))}>SAVE TO PC</button>
                    </div>
                  )}
                </>
              ) : fileOp.text ? (
                <>
                  <span className={`mono small ${fileOp.error ? 'danger-text' : fileOp.busy ? 'amber-text' : 'accent-text'}`} role="status">
                    {fileOp.busy && <span className="blink">● </span>}{fileOp.text.replace(' · OPEN FOLDER', '')}
                  </span>
                  {fileOp.text.endsWith('OPEN FOLDER') && <button className="small-key" onClick={() => void tether.openSaveFolder()}>OPEN FOLDER</button>}
                </>
              ) : (
                <span className="mono small muted">DOUBLE-CLICK TO OPEN · FILES PREVIEW HERE</span>
              )}
            </div>
          </section>
        </div>
      )}

      <section className="drop-strip" aria-label="Send files">
        <span className="slot-line" />
        <span className="drop-title">DROP FILES ANYWHERE</span>
        <span className="muted drop-note">They land in this folder. APKs install.</span>
      </section>
    </main>
  )
}
