<div align="center">

# Port Manager

**A fast desktop dashboard for taming the ports, processes, and Docker services on your dev machine.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.10-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white)](#install)

Built by [Meliorate](https://meliorate.pro) as an internal tool, now open source.

</div>

---

## Why

Juggling a dozen local services — Next.js dev servers, Rust backends, Docker Compose stacks, one-off scripts that forgot to release their port — gets old fast. Port Manager gives you a single window to see what's running, start and stop anything with one click, and kill whatever orphan is squatting on `:3000` this time.

## Features

- **Saved processes** — register any shell command or `docker compose` file, organize them into folder groups, launch with one click.
- **DEV / PROD toggle** — each process can have a second command/directory/compose file for production-style runs; switch modes per launch.
- **Live ports & resource usage** — CPU %, RAM, and every port a process is listening on, polled every 5 seconds.
- **System-wide port scanner** — see every `LISTEN` socket on the machine with PID, process name, and a one-click "kill this" button.
- **Detail panel with live logs** — click any process to see stdout/stderr streaming in real time, ANSI escape codes stripped automatically. Docker processes follow `docker compose logs -f`.
- **Orphan recovery** — if a PID dies but the port is still held, Port Manager detects it and lets you clean up.
- **System tray** — closing the window hides to tray instead of quitting. Processes keep running.
- **Auto-updater** — Tauri-signed updates delivered in the background (see [Auto-updater setup](#auto-updater-setup)).
- **Dark mode** — because of course.

## Stack

| Layer | Tech |
|---|---|
| Shell | Tauri 2.10 (Rust, WebView2) |
| Frontend | Next.js 16 (static export), React 19, TypeScript |
| State | A single `useProcesses` hook — no Redux, no Zustand |
| Port scanning | `netstat2` + `sysinfo` |
| Process control | `kill_tree` + `cmd /C` on Windows |
| Docker | `docker compose` CLI wrapper |

See `ARCHITECTURE.md` in the source tree for the full module map.

## Install

### From source

Requirements:
- **Node.js** 20+ and **npm**
- **Rust** stable toolchain (`rustup`)
- **Windows**: the WebView2 runtime (preinstalled on Windows 11)
- **Docker Desktop** (optional — only needed if you register `docker compose` processes)

```bash
git clone https://github.com/Meliorate-agency/port-manager.git
cd port-manager
npm install
npm run tauri:dev       # hot-reload dev build
npm run tauri:build     # release NSIS installer (Windows)
```

Built installer lands in `src-tauri/target/release/bundle/nsis/`.

### Prebuilt

Grab the latest NSIS installer from [Releases](https://github.com/Meliorate-agency/port-manager/releases) once published.

## Project layout

```
port-manager/
├─ src/              Next.js frontend (components, hooks, lib, app router)
├─ src-tauri/        Rust backend (commands, port scanner, process manager, docker wrapper)
├─ public/           Static SVG assets
└─ next.config.ts    Next.js static-export config
```

## Auto-updater setup

The updater is wired up but ships with a placeholder endpoint. Before you publish builds to real users you need to generate a signing key pair and point the endpoint somewhere you control. See [`docs/UPDATER.md`](docs/UPDATER.md) for step-by-step instructions.

## Contributing

Issues and PRs welcome. Keep changes focused — one feature or fix per PR. The codebase follows a "centralized hook + pure components" pattern; match the existing style.

## License

[MIT](LICENSE) © 2026 Adrian Stavljenic / [Meliorate](https://meliorate.pro)
