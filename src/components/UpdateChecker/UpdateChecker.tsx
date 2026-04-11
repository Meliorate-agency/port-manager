"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./UpdateChecker.module.css";

type Status =
  | "idle"
  | "checking"
  | "update-available"
  | "up-to-date"
  | "installing"
  | "error";

interface UpdateInfo {
  version: string;
  body: string | null;
}

export default function UpdateChecker() {
  const [status, setStatus] = useState<Status>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Load current app version once
  useEffect(() => {
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        setCurrentVersion(await getVersion());
      } catch {
        // Not running inside Tauri (web preview) — leave empty
      }
    })();
  }, []);

  // Silent background check on mount, then every 30 minutes
  const runCheck = useCallback(async (manual: boolean): Promise<void> => {
    if (manual) setStatus("checking");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setUpdateInfo({ version: update.version, body: update.body ?? null });
        setStatus("update-available");
        setDismissed(false);
      } else {
        setUpdateInfo(null);
        setStatus("up-to-date");
      }
    } catch (err) {
      console.debug("Update check failed:", err);
      if (manual) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } else {
        // Silent failure on background checks — keep previous state
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const silent = async () => {
      if (cancelled) return;
      await runCheck(false);
    };
    silent();
    const interval = setInterval(silent, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runCheck]);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  const handleBellClick = () => {
    if (popoverOpen) {
      setPopoverOpen(false);
      return;
    }
    setPopoverOpen(true);
    // If we don't already know about an update, trigger a manual re-check
    if (status !== "update-available") {
      runCheck(true);
    }
  };

  const handleInstall = async () => {
    setStatus("installing");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        // App restarts automatically on Windows after install.
      } else {
        setStatus("up-to-date");
        setUpdateInfo(null);
      }
    } catch (err) {
      console.error("Update install failed:", err);
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setPopoverOpen(false);
  };

  const showBadge = status === "update-available" && !dismissed;

  return (
    <div className={styles.wrapper}>
      <button
        ref={buttonRef}
        className={styles.button}
        onClick={handleBellClick}
        title={showBadge ? `Update v${updateInfo?.version} available` : "Check for updates"}
        disabled={status === "installing"}
      >
        <svg
          className={`${styles.icon} ${status === "checking" ? styles.pulsing : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {showBadge && <span className={styles.badge}>1</span>}
      </button>

      {popoverOpen && (
        <div ref={popoverRef} className={styles.popover} role="dialog">
          {status === "checking" && (
            <div className={styles.row}>
              <span className={styles.spinner} aria-hidden />
              <span>Checking for updates…</span>
            </div>
          )}

          {status === "up-to-date" && (
            <>
              <div className={styles.rowTop}>
                <svg
                  className={styles.checkIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <div>
                  <div className={styles.title}>You&apos;re on the latest version</div>
                  {currentVersion && (
                    <div className={styles.subtitle}>v{currentVersion}</div>
                  )}
                </div>
              </div>
              <button
                className={styles.secondaryButton}
                onClick={() => runCheck(true)}
              >
                Check again
              </button>
            </>
          )}

          {status === "update-available" && updateInfo && (
            <>
              <div className={styles.title}>
                Update available:{" "}
                <strong className={styles.version}>v{updateInfo.version}</strong>
              </div>
              {currentVersion && (
                <div className={styles.subtitle}>Installed: v{currentVersion}</div>
              )}
              {updateInfo.body && (
                <div className={styles.notes}>{updateInfo.body}</div>
              )}
              <div className={styles.actions}>
                <button className={styles.primaryButton} onClick={handleInstall}>
                  Install &amp; Restart
                </button>
                <button className={styles.secondaryButton} onClick={handleDismiss}>
                  Dismiss
                </button>
              </div>
            </>
          )}

          {status === "installing" && (
            <div className={styles.row}>
              <span className={styles.spinner} aria-hidden />
              <span>Installing update…</span>
            </div>
          )}

          {status === "error" && (
            <>
              <div className={styles.title}>Couldn&apos;t check for updates</div>
              {errorMsg && <div className={styles.errorMsg}>{errorMsg}</div>}
              <button
                className={styles.secondaryButton}
                onClick={() => runCheck(true)}
              >
                Try again
              </button>
            </>
          )}

          {status === "idle" && (
            <div className={styles.row}>
              <span>No update information yet.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
