# TETHER

**Your Android phone, inside your Windows PC.**

TETHER is a Windows tray app that mirrors and controls your Android phone over
a USB cable. It's like AnyDesk for your own phone, with every phone app in its
own PC window and files and clipboard shared both ways.

---

## Install

1. Download **`TETHER-Setup-<version>.exe`** from this repo's
   [Releases](../../releases) page, or build it yourself (see
   [Build from source](#build-from-source)).
2. Run it. It installs for your Windows user only, so no admin prompt.
   The installer is not code-signed, so Windows SmartScreen warns the first
   time: click **More info → Run anyway**.
3. TETHER opens and walks you through first run:
   1. **Set a password** (8+ characters). You type it every time TETHER opens.
   2. **Download the engine:** scrcpy + adb from scrcpy's official GitHub
      release (~11 MB, once). Its SHA-256 is checked before anything runs.
   3. **Connect your phone** over USB (see [Phone setup](#phone-setup-one-time)),
      then click **Trust this phone**.

TETHER lives in the system tray. Closing the window keeps it running; quit it
from the tray icon.

### Uninstall

**Settings → Apps → Installed apps → TETHER → Uninstall.** Your data in
`%LOCALAPPDATA%\Tether` (password, trusted phones, layouts, the engine) is
kept. Delete that folder to remove it too.

---

## How it works

TETHER is a single app on the PC. **Nothing gets installed on the phone.** It
builds on [scrcpy](https://github.com/Genymobile/scrcpy) and Android's own
`adb`, and shows the phone screen inside its own windows:

```
Windows PC                                  Android phone
┌──────────────────────────────┐            ┌─────────────────────────┐
│ TETHER (Electron tray app)   │            │ adbd (built into        │
│   └─ @tether/core            │    USB     │ Android)                │
│        ├─ adb  ──────────────┼────────────┼─ scrcpy-server (pushed │
│        └─ scrcpy client ─────┤            │   per session, removed  │
└──────────────────────────────┘            │   afterwards)           │
                                            └─────────────────────────┘
```

## Requirements

- **PC:** Windows 10/11, 64-bit
- **Phone:** Android 5.0+ (Android 11+ for phone audio)
- USB debugging enabled on the phone (see below)

## Phone setup (one time)

1. **Settings → About phone → tap "Build number" 7 times** to unlock Developer options.
2. **Developer options → USB debugging: ON.**
3. Plug the phone in and accept **"Allow USB debugging?"**
4. *Xiaomi / Redmi / POCO:* also turn on **"USB debugging (Security settings)"**, then reboot.

## Security

- Every PC has to be approved on the phone before it can connect.
- TETHER only shows or controls phones you trusted in TETHER.
- USB only. Nothing listens on the internet.
- The app is protected by a password (8+ characters) and locks when Windows locks or the PC sits idle.
- A one-click **Lockdown** button disconnects everything.

## Project layout

```
apps/desktop     Electron tray app (UI)
packages/core    device manager · adb wrapper · scrcpy client
```

## Build from source

Requires Node.js 22+.

```bash
npm ci          # install exactly what package-lock.json lists
npm run dev     # run TETHER from source
npm test        # core tests
npm run dist    # installer → apps/desktop/release/TETHER-Setup-<version>.exe
```

## Credits

Built on [scrcpy](https://github.com/Genymobile/scrcpy) by Genymobile
(Apache 2.0) and Android platform-tools.
