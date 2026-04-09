"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { SavedProcess, ProcessResources, RunningProcess, RunMode } from "@/lib/types";
import { getProcessLogs } from "@/lib/commands";
import { stripAnsi } from "@/lib/ansi";
import { openUrl } from "@tauri-apps/plugin-opener";
import styles from "./DetailPanel.module.css";

interface DetailPanelProps {
  process: SavedProcess;
  status?: RunningProcess;
  resources?: ProcessResources;
  onClose: () => void;
  onStart: (id: string, mode?: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRestart: (id: string, mode?: string) => Promise<void>;
}

export default function DetailPanel({
  process,
  status,
  resources,
  onClose,
  onStart,
  onStop,
  onRestart,
}: DetailPanelProps) {
  const [logLines, setLogLines] = useState<string[]>([]);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [selectedMode, setSelectedMode] = useState<RunMode>("Dev");
  const offsetRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const isRunning = status && (status.status === "Running" || status.status === "Starting");
  const isStarting = status?.status === "Starting";
  const currentMode: RunMode = status?.run_mode || "Dev";

  const hasProdConfig = !!(process.prod_command || process.prod_directory || process.prod_compose_file);

  const displayCommand = (() => {
    const mode = isRunning ? currentMode : selectedMode;
    if (process.process_type === "DockerContainer") {
      return process.container_id || process.command;
    }
    if (process.process_type === "DockerCompose") {
      if (mode === "Prod" && process.prod_compose_file) return process.prod_compose_file;
      return process.compose_file || process.command;
    }
    if (mode === "Prod" && process.prod_command) return process.prod_command;
    return process.command;
  })();

  const displayDirectory = (() => {
    const mode = isRunning ? currentMode : selectedMode;
    return (mode === "Prod" && process.prod_directory)
      ? process.prod_directory
      : process.directory;
  })();

  const displayPorts = isRunning
    ? status?.ports ?? []
    : process.last_ports ?? [];

  const formatMemory = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Slide-out close handler
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 200);
  }, [onClose]);

  // Reset logs when process changes
  useEffect(() => {
    setLogLines([]);
    offsetRef.current = 0;
    setIsAutoScroll(true);
    setIsClosing(false);
  }, [process.id]);

  // Poll logs
  useEffect(() => {
    const poll = async () => {
      try {
        const result = await getProcessLogs(process.id, offsetRef.current);
        if (result.lines.length > 0) {
          setLogLines((prev) => {
            const next = [...prev, ...result.lines];
            return next.length > 2000 ? next.slice(next.length - 2000) : next;
          });
          offsetRef.current = result.offset;
        }
      } catch {
        // Process might not be running
      }
    };

    poll();
    const interval = setInterval(poll, 1500);
    return () => clearInterval(interval);
  }, [process.id]);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (isAutoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logLines, isAutoScroll]);

  const handleScroll = useCallback(() => {
    const el = logContainerRef.current;
    if (el) {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      setIsAutoScroll(atBottom);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    setIsAutoScroll(true);
    logContainerRef.current?.scrollTo({
      top: logContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  const statusLabel = isRunning
    ? isStarting ? "Starting" : "Running"
    : "Stopped";

  const statusClass = isRunning
    ? isStarting ? styles.statusStarting : styles.statusRunning
    : styles.statusStopped;

  return (
    <div className={`${styles.panel} ${isClosing ? styles.panelClosing : ""}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <div className={styles.processName}>
            {process.name}
            {isRunning && hasProdConfig && (
              <span className={`${styles.modeBadge} ${currentMode === "Prod" ? styles.modeBadgeProd : styles.modeBadgeDev}`}>
                {currentMode === "Prod" ? "PROD" : "DEV"}
              </span>
            )}
          </div>
        </div>
        <button className={styles.closeButton} onClick={handleClose} title="Close panel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Info */}
      <div className={styles.infoSection}>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Status</span>
          <span className={styles.statusBadge}>
            <span className={`${styles.statusDot} ${statusClass}`} />
            {statusLabel}
          </span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>
            {process.process_type === "DockerContainer" ? "Container" : "Command"}
          </span>
          <span className={`${styles.infoValue} ${styles.infoValueMono}`}>{displayCommand}</span>
        </div>
        {process.process_type !== "DockerContainer" && (
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Directory</span>
            <span className={`${styles.infoValue} ${styles.infoValueMono}`}>{displayDirectory}</span>
          </div>
        )}
        {isRunning && status?.pid > 0 && (
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>PID</span>
            <span className={`${styles.infoValue} ${styles.infoValueMono}`}>{status.pid}</span>
          </div>
        )}
        {displayPorts.length > 0 && (
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Ports</span>
            <div className={styles.portsRow}>
              {displayPorts.map((port) => {
                const portRes = isRunning
                  ? resources?.port_resources.find((r) => r.port === port)
                  : undefined;
                return (
                  <div key={port} className={styles.portBadge}>
                    <span className={styles.portNumber}>:{port}</span>
                    {portRes && (
                      <span className={styles.portStats}>
                        {portRes.cpu_usage.toFixed(1)}% &middot; {formatMemory(portRes.memory_bytes)}
                      </span>
                    )}
                    <button
                      className={styles.portOpenBtn}
                      onClick={() => openUrl(`http://localhost:${port}`)}
                      title={`Open http://localhost:${port} in browser`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        {hasProdConfig && !isRunning && (
          <div className={styles.modeToggle}>
            <button
              className={`${styles.modeButton} ${selectedMode === "Dev" ? styles.modeButtonActive : ""}`}
              onClick={() => setSelectedMode("Dev")}
              title="Development mode"
            >DEV</button>
            <button
              className={`${styles.modeButton} ${selectedMode === "Prod" ? styles.modeButtonActiveProd : ""}`}
              onClick={() => setSelectedMode("Prod")}
              title="Production mode"
            >PROD</button>
          </div>
        )}
        {isRunning ? (
          <>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnRestart}`}
              onClick={() => onRestart(process.id, hasProdConfig ? currentMode : undefined)}
              title="Restart"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Restart
            </button>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnStop}`}
              onClick={() => onStop(process.id)}
              title="Stop"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor">
                <rect x="1" y="1" width="12" height="12" rx="1" />
              </svg>
              Stop
            </button>
          </>
        ) : (
          <button
            className={`${styles.actionBtn} ${styles.actionBtnStart}`}
            onClick={() => onStart(process.id, hasProdConfig ? selectedMode : undefined)}
            title="Start"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor">
              <polygon points="2,0 14,7 2,14" />
            </svg>
            Start
          </button>
        )}
      </div>

      {/* Log Viewer */}
      <div className={styles.logSection}>
        <div className={styles.logHeader}>
          <span className={styles.logTitle}>Process Logs</span>
          <div className={styles.logHeaderRight}>
            <span className={styles.logCount}>{logLines.length} lines</span>
            {logLines.length > 0 && (
              <>
                <button
                  className={`${styles.copyLogsBtn} ${copiedFeedback ? styles.copyLogsBtnSuccess : ""}`}
                  onClick={() => {
                    const text = logLines.map((l) => stripAnsi(l)).join("\n");
                    navigator.clipboard.writeText(text).then(() => {
                      setCopiedFeedback(true);
                      setTimeout(() => setCopiedFeedback(false), 2000);
                    });
                  }}
                  title="Copy logs to clipboard"
                >
                  {copiedFeedback ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
                <button
                  className={styles.clearLogsBtn}
                  onClick={() => {
                    setLogLines([]);
                    // Keep offset so cleared lines aren't re-fetched
                  }}
                  title="Clear logs"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
        {logLines.length > 0 ? (
          <div
            ref={logContainerRef}
            className={styles.logViewer}
            onScroll={handleScroll}
          >
            {logLines.map((line, i) => (
              <div
                key={i}
                className={line.startsWith("[stderr]") ? styles.logLineStderr : styles.logLine}
              >
                {stripAnsi(line)}
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.logEmpty}>
            {isRunning
              ? "Waiting for output..."
              : "No logs available. Start the process to see output."}
          </div>
        )}
        {logLines.length > 0 && !isAutoScroll && (
          <button className={styles.scrollToBottom} onClick={scrollToBottom}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Bottom
          </button>
        )}
      </div>
    </div>
  );
}
