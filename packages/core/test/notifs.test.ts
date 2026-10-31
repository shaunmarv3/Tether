import { describe, expect, it } from 'vitest'
import { shq } from '../src/files'
import { clearNotification, isNotificationKey, parseNotifications } from '../src/notifs'

// Synthetic `dumpsys notification --noredact` in the shape seen on the phone (spec §3). Never paste a real dump here.
interface Rec { pkg: string; key: string; flags?: string; when: number; title?: string; text?: string; msgs?: [string, string][] }
function record(r: Rec): string {
  const extras = [
    r.title !== undefined ? `              android.title=String (${r.title})` : '              android.title=null',
    '              android.subText=null',
    r.text !== undefined ? `              android.text=String (${r.text})` : '              android.text=null',
    ...(r.msgs ? [`              android.messages=Bundle[] (${r.msgs.length})`,
      ...r.msgs.map(([s, t], i) => `                [${i}] Bundle[{extras=Bundle[{}], sender_person=android.app.Person@1, sender=${s}, text=${t}, time=${i + 1}}]`)] : []),
    '              android.infoText=null',
  ]
  return [
    `    NotificationRecord(0x0abc: pkg=${r.pkg} user=UserHandle{0} id=1 tag=null importance=4 key=${r.key}: Notification(channel=c shortcut=null contentView=null vibrate=null sound=null defaults=0 flags=${r.flags ?? 'AUTO_CANCEL'} color=0x00000000 vis=PRIVATE))`,
    '      uid=10136 userId=0',
    '      notification=',
    '          pri=0',
    `          when=${r.when}/${r.when}`,
    '          actions={',
    '              [0] "Mark as read" -> PendingIntent{1: PendingIntentRecord{2 x broadcastIntent}}',
    '          }',
    '          extras={',
    ...extras,
    '          }',
    `      mCreationTimeMs=${r.when + 5}`,
  ].join('\n')
}
const dump = (recs: Rec[], snoozed: Rec[] = []) => [
  'Current Notification Manager state:',
  '  Notification List:',
  ...recs.map(record),
  '  Snoozed notifications:',
  ...snoozed.map(record),
  '  mNotificationAssistants:',
].join('\n')

const msg: Rec = { pkg: 'com.whatsapp', key: '0|com.whatsapp|1|null|10200', when: 3000, title: 'Ann', text: 'see you\nat 7',
  msgs: [['Ann', 'hi'], ['Bob', 'see you']] }
const promo: Rec = { pkg: 'com.shop', key: '0|com.shop|7|null|10300', when: 1000, title: 'Sale', text: '50% off' }
const usb: Rec = { pkg: 'android', key: '-1|android|32|null|1000', when: 2000, title: 'USB debugging connected', text: 'Tap to turn off', flags: 'ONGOING_EVENT|NO_CLEAR' }

describe('parseNotifications', () => {
  it('lists records newest first', () => {
    const list = parseNotifications(dump([promo, msg, usb]))
    expect(list.map((n) => n.key)).toEqual([msg.key, usb.key, promo.key])
    expect(list[0]).toMatchObject({ pkg: 'com.whatsapp', title: 'Ann', postedAt: 3000 })
  })

  it('joins multi-line text', () => {
    const [n] = parseNotifications(dump([{ ...msg, text: 'line one\nline two', msgs: undefined }]))
    expect(n.text).toBe('line one')
    expect(n.fullText).toContain('line one\nline two')
  })

  it('adds chat messages', () => {
    const [n] = parseNotifications(dump([msg]))
    expect(n.fullText).toContain('Ann: hi')
    expect(n.fullText).toContain('Bob: see you')
  })

  it('keeps odd text whole', () => {
    const odd = 'ok (really), time=5 = fine\nnext'
    const [n] = parseNotifications(dump([{ ...msg, text: odd, msgs: [['Ann', odd]] }]))
    expect(n.fullText).toContain(odd)
    expect(n.fullText).toContain(`Ann: ${odd}`)
  })

  it('hides group summaries and empty records', () => {
    const list = parseNotifications(dump([promo, { ...promo, key: 'k|s|summary', flags: 'GROUP_SUMMARY' },
      { ...promo, key: 'k|e|empty', title: undefined, text: undefined }]))
    expect(list.map((n) => n.key)).toEqual([promo.key])
  })

  it('ongoing is not clearable', () => {
    const list = parseNotifications(dump([usb, promo]))
    expect(list.find((n) => n.key === usb.key)?.clearable).toBe(false)
    expect(list.find((n) => n.key === promo.key)?.clearable).toBe(true)
  })

  it('marks codes', () => {
    const [n] = parseNotifications(dump([{ ...promo, text: 'Your OTP is 482913' }]))
    expect(n.code).toBe(true)
    expect(parseNotifications(dump([promo]))[0].code).toBe(false)
  })

  it('ignores snoozed section', () => {
    expect(parseNotifications(dump([promo], [msg])).map((n) => n.key)).toEqual([promo.key])
  })

  it('marks text dumpsys cut at 512 characters', () => {
    const [n] = parseNotifications(dump([{ ...promo, text: 'x'.repeat(512) }]))
    expect(n.fullText).toBe(`${'x'.repeat(512)} …`)
    expect(parseNotifications(dump([{ ...promo, text: 'x'.repeat(511) }]))[0].fullText).toBe('x'.repeat(511))
  })

  it('uses the creation time when `when` is 0', () => {
    expect(parseNotifications(dump([{ ...promo, when: 0 }]))[0].postedAt).toBe(5)
  })
})

describe('isNotificationKey', () => {
  it('accepts real-looking keys', () => {
    expect(isNotificationKey("0|com.x|2|tag with 'quote'|10136")).toBe(true)
  })
  it('rejects junk', () => {
    for (const k of ['', 'a\nb', 'no-bar', 'x|'.repeat(251), 42, null]) expect(isNotificationKey(k), String(k)).toBe(false)
  })
})

describe('clearNotification', () => {
  it('quotes the key', async () => {
    expect(shq("a|b'c")).toBe("'a|b'\\''c'")
    await expect(clearNotification('adb', 'X1', 'a\nb')).rejects.toThrow()
    await expect(clearNotification('adb', 'bad serial!', '0|a|1|null|2')).rejects.toThrow()
  })
})
