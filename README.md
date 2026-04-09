# Port Manager

Desktop app for managing local dev processes, ports, and Docker services from one place. Start/stop projects, switch between DEV and PROD modes, monitor port usage and CPU/RAM per service. Lives in your system tray.

---

## Quick Start (Development)

### Prerequisites

| Tool | Why |
|------|-----|
| **Node.js 18+** | Frontend build |
| **Rust (MSVC toolchain)** | Backend build. Install via [rustup.rs](https://rustup.rs) |
| **Microsoft C++ Build Tools** | Required by Rust on Windows. Install "Desktop development with C++" workload from [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) |

WebView2 ships with Windows 10/11 -- no separate install needed.

### Run in dev mode

```bash
npm install
npm run tauri:dev
```

That's it. This starts the Next.js dev server on port 9090 and opens the Tauri desktop window with hot reload.

### Build the installer

```bash
npm run tauri:build
```

Output: `src-tauri/target/release/bundle/nsis/Port Manager_0.1.0_x64-setup.exe`

Double-click the `.exe` to install. It creates a desktop shortcut and Start Menu entry. No admin required (installs to your user profile).

---

## How the App Works

- **Add processes** via the `+ Process` button -- give it a name, a command (`npm run dev`), and a working directory. Or pick Docker Compose and point to a compose file.
- **DEV / PROD mode** -- optionally set a production command override. When configured, a DEV/PROD toggle appears on the process card so you can pick the mode before starting.
- **Start / Stop / Restart** -- buttons on each process card. Restart stops then re-starts in the same mode.
- **Port monitoring** -- the app polls every 5 seconds to detect which ports each process is listening on, plus CPU and memory usage.
- **Groups** -- organize processes into collapsible folders. Drag-and-drop to reorder or move between groups.
- **System tray** -- closing the window hides the app to the tray (bottom-right). Click the tray icon to bring it back. Right-click for "Show" or "Quit".

---

## In-App Updates

**Yes, there is an in-app update banner.**

When a newer version is detected, a blue banner appears at the top of the app:

```
 [upload icon]  Update v0.2.0 available    [ Install & Restart ]  [X]
```

- The app checks for updates **on startup** and **every 30 minutes** after that.
- Click **"Install & Restart"** -- it downloads the new installer, runs it silently (you'll see a small progress bar), and the app restarts with the new version. No uninstall needed.
- Click **X** to dismiss the banner for this session. It will appear again next time an update is detected.
- If the update server is unreachable or signing keys aren't configured yet, the check silently does nothing.

---

## Publishing Updates

### One-Time Setup: Signing Keys

Tauri requires every update to be cryptographically signed. Generate a keypair once:

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/port-manager.key
```

This creates two things:
- **Private key** saved to `~/.tauri/port-manager.key` -- keep this secret, never commit it
- **Public key** printed to terminal -- copy it

Paste the public key into `src-tauri/tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6...<YOUR_PUBLIC_KEY_HERE>"
  }
}
```

### How to Push an Update

**Step 1 -- Bump the version**

Edit the version in two places (they must match):

- `src-tauri/tauri.conf.json` -- `"version": "0.2.0"`
- `package.json` -- `"version": "0.2.0"`

**Step 2 -- Build with the signing key**

```bash
# Set the private key as an environment variable
set TAURI_SIGNING_PRIVATE_KEY=<contents of ~/.tauri/port-manager.key>

# Build
npm run tauri:build
```

This produces two files in `src-tauri/target/release/bundle/nsis/`:
- `Port Manager_0.2.0_x64-setup.nsis.zip` -- the update payload
- `Port Manager_0.2.0_x64-setup.nsis.zip.sig` -- the signature file

**Step 3 -- Upload to your update server**

The app checks the endpoint configured in `tauri.conf.json`:

```
https://releases.example.com/port-manager/{{target}}/{{arch}}/{{current_version}}
```

Your server must respond with:

- **`204 No Content`** -- when the user already has the latest version
- **`200 OK` + JSON** -- when a newer version exists:

```json
{
  "version": "0.2.0",
  "url": "https://releases.example.com/port-manager/Port Manager_0.2.0_x64-setup.nsis.zip",
  "signature": "<contents of the .sig file>",
  "notes": "Bug fixes and performance improvements",
  "pub_date": "2026-04-08T00:00:00Z"
}
```

### Update Server Options

**Option A: GitHub Releases (simplest)**

Change the endpoint in `tauri.conf.json` to:

```json
"endpoints": [
  "https://github.com/YOUR_ORG/port-manager/releases/latest/download/latest.json"
]
```

Then create a GitHub Release, upload the `.nsis.zip` + `.sig` files, and include a `latest.json` file with the format above.

**Option B: Static file server**

Host the JSON response and the `.nsis.zip` on any web server, S3 bucket, or CDN. The app just needs to GET the endpoint URL and get back either 204 or the JSON.

**Option C: Dynamic server**

Write a small API that reads the `{{current_version}}` from the URL, compares it to the latest available version, and responds accordingly.

---

## Project Scripts

| Command | What it does |
|---------|-------------|
| `npm run tauri:dev` | Start the app in development mode (hot reload) |
| `npm run tauri:build` | Build production installer (NSIS `.exe`) |
| `npm run dev` | Start only the Next.js frontend on port 9090 |
| `npm run build` | Build only the Next.js frontend to `out/` |

---

## Project Structure (abridged)

```
src/                    Frontend (Next.js 16, React 19, TypeScript)
  app/                  Layout + main page
  components/           12 UI components (ProcessCard, Toolbar, modals, etc.)
  hooks/                useProcesses (central state), useTheme
  lib/                  types.ts (interfaces), commands.ts (Tauri IPC wrappers)

src-tauri/              Backend (Rust, Tauri 2)
  src/
    lib.rs              App setup, system tray, window events
    commands.rs         9 IPC command handlers
    models.rs           Data types (SavedProcess, RunMode, etc.)
    config.rs           JSON config persistence
    port_scanner.rs     Port enumeration via netstat2
    process_manager.rs  Process spawn/kill (Windows cmd)
    docker.rs           Docker Compose CLI wrapper
  tauri.conf.json       Window config, bundle targets, updater plugin
  Cargo.toml            Rust dependencies

ARCHITECTURE.md         Full architecture reference (keep in sync with code)
```

See `ARCHITECTURE.md` for the complete file map, dependency graph, and data flow.
