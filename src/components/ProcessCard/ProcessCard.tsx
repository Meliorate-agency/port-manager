"use client";

import { useState } from "react";
import type { SavedProcess, ProcessResources, RunningProcess } from "@/lib/types";
import ConfirmDialog from "@/components/ConfirmDialog/ConfirmDialog";
import styles from "./ProcessCard.module.css";

interface ProcessCardProps {
  process: SavedProcess;
  status?: RunningProcess;
  resources?: ProcessResources;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRestart: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (process: SavedProcess) => void;
  onContextMenu: (e: React.MouseEvent, processId: string) => void;
  contextMenuOpen: boolean;
  contextMenuPos: { x: number; y: number } | null;
  onCloseContextMenu: () => void;
  onGripMouseDown?: (e: React.MouseEvent, processId: string) => void;
  isDragOver?: boolean;
  isDragging?: boolean;
}

export default function ProcessCard({
  process,
  status,
  resources,
  onStart,
  onStop,
  onRestart,
  onDelete,
  onEdit,
  onContextMenu,
  contextMenuOpen,
  contextMenuPos,
  onCloseContextMenu,
  onGripMouseDown,
  isDragOver,
  isDragging,
}: ProcessCardProps) {
  const [confirmAction, setConfirmAction] = useState<"stop" | "delete" | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const isSelf = process.id === "port-manager-self";
  const isRunning = isSelf || (status && (status.status === "Running" || status.status === "Starting"));
  const isStarting = !isSelf && status?.status === "Starting";

  // Show live ports if running, otherwise show saved last_ports
  // For self process, always show last_ports since it's not tracked in process manager
  const displayPorts = isSelf
    ? process.last_ports ?? []
    : isRunning
      ? status?.ports ?? []
      : process.last_ports ?? [];

  const statusClass = isRunning
    ? isStarting
      ? styles.statusStarting
      : styles.statusRunning
    : styles.statusStopped;

  const formatMemory = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      await onRestart(process.id);
    } finally {
      setTimeout(() => setIsRestarting(false), 1500);
    }
  };

  const handleConfirm = async () => {
    if (confirmAction === "stop") {
      await onStop(process.id);
    } else if (confirmAction === "delete") {
      if (isRunning) {
        await onStop(process.id);
      }
      await onDelete(process.id);
    }
    setConfirmAction(null);
  };

  return (
    <>
      <div
        data-process-id={process.id}
        className={`${styles.card} ${isSelf ? styles.selfCard : ""} ${isRestarting ? styles.restarting : ""} ${isDragOver ? styles.dragOver : ""} ${isDragging ? styles.dragging : ""}`}
        onContextMenu={(e) => !isSelf && onContextMenu(e, process.id)}
      >
        {!isSelf && onGripMouseDown && (
          <div
            className={styles.dragHandle}
            title="Drag to reorder"
            onMouseDown={(e) => onGripMouseDown(e, process.id)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <circle cx="3.5" cy="2" r="1.2" />
              <circle cx="8.5" cy="2" r="1.2" />
              <circle cx="3.5" cy="6" r="1.2" />
              <circle cx="8.5" cy="6" r="1.2" />
              <circle cx="3.5" cy="10" r="1.2" />
              <circle cx="8.5" cy="10" r="1.2" />
            </svg>
          </div>
        )}
        <div className={`${styles.statusDot} ${statusClass}`} />
        <div className={styles.info}>
          <div className={styles.name}>
            {process.process_type === "DockerCompose" && (
              <svg className={styles.dockerIcon} viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M13.98 11.08h2.12a.19.19 0 0 0 .19-.19V9.01a.19.19 0 0 0-.19-.19h-2.12a.19.19 0 0 0-.19.19v1.88c0 .1.09.19.19.19m-2.95-5.43h2.12a.19.19 0 0 0 .19-.19V3.58a.19.19 0 0 0-.19-.19h-2.12a.19.19 0 0 0-.19.19v1.88c0 .11.09.19.19.19m0 2.71h2.12a.19.19 0 0 0 .19-.19V6.29a.19.19 0 0 0-.19-.19h-2.12a.19.19 0 0 0-.19.19v1.88c0 .11.09.19.19.19m-2.93 0h2.12a.19.19 0 0 0 .19-.19V6.29a.19.19 0 0 0-.19-.19H8.1a.19.19 0 0 0-.19.19v1.88c0 .11.08.19.19.19m-2.96 0h2.12a.19.19 0 0 0 .19-.19V6.29a.19.19 0 0 0-.19-.19H5.14a.19.19 0 0 0-.19.19v1.88c0 .11.09.19.19.19m5.89 2.72h2.12a.19.19 0 0 0 .19-.19V9.01a.19.19 0 0 0-.19-.19h-2.12a.19.19 0 0 0-.19.19v1.88c0 .1.09.19.19.19m-2.93 0h2.12a.19.19 0 0 0 .19-.19V9.01a.19.19 0 0 0-.19-.19H8.1a.19.19 0 0 0-.19.19v1.88c0 .1.08.19.19.19m-2.96 0h2.12a.19.19 0 0 0 .19-.19V9.01a.19.19 0 0 0-.19-.19H5.14a.19.19 0 0 0-.19.19v1.88c0 .1.09.19.19.19m-2.92 0h2.12a.19.19 0 0 0 .19-.19V9.01a.19.19 0 0 0-.19-.19H2.22a.19.19 0 0 0-.19.19v1.88c0 .1.08.19.19.19M23.7 11.59c-.23-.16-.53-.22-.83-.22-.09 0-.19.01-.29.03a3.04 3.04 0 0 0-1.49-1.41l-.3-.16-.17.3a3.3 3.3 0 0 0-.42 1.27c-.07.51-.01.99.19 1.41-.28.16-.73.32-1.36.32H.78l-.08.48c-.12.78-.12 3.21 1.05 5.1 .89 1.44 2.24 2.17 4.01 2.17.44 0 .91-.04 1.41-.13 1.8-.34 3.41-1.08 4.72-2.27a9.02 9.02 0 0 0 2.32-3.53h.2c1.24 0 2-.51 2.43-.94.29-.27.5-.59.68-.94l.1-.19-.17-.12z" />
              </svg>
            )}
            {process.name}
          </div>
          {!isSelf && (
            <div className={styles.meta}>
              <span className={styles.command}>
                {process.process_type === "DockerCompose" && process.compose_file
                  ? process.compose_file
                  : process.command}
              </span>
              <span className={styles.directory}>{process.directory}</span>
            </div>
          )}
        </div>
        {displayPorts.length > 0 && (
          <div className={styles.ports}>
            {displayPorts.map((port) => {
              const portRes = isRunning
                ? resources?.port_resources.find((r) => r.port === port)
                : undefined;
              return (
                <div
                  key={port}
                  className={`${styles.portCard} ${!isRunning ? styles.portCardDimmed : ""}`}
                >
                  <span className={styles.portNumber}>:{port}</span>
                  {portRes && (
                    <span className={styles.portStats}>
                      {portRes.cpu_usage.toFixed(1)}% &middot; {formatMemory(portRes.memory_bytes)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!isSelf && (
          <div className={styles.actions}>
            {isRunning ? (
              <>
                <button
                  className={styles.restartButton}
                  onClick={handleRestart}
                  disabled={isRestarting}
                  title="Restart process"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M1 4v6h6" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                </button>
                <button
                  className={styles.stopButton}
                  onClick={() => setConfirmAction("stop")}
                  title="Stop process"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="1" y="1" width="12" height="12" rx="1" />
                  </svg>
                </button>
              </>
            ) : (
              <button
                className={styles.playButton}
                onClick={() => onStart(process.id)}
                title="Start process"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <polygon points="2,0 14,7 2,14" />
                </svg>
              </button>
            )}
            <button
              className={styles.deleteButton}
              onClick={() => setConfirmAction("delete")}
              title="Remove process"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {contextMenuOpen && contextMenuPos && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              onEdit(process);
              onCloseContextMenu();
            }}
          >
            <svg className={styles.contextMenuIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>
          <button
            className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`}
            onClick={() => {
              setConfirmAction("delete");
              onCloseContextMenu();
            }}
          >
            <svg className={styles.contextMenuIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete
          </button>
        </div>
      )}

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction === "stop" ? "Stop Process" : "Remove Process"}
          message={
            confirmAction === "stop"
              ? `Stop "${process.name}"? This will kill the process and all its children.`
              : `Remove "${process.name}" from your list?${isRunning ? " The running process will be stopped." : ""}`
          }
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </>
  );
}
