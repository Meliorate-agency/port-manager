#!/usr/bin/env node
// push-update.mjs — end-to-end release script for Port Manager.
//
// Bumps versions, builds a signed installer, commits + pushes, creates a
// GitHub Release with .exe/.sig/latest.json, and verifies the update endpoint.
//
// Usage:
//   node push-update.mjs 0.1.1 "Fix tray icon bug"
//   node push-update.mjs                             (interactive prompts)
//   node push-update.mjs 0.1.1 "notes" --skip-build  (retry without rebuilding)
//
// Requirements:
//   - Node 18+
//   - GitHub CLI (gh) installed and authenticated (`gh auth login`)
//   - .tauri/port-manager.key (private signing key) present in repo root
//   - Clean git working tree, on branch master

import { readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import os from 'node:os';

// ---- Config --------------------------------------------------------------

const REPO_ROOT = process.cwd();
const REPO_SLUG = 'Meliorate-agency/port-manager';
const GIT_AUTHOR_EMAIL = 'adrian@users.noreply.github.com';
const KEY_PATH = path.join(REPO_ROOT, '.tauri', 'port-manager.key');
const PKG_JSON = path.join(REPO_ROOT, 'package.json');
const TAURI_CONF = path.join(REPO_ROOT, 'src-tauri', 'tauri.conf.json');
const BUNDLE_DIR = path.join(
  REPO_ROOT, 'src-tauri', 'target', 'release', 'bundle', 'nsis'
);
const TOTAL_STEPS = 8;

// ---- Pretty printing -----------------------------------------------------

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m',
};
const log  = (msg) => console.log(msg);
const step = (n, msg) => log(`\n${c.cyan}${c.bold}[${n}/${TOTAL_STEPS}] ${msg}${c.reset}`);
const ok   = (msg) => log(`  ${c.green}✓${c.reset} ${msg}`);
const warn = (msg) => log(`  ${c.yellow}!${c.reset} ${msg}`);
const fail = (msg) => {
  console.error(`\n${c.red}${c.bold}✗ ${msg}${c.reset}`);
  process.exit(1);
};

// ---- Helpers -------------------------------------------------------------

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: opts.silent ? 'pipe' : 'inherit',
    cwd: REPO_ROOT,
    shell: false,
    encoding: 'utf8',
    env: opts.env || process.env,
  });
  if (r.status !== 0 && !opts.allowFail) {
    fail(`Command failed: ${cmd} ${args.join(' ')}\n${r.stderr || ''}`);
  }
  return r;
}

const runCapture = (cmd, args) =>
  run(cmd, args, { silent: true }).stdout.trim();

async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}

