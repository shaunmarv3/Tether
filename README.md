# TETHER

**Your Android phone, inside your Windows PC.**

TETHER is a Windows tray app that mirrors and controls your Android phone over
USB or Wi-Fi. It's like AnyDesk for your own phone, with every phone app in its
own PC window and files and clipboard shared both ways.

> **Status:** early development. Nothing to download yet.

---

## How it works

TETHER is a single app on the PC. **Nothing gets installed on the phone.** It
builds on [scrcpy](https://github.com/Genymobile/scrcpy) and Android's own
`adb`:

```
Windows PC                                  Android phone
┌──────────────────────────────┐            ┌─────────────────────────┐
│ TETHER (Electron tray app)   │            │ adbd (built into        │
│   └─ @tether/core            │ USB/Wi-Fi  │ Android)                │
│        ├─ adb  ──────────────┼────────────┼─ scrcpy-server (pushed │
│        └─ scrcpy windows ────┤            │   per session, removed  │
└──────────────────────────────┘            │   afterwards)           │
                                            └─────────────────────────┘
```

## Requirements

- **PC:** Windows 10/11, 64-bit
- **Phone:** Android 5.0+ (Android 11+ for wireless pairing and audio)
- USB debugging enabled on the phone (see below)

## Phone setup (one time)

1. **Settings → About phone → tap "Build number" 7 times** to unlock Developer options.
2. **Developer options → USB debugging: ON.**
3. Plug the phone in and accept **"Allow USB debugging?"**
4. *Xiaomi / Redmi / POCO:* also turn on **"USB debugging (Security settings)"**, then reboot.
5. *Wireless (Android 11+):* **Developer options → Wireless debugging → Pair device with pairing code.**

## Security

- Every PC has to be approved on the phone before it can connect.
- Wireless connections use Android's encrypted (TLS) wireless debugging.
- Nothing listens on the internet.
- The app is protected by a PIN or Windows Hello and locks when Windows locks.
- A one-click **Lockdown** button disconnects everything.

## Project layout

```
apps/desktop     Electron tray app (UI)
packages/core    device manager · adb wrapper · scrcpy launcher
```

## Development

Requires Node.js 22+.

```bash
npm install
```

## Credits

Built on [scrcpy](https://github.com/Genymobile/scrcpy) by Genymobile
(Apache 2.0) and Android platform-tools.
