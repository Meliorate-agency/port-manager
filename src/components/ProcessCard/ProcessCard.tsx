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
  onDelete: (id: string) => Promise<void>;
  onEdit: (process: SavedProcess) => void;
  onContextMenu: (e: React.MouseEvent, processId: string) => void;
  contextMenuOpen: boolean;
  contextMenuPos: { x: number; y: number } | null;
  onCloseContextMenu: () => void;
}

export default function ProcessCard({
  process,
  status,
  resources,
  onStart,
  onStop,
  onDelete,
  onEdit,
  onContextMenu,
  contextMenuOpen,
  contextMenuPos,
  onCloseContextMenu,
}: ProcessCardProps) {
  const [confirmAction, setConfirmAction] = useState<"stop" | "delete" | null>(null);
  const isRunning = status && (status.status === "Running" || status.status === "Starting");
  const isStarting = status?.status === "Starting";

  // Show live ports if running, otherwise show saved last_ports
  const displayPorts = isRunning
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
        className={styles.card}
        onContextMenu={(e) => onContextMenu(e, process.id)}
      >
        <div className={`${styles.statusDot} ${statusClass}`} />
        <div className={styles.info}>
          <div className={styles.name}>{process.name}</div>
          <div className={styles.meta}>
            <span className={styles.command}>{process.command}</span>
            <span className={styles.directory}>{process.directory}</span>
          </div>
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
        <div className={styles.actions}>
          {isRunning ? (
            <button
              className={styles.stopButton}
              onClick={() => setConfirmAction("stop")}
              title="Stop process"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="1" y="1" width="12" height="12" rx="1" />
              </svg>
            </button>
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