function compareSemver(a, b) {
  const [pa, pb] = [a, b].map(v => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { skipBuild: false };
  const positional = [];
  for (const a of args) {
    if (a === '--skip-build') flags.skipBuild = true;
    else if (a === '-h' || a === '--help') {
      console.log(`Usage: node push-update.mjs [version] [notes] [--skip-build]

  version        New version in x.y.z form (e.g. 0.1.1).
                 Omit to auto-bump the patch version (0.1.0 → 0.1.1).
  notes          Release notes (wrap in quotes). Prompted if omitted.
  --skip-build   Skip version bump + build + commit + push.
                 Use to retry release upload after a failed run.

Examples:
  node push-update.mjs                             # auto-bump patch, prompt for notes
  node push-update.mjs 0.2.0 "Big redesign"        # explicit minor bump
  node push-update.mjs 0.1.2 "Fix" --skip-build    # retry a failed release
`);
      process.exit(0);
    }
    else positional.push(a);
  }
  return { version: positional[0], notes: positional[1], ...flags };
}

async function prompt(q) {
  const rl = createInterface({ input, output });
  try { return (await rl.question(q)).trim(); }
  finally { rl.close(); }
}

function bumpVersionInFile(raw, newVersion) {
  const out = raw.replace(
    /("version"\s*:\s*")[^"]+(")/,
    `$1${newVersion}$2`
  );
  if (out === raw) return null;
  return out;
}

// ---- Main ----------------------------------------------------------------

async function main() {
  log(`${c.bold}Port Manager — release script${c.reset}`);

  const argv = parseArgs();
  let { version, notes, skipBuild } = argv;

  // ====================================================================
  // Step 1 — preflight
  // ====================================================================
  step(1, 'Preflight checks');

  if (run('gh', ['--version'], { silent: true, allowFail: true }).status !== 0) {
    fail(`GitHub CLI (gh) not found on PATH.
Install from https://cli.github.com/ then run: gh auth login`);
  }
  ok('gh installed');

  if (run('gh', ['auth', 'status'], { silent: true, allowFail: true }).status !== 0) {
    fail('gh is not authenticated. Run: gh auth login');
  }
  ok('gh authenticated');

  const gitRoot = runCapture('git', ['rev-parse', '--show-toplevel']);
  if (path.resolve(gitRoot) !== path.resolve(REPO_ROOT)) {
    fail(`Run this script from the repo root. Current: ${REPO_ROOT}, git root: ${gitRoot}`);
  }
  ok('at repo root');

  const branch = runCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'master') fail(`Current branch is "${branch}" — switch to master first.`);
  ok('on master branch');

  if (!skipBuild) {
    const status = runCapture('git', ['status', '--porcelain']);
    if (status) fail(`Working tree is not clean:\n${status}\nCommit or stash first.`);
    ok('working tree clean');
  } else {
    warn('--skip-build set: working tree check bypassed');
  }

  if (!(await fileExists(KEY_PATH))) {
    fail(`Signing key not found at ${KEY_PATH}`);
  }
  ok('signing key present');

  const pkgRaw = await readFile(PKG_JSON, 'utf8');
  const tauriRaw = await readFile(TAURI_CONF, 'utf8');
  const pkg = JSON.parse(pkgRaw);
  const tauriConf = JSON.parse(tauriRaw);
  const currentVersion = pkg.version;
  if (currentVersion !== tauriConf.version) {
    fail(`Version mismatch: package.json=${currentVersion}, tauri.conf.json=${tauriConf.version}`);
  }
  ok(`current version ${currentVersion}`);

  if (!version) {
    // Auto-bump patch: 0.1.0 → 0.1.1
    const [major, minor, patch] = currentVersion.split('.').map(Number);
    version = `${major}.${minor}.${patch + 1}`;
    ok(`auto-bumped version → ${version}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`Invalid version "${version}" — use x.y.z format.`);
  if (!skipBuild && compareSemver(version, currentVersion) <= 0) {
    fail(`New version ${version} must be greater than current ${currentVersion}`);
  }

  if (!notes) notes = await prompt('Release notes: ');
  if (!notes) fail('Release notes are required.');

  const tag = `v${version}`;

  log(`\n  ${c.bold}Releasing:${c.reset} ${currentVersion} → ${version}`);
  log(`  ${c.bold}Tag:${c.reset}       ${tag}`);
  log(`  ${c.bold}Notes:${c.reset}     ${notes}`);

  const confirm = await prompt('\nProceed? (y/N) ');
  if (confirm.toLowerCase() !== 'y') fail('Aborted by user.');

  const exePath = path.join(BUNDLE_DIR, `Port Manager_${version}_x64-setup.exe`);
  const sigPath = `${exePath}.sig`;

  // ====================================================================
  // Steps 2–5 — bump, build, commit, push  (skipped with --skip-build)
  // ====================================================================
  if (!skipBuild) {
    // Step 2 — bump versions
    step(2, 'Bumping versions');
    const newPkgRaw = bumpVersionInFile(pkgRaw, version);
    if (!newPkgRaw) fail('Could not find "version" field in package.json');
    await writeFile(PKG_JSON, newPkgRaw);
    ok(`package.json → ${version}`);

    const newTauriRaw = bumpVersionInFile(tauriRaw, version);
    if (!newTauriRaw) fail('Could not find "version" field in tauri.conf.json');
    await writeFile(TAURI_CONF, newTauriRaw);
    ok(`tauri.conf.json → ${version}`);

    // Step 3 — build
    step(3, 'Building signed installer (takes several minutes on first run)');
    const privateKey = await readFile(KEY_PATH, 'utf8');
    const buildEnv = {
      ...process.env,
      TAURI_SIGNING_PRIVATE_KEY: privateKey,
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '',
    };
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const buildResult = spawnSync(npmCmd, ['run', 'tauri:build'], {
      stdio: 'inherit', cwd: REPO_ROOT, env: buildEnv,
    });
    if (buildResult.status !== 0) {
      fail(`Build failed. Version bumps are still on disk.
Revert with: git checkout -- package.json src-tauri/tauri.conf.json`);
    }
    ok('build complete');

    if (!(await fileExists(exePath))) fail(`Installer not found: ${exePath}`);
    if (!(await fileExists(sigPath))) fail(`Signature not found: ${sigPath}`);
    ok(`artifacts: ${path.basename(exePath)} (+ .sig)`);

    // Step 4 — commit
    step(4, 'Committing version bump');
    run('git', ['add', 'package.json', 'src-tauri/tauri.conf.json']);
    run('git', [
      '-c', `user.email=${GIT_AUTHOR_EMAIL}`,
      'commit', '-m', `release: ${tag}`,
    ]);
    ok('committed');

    // Step 5 — push
    step(5, 'Pushing commit to origin/master');
    run('git', ['push', 'origin', 'master']);
    ok('pushed');
  } else {
    warn(`--skip-build: reusing existing artifacts in ${BUNDLE_DIR}`);
    if (!(await fileExists(exePath))) fail(`Installer not found: ${exePath}`);
    if (!(await fileExists(sigPath))) fail(`Signature not found: ${sigPath}`);
    // Fake step numbers so the output stays consistent
    step(2, 'Version bump — skipped');
    step(3, 'Build — skipped');
    step(4, 'Commit — skipped');
    step(5, 'Push — skipped');
  }

  // ====================================================================
  // Step 6 — create GitHub Release with .exe + .sig
  // ====================================================================
  step(6, 'Creating GitHub Release');
  const existingRelease = run(
    'gh', ['release', 'view', tag, '--repo', REPO_SLUG],
    { silent: true, allowFail: true }
  );
  if (existingRelease.status === 0) {
    warn(`Release ${tag} already exists — re-uploading assets with --clobber`);
    run('gh', [
      'release', 'upload', tag, exePath, sigPath,
      '--repo', REPO_SLUG, '--clobber',
    ]);
  } else {
    run('gh', [
      'release', 'create', tag,
      '--repo', REPO_SLUG,
      '--title', tag,
      '--notes', notes,
      exePath, sigPath,
    ]);
  }
  ok('release created with .exe and .sig');

  // ====================================================================
  // Step 7 — generate and upload latest.json
  // ====================================================================
  step(7, 'Generating and uploading latest.json');

  const assetsJson = runCapture('gh', [
    'release', 'view', tag,
    '--repo', REPO_SLUG,
    '--json', 'assets',
  ]);
  const { assets } = JSON.parse(assetsJson);
  const exeAsset = assets.find(a => a.name.endsWith('.exe'));
  if (!exeAsset) fail('Could not find uploaded .exe asset in the release');

  // Construct the public download URL. GitHub normalizes the filename on upload
  // (spaces → dots), so exeAsset.name is the canonical name to use.
  const downloadUrl =
    `https://github.com/${REPO_SLUG}/releases/download/${tag}/${exeAsset.name}`;

  const signature = (await readFile(sigPath, 'utf8')).trim();
  const latestJson = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature,
        url: downloadUrl,
      },
    },
  };

  // gh uploads each file using its on-disk basename, so we stage the payload
  // in a unique per-run subdirectory of tmpdir under the name "latest.json".
  const tmpDir = path.join(os.tmpdir(), `port-manager-release-${Date.now()}`);
  const { mkdir, rm } = await import('node:fs/promises');
  await mkdir(tmpDir, { recursive: true });
  const tmpLatest = path.join(tmpDir, 'latest.json');
  await writeFile(tmpLatest, JSON.stringify(latestJson, null, 2) + '\n');
  try {
    run('gh', [
      'release', 'upload', tag, tmpLatest,
      '--repo', REPO_SLUG, '--clobber',
    ]);
    ok('latest.json uploaded');
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  // ====================================================================
  // Step 8 — verify the update endpoint
  // ====================================================================
  step(8, 'Verifying update endpoint');
  const endpoint = `https://github.com/${REPO_SLUG}/releases/latest/download/latest.json`;
  try {
    const res = await fetch(endpoint, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (j.version !== version) {
      warn(`Endpoint returned version ${j.version}, expected ${version}.`);
      warn('GitHub CDN caching can take a moment — re-check in ~30s.');
    } else {
      ok(`endpoint returns version ${version}`);
      ok(`signature length: ${j.platforms['windows-x86_64'].signature.length} chars`);
    }
  } catch (e) {
    warn(`Endpoint check failed: ${e.message}`);
    warn('This is often transient — verify manually:');
    warn(`  ${endpoint}`);
  }

  const releaseUrl = `https://github.com/${REPO_SLUG}/releases/tag/${tag}`;
  log(`\n${c.green}${c.bold}✓ Release ${tag} is live.${c.reset}`);
  log(`  ${c.bold}Release page:${c.reset}    ${c.blue}${releaseUrl}${c.reset}`);
  log(`  ${c.bold}Update endpoint:${c.reset} ${c.blue}${endpoint}${c.reset}`);
  log(`\n  Users on older versions auto-update within 30 minutes`);
  log(`  (or on next app launch, whichever comes first).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
