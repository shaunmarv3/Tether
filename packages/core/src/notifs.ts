// The phone's notification shade over plain adb, nothing installed on the phone. Read: `dumpsys notification --noredact`.
// Clear: a long snooze (adb may not cancel another app's notification, and may not unsnooze either: no undo).
import { isOneTimeCode } from './clips'
import { isSerial } from './devices'
import { shq } from './files'
import { run } from './run'

export interface PhoneNotification {
  key: string; pkg: string; title: string
  text: string // one line, for the list
  fullText: string // everything the notification carries
  postedAt: number // ms
  clearable: boolean // the phone itself won't swipe away ongoing / no-clear ones
  code: boolean // looks like a one-time code
}

export const SNOOZE_MS = 2_592_000_000 // 30 days; on the CMF Phone 1 an expired snooze did not come back anyway

const RECORD = /^ {4}NotificationRecord\(/
const KEY_LINE = /^ {14,}android\.[\w.]+=/
const NOT_CLEARABLE = /\b(ONGOING_EVENT|NO_CLEAR|FOREGROUND_SERVICE)\b/

export function isNotificationKey(k: unknown): k is string {
  return typeof k === 'string' && k.length > 0 && k.length <= 500 && k.includes('|') && !/[\0\r\n]/.test(k)
}

const DUMP_CUT = 512 // dumpsys prints at most this many characters of a text (seen on the phone)

// `String (…)`, `SpannableString (…)`, … → the text; `null` → ''. A cut text gets ' …'.
function str(raw: string | undefined): string {
  const m = raw ? /^[\w.]*String\w* \(([\s\S]*)\)$/.exec(raw) : null
  return !m ? '' : m[1].length === DUMP_CUT ? `${m[1]} …` : m[1]
}

// `Bundle[] (n)` + one `[i] Bundle[{… sender=S, text=T, time=N}]` per message (T may hold anything, line breaks too).
function messages(raw: string | undefined): string[] {
  if (!raw) return []
  return raw.split(/\n\s+\[\d+\] Bundle\[\{/).slice(1).map((part) => {
    const s = part.indexOf('sender=')
    const t = part.indexOf(', text=')
    const end = /, time=\d+\}\]\s*$/.exec(part)?.index ?? part.replace(/\}\]\s*$/, '').length
    const text = t < 0 ? '' : part.slice(t + 7, end)
    const sender = s < 0 || t < s ? '' : part.slice(s + 7, t)
    return sender ? `${sender}: ${text}` : text
  }).filter(Boolean)
}

// `CharSequence[] (n)` + `[i] line` (inbox style).
function lines(raw: string | undefined): string[] {
  return raw ? raw.split('\n').slice(1).map((l) => l.replace(/^\s*\[\d+\] /, '')).filter(Boolean) : []
}

function extras(rec: string[]): Map<string, string> {
  const out = new Map<string, string>()
  const start = rec.findIndex((l) => /^\s+extras=\{$/.test(l))
  if (start < 0) return out
  const close = `${rec[start].slice(0, rec[start].indexOf('extras'))}}`
  let name: string | null = null
  for (const l of rec.slice(start + 1)) {
    if (l === close) break
    if (KEY_LINE.test(l)) {
      const t = l.trimStart()
      name = t.slice(0, t.indexOf('='))
      out.set(name, t.slice(name.length + 1))
    } else if (name) out.set(name, `${out.get(name)}\n${l}`)
  }
  return out
}

function parseRecord(rec: string[]): PhoneNotification | null {
  const head = rec[0]
  const flags = /flags=(\S+)/.exec(head)?.[1] ?? ''
  if (/\bGROUP_SUMMARY\b/.test(flags)) return null
  const x = extras(rec)
  const text = str(x.get('android.text'))
  const big = str(x.get('android.bigText'))
  const chat = messages(x.get('android.messages'))
  const full = [big || text, ...chat, ...lines(x.get('android.textLines')), str(x.get('android.subText')), str(x.get('android.summaryText'))]
    .filter((s, i, all) => s && all.indexOf(s) === i).join('\n')
  const title = str(x.get('android.title')) || str(x.get('android.conversationTitle'))
  const line = (text || big || chat.at(-1) || '').split('\n')[0]
  if (!title && !full) return null
  const body = rec.join('\n')
  const when = Number(/^\s+when=(\d+)/m.exec(body)?.[1] ?? 0)
  return {
    key: /key=(.*?): Notification\(/.exec(head)?.[1] ?? '',
    pkg: /pkg=(\S+)/.exec(head)?.[1] ?? '',
    title, text: line, fullText: full,
    postedAt: when > 0 ? when : Number(/mCreationTimeMs=(\d+)/.exec(body)?.[1] ?? 0),
    clearable: !NOT_CLEARABLE.test(flags),
    code: isOneTimeCode(line) || isOneTimeCode(full),
  }
}

// Only the "Notification List:" section (the shade); snoozed ones and the rest of the dump are skipped. Newest first.
export function parseNotifications(dump: string): PhoneNotification[] {
  const all = dump.replace(/\r\n/g, '\n').split('\n')
  const from = all.findIndex((l) => /^ {2}Notification List:/.test(l))
  if (from < 0) return []
  const records: string[][] = []
  for (const l of all.slice(from + 1)) {
    if (/^ {2}\S/.test(l)) break // next section; column-0 lines are wrapped text, not the end
    if (RECORD.test(l)) records.push([l])
    else records.at(-1)?.push(l)
  }
  return records.map(parseRecord).filter((n): n is PhoneNotification => !!n?.key).sort((a, b) => b.postedAt - a.postedAt)
}

export async function readNotifications(adb: string, serial: string): Promise<PhoneNotification[]> {
  if (!isSerial(serial)) throw new Error(`bad serial: ${serial}`)
  const r = await run(adb, ['-s', serial, 'shell', 'dumpsys notification --noredact'])
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'dumpsys notification failed')
  return parseNotifications(r.stdout)
}

export async function clearNotification(adb: string, serial: string, key: string): Promise<void> {
  if (!isSerial(serial)) throw new Error(`bad serial: ${serial}`)
  if (!isNotificationKey(key)) throw new Error('bad notification key')
  const r = await run(adb, ['-s', serial, 'shell', `cmd notification snooze --for ${SNOOZE_MS} ${shq(key)}`])
  if (r.code !== 0 || !r.stdout.startsWith('snoozing')) throw new Error(r.stderr.trim() || r.stdout.trim() || 'snooze failed')
}
