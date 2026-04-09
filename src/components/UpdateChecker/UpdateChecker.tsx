"use client";

import { useEffect, useState } from "react";
import styles from "./UpdateChecker.module.css";

interface UpdateInfo {
  version: string;
  body: string | null;
}

export default function UpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!cancelled && update) {
          setUpdateAvailable({
            version: update.version,
            body: update.body ?? null,
          });
        }
      } catch (err) {
        // Silently ignore update check failures (e.g. no internet, no pubkey configured yet)
        console.debug("Update check skipped:", err);
      }
    }

    // Check on mount, then every 30 minutes
    checkForUpdate();
    const interval = setInterval(checkForUpdate, 30 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        // App will restart automatically after install on Windows
      }
    } catch (err) {
      console.error("Update install failed:", err);
      setInstalling(false);
    }
  };

  if (!updateAvailable || dismissed) return null;

  return (
    <div className={styles.banner}>
      <div className={styles.info}>
        <svg className={styles.icon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="8 12 12 8 16 12" />
          <line x1="12" y1="16" x2="12" y2="8" />
        </svg>
        <span>
          Update <strong>v{updateAvailable.version}</strong> available
        </span>
      </div>
      <div className={styles.actions}>
        <button
          className={styles.installButton}
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? "Installing..." : "Install & Restart"}
        </button>
        <button
          className={styles.dismissButton}
          onClick={() => setDismissed(true)}
          title="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
