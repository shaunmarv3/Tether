import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'
import type { RemoteEntry } from '@tether/core'
import type { AppState, Place } from '../../shared/api'
import { sentence } from '../text'
import { tether } from '../tether'
import { EmptyState, ICON, Icon } from '../ui'

export const ROOT = '/sdcard/'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const errText = (err: unknown) => sentence(String((err as Error)?.message ?? err).replace(/^.*Error: /, ''))
const join = (dir: string, name: string) => `${dir.replace(/\/$/, '')}/${name}`
const same = (a: string, b: string) => a.replace(/\/$/, '') === b.replace(/\/$/, '')

// Path bar pieces. '/sdcard/' is Android's name for the phone's own storage, so it shows as "Phone storage";
// a removable card ('/storage/6137-3639/') shows as "SD card".
export function crumbs(dir: string): { label: string; path: string }[] {
  const sd = /^\/storage\/[0-9A-F]{4}-[0-9A-F]{4}\//.exec(dir)
  const root = sd ? sd[0] : ROOT
  const rest = dir.slice(root.length).split('/').filter(Boolean)
  return [{ label: sd ? 'SD card' : 'Phone storage', path: root },
    ...rest.map((p, i) => ({ label: p, path: `${root}${rest.slice(0, i + 1).join('/')}/` }))]
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

// '2026-10-26T18:42' → '26 Oct 18:42' (phone time, as ls shows it)
const fmtDate = (m: string) => `${Number(m.slice(8, 10))} ${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(11, 16)}`

function typeOf(e: RemoteEntry): string {
  if (e.dir) return 'Folder'
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
  const crumb = useRef<HTMLElement>(null)
  const parts = crumbs(dir)

  const load = () => {
    setError(null)
    tether.listDir(dir).then(
      (list) => {
        // Folders A–Z, then files newest first; dot-files stay hidden.
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

  if (!ready) return <div className="page"><EmptyState title="No phone" note="Plug in a USB cable" kind="phone" /></div>

  return (
    <div className="page files">
      <nav className="files-places" aria-label="Places">
        <h2 className="section-title">Places</h2>
        {places.map((p) => (
          <button key={p.dir} className="files-place" aria-current={same(dir, p.dir) ? 'page' : undefined} onClick={() => setDir(p.dir)}>
            {p.name}<span className="mono muted">{p.count?.toLocaleString('en-US')}</span>
          </button>
        ))}
        <button className="files-place" aria-current={dir === ROOT ? 'page' : undefined} onClick={() => setDir(ROOT)}>Phone storage</button>
        <span className="spacer" />
        {usedPct !== null && (
          <div className="files-store">
            <div className="files-meter" role="meter" aria-valuenow={usedPct} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
              <i style={{ width: `${usedPct}%` }} />
            </div>
            <div className="mono muted">{Math.round(total! - used!)} GB free of {total}</div>
          </div>
        )}
      </nav>

      <section className="files-main" aria-label={`Files in ${friendlyPath(dir)}`}>
        <div className="files-bar" role="toolbar" aria-label="Folder">
          <button className="icon-btn ghost" aria-label="Up one folder" title="Up one folder" disabled={parts.length === 1}
            onClick={() => setDir(parts[parts.length - 2].path)}>
            <Icon d={ICON.up} size={16} width={1.8} />
          </button>
          <nav className="files-crumb" ref={crumb} aria-label="Folder path">
            {parts.map((p, i) => (
              <Fragment key={p.path}>
                {i > 0 && <span className="files-sep">/</span>}
                {i === parts.length - 1 ? <span className="files-here">{p.label}</span>
                  : <button className="files-crumb-part" onClick={() => setDir(p.path)}>{p.label}</button>}
              </Fragment>
            ))}
          </nav>
          {picked.length ? (
            <>
              <span className="files-count">{picked.length} selected{pickedSize ? ` · ${fmtSize(pickedSize)}` : ''}</span>
              {confirmDelete ? (
                <span className="files-confirm" role="alert">
                  Delete {picked.length} file{picked.length === 1 ? '' : 's'}?
                  <button className="btn danger mid" onClick={() => { setConfirmDelete(false); void tether.deleteFiles(picked.map((p) => join(dir, p.name))) }}>Yes, delete</button>
                  <button className="btn mid" onClick={() => setConfirmDelete(false)}>No</button>
                </span>
              ) : (
                <>
                  {onlyFiles && <button className="btn mid files-delete" disabled={fileOp.busy} onClick={() => setConfirmDelete(true)}>Delete</button>}
                  {picked.length === 1 && <button className="btn mid" disabled={fileOp.busy} onClick={() => open(picked[0])}>Open</button>}
                  <button className="btn primary mid" disabled={fileOp.busy} onClick={() => void tether.saveToPc(picked.map((p) => join(dir, p.name)))}>Save to PC</button>
                </>
              )}
            </>
          ) : folderName !== null ? (
            <form className="files-form" onSubmit={makeFolder}>
              <input className="field" autoFocus maxLength={120} placeholder="Folder name" aria-label="Folder name"
                value={folderName} onChange={(e) => setFolderName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setFolderName(null) }} />
              <button className="btn primary mid" type="submit">Make</button>
              <button className="btn mid" type="button" onClick={() => setFolderName(null)}>Cancel</button>
            </form>
          ) : (
            <>
              {fileOp.text && (
                <span className={`files-op${fileOp.error ? ' bad' : ''}`} role="status">
                  {fileOp.busy && <span className="toast-bar"><i /></span>}
                  <span className="ellipsis">{sentence(fileOp.text.replace(' · OPEN FOLDER', ''))}</span>
                  {fileOp.text.endsWith('OPEN FOLDER') && <button className="link-btn" onClick={() => void tether.openSaveFolder()}>Open folder</button>}
                </span>
              )}
              <button className="btn mid" onClick={() => setFolderName('')}>New folder</button>
              <button className="btn primary mid" disabled={fileOp.busy} onClick={() => void tether.pickAndSend(dir)}>Send to phone</button>
            </>
          )}
        </div>

        <div className="files-table" role="table" aria-label={`Files in ${friendlyPath(dir)}`}>
          <div className="files-row head" role="row">
            <span role="columnheader" /><span role="columnheader">Type</span><span role="columnheader">Name</span>
            <span role="columnheader" className="num">Size</span><span role="columnheader" className="num">Modified</span>
          </div>
          {entries === null && <EmptyState title="Reading…" kind="loading" />}
          {error && <div className="error-text page-error" role="alert">{error}</div>}
          {entries?.length === 0 && !error && <EmptyState title="Empty folder" note="Drop files here to send them to this folder" />}
          {entries?.map((e) => {
            const on = selected.includes(e.name)
            return (
              <label key={e.name} role="row" className={`files-row${on ? ' on' : ''}`} onDoubleClick={() => open(e)}>
                <input type="checkbox" checked={on} aria-label={`Select ${e.name}`} onChange={() => toggle(e.name)} />
                <span className="mono files-type">{typeOf(e)}</span>
                <span className="ellipsis files-name">{e.name}</span>
                <span className="mono num muted">{e.dir ? '—' : fmtSize(e.size)}</span>
                <span className="mono num muted">{fmtDate(e.mtime)}</span>
              </label>
            )
          })}
        </div>
      </section>
    </div>
  )
}
