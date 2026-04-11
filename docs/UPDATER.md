# Auto-Updater Setup

Port Manager uses the [`tauri-plugin-updater`](https://tauri.app/plugin/updater/) for background updates. The shipped config has a **placeholder endpoint** (`releases.example.com`) and a public key that only matches a throwaway dev private key. Before you release builds to real users you need to do three things:

1. Generate your own signing key pair
2. Host a `latest.json` manifest + the signed installer somewhere
3. Point `tauri.conf.json` at your key and endpoint

---

## 1. Generate a signing key pair

Tauri uses [minisign](https://jedisct1.github.io/minisign/)-compatible keys. The keys for this project live in `.tauri/` at the repo root, which is **gitignored** — `.gitignore` blocks the whole folder, and also has a `*.key` rule as a second line of defense.

If the keys already exist in `.tauri/`, skip this step. To generate a fresh pair:

```bash
npm run tauri signer generate -- -w .tauri/port-manager.key
```

This writes:

- `.tauri/port-manager.key` — **private key**. Never commit this, never share it. Back it up somewhere safe (password manager, encrypted drive, another machine). If you lose it, existing installed copies can never update again.
- `.tauri/port-manager.key.pub` — **public key**. Safe to commit (but we still gitignore the whole folder for simplicity). This is what gets embedded in the built app to verify update signatures.

## 2. Put the public key in the config

Open `src-tauri/tauri.conf.json` and replace the `pubkey` value with the contents of `~/.tauri/port-manager.key.pub` (one line, the `dW50cnVz…` base64 blob — not the whole file with the comment header).

```jsonc
{
  "plugins": {
    "updater": {
      "pubkey": "PASTE_YOUR_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://your-release-host.example/port-manager/{{target}}/{{arch}}/{{current_version}}"
      ],
      "windows": { "installMode": "passive" }
    }
  }
}
```

## 3. Set the signing key for release builds

The Tauri bundler signs the installer at build time using the private key, provided via environment variables:

**PowerShell (Windows)** — run from the repo root:
```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content .\.tauri\port-manager.key -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""   # if you set a password, put it here
npm run tauri:build
```

**bash / zsh** — run from the repo root:
```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat .tauri/port-manager.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run tauri:build
```

After the build completes, you'll find the signed artifacts in `src-tauri/target/release/bundle/nsis/`:

- `Port Manager_<version>_x64-setup.exe` — the installer
- `Port Manager_<version>_x64-setup.exe.sig` — the minisign signature

## 4. Host a release manifest

Your endpoint has to return a JSON document the updater plugin understands. The shape looks like this:

```json
{
  "version": "0.1.1",
  "notes": "Bug fixes and improvements",
  "pub_date": "2026-04-11T10:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "CONTENTS_OF_.sig_FILE",
      "url": "https://your-release-host.example/port-manager/0.1.1/Port%20Manager_0.1.1_x64-setup.exe"
    }
  }
}
```

> HERE
Two ways to host this without running a server:

### Option A — GitHub Releases (recommended)

1. Create a GitHub Release for the new version.
2. Upload the `.exe` and `.exe.sig` files as release assets.
3. Upload a `latest.json` file with the shape above (the `signature` field is the **contents** of the `.sig` file, not a URL).
4. Set the endpoint in `tauri.conf.json` to:
   ```
   https://github.com/Meliorate-agency/port-manager/releases/latest/download/latest.json
   ```
   The `{{target}}` / `{{arch}}` / `{{current_version}}` placeholders are optional — you can serve one manifest for all platforms since the `platforms` key selects the right asset.

### Option B — static S3 / Cloudflare R2 / any static host

Same idea: upload the installer, `.sig`, and `latest.json` to a public bucket, set the endpoint to the `latest.json` URL.

## 5. Test the full loop

1. Build version `0.1.0`, install it.
2. Bump `version` in `package.json` and `src-tauri/tauri.conf.json` to `0.1.1`.
3. Build `0.1.1`, upload the new artifacts + updated `latest.json`.
4. Launch the installed `0.1.0` copy. On startup (and every 30 minutes after) the app queries the endpoint, verifies the signature against the embedded public key, and installs the update if the version is newer.

The `UpdateChecker` component in the frontend surfaces the progress banner while the download is running.

---

## Troubleshooting

- **"signature verification failed"** — your `latest.json` signature field doesn't match the installer, OR the public key in the built app doesn't match the private key that signed the installer. Rebuild after updating the `pubkey` in `tauri.conf.json`.
- **"could not fetch update"** — endpoint is unreachable or returns non-JSON. Test it with `curl`.
- **No update banner appears** — the plugin only triggers an update when the remote `version` is **strictly greater** than the running version. Versioning must be semver.
- **You lost the private key** — generate a new pair, rebuild the app with the new pubkey, and ship it as a fresh install. Existing users will need to reinstall manually. This is why backing up the private key matters.

## Security notes

- Keep `TAURI_SIGNING_PRIVATE_KEY` out of CI logs. If you use GitHub Actions, store the key contents in a repository secret and expose it as an env var only for the build step.
- The private key is the only thing that lets you publish signed updates. Treat it like a production deploy key.
- Anyone with a copy of your public key can verify signatures — that's the point — but they cannot produce new signatures.
