"use client";

import { useState, useEffect, useCallback } from "react";
import type { SavedProcess, ProcessGroup, RunningProcess, SystemPortInfo } from "@/lib/types";
import ProcessCard from "@/components/ProcessCard/ProcessCard";
import FolderGroup from "@/components/FolderGroup/FolderGroup";
import SystemPorts from "@/components/SystemPorts/SystemPorts";
import styles from "./ProcessList.module.css";

interface ContextMenuState {
  processId: string;
  x: number;
  y: number;
}

interface ProcessListProps {
  processes: SavedProcess[];
  groups: ProcessGroup[];
  runningStatus: RunningProcess[];
  systemPorts: SystemPortInfo[];
  showSystemPorts: boolean;
  searchQuery: string;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onDeleteProcess: (id: string) => Promise<void>;
  onEditProcess: (process: SavedProcess) => void;
  onDeleteGroup: (id: string) => Promise<void>;
  onRenameGroup: (id: string, newName: string) => Promise<void>;
  onToggleGroupCollapsed: (id: string) => Promise<void>;
  onKillSystem: (pid: number) => Promise<void>;
  onLoadSystemPorts: () => Promise<void>;
}

export default function ProcessList({
  processes,
  groups,
  runningStatus,
  systemPorts,
  showSystemPorts,
  searchQuery,
  onStart,
  onStop,
  onDeleteProcess,
  onEditProcess,
  onDeleteGroup,
  onRenameGroup,
  onToggleGroupCollapsed,
  onKillSystem,
  onLoadSystemPorts,
}: ProcessListProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const getStatus = (id: string) => runningStatus.find((r) => r.id === id);

  const handleProcessContextMenu = useCallback((e: React.MouseEvent, processId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ processId, x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Global click/contextmenu closes any open process context menu
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [contextMenu]);

  const filteredProcesses = processes.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.command.toLowerCase().includes(q) ||
      p.directory.toLowerCase().includes(q) ||
      getStatus(p.id)?.ports.some((port) => port.toString().includes(q)) ||
      p.last_ports?.some((port) => port.toString().includes(q))
    );
  });

  const ungrouped = filteredProcesses.filter((p) => !p.group_id);
  const hasContent = groups.length > 0 || processes.length > 0;

  const renderProcessCard = (p: SavedProcess) => (
    <ProcessCard
      key={p.id}
      process={p}
      status={getStatus(p.id)}
      onStart={onStart}
      onStop={onStop}
      onDelete={onDeleteProcess}
      onEdit={onEditProcess}
      onContextMenu={handleProcessContextMenu}
      contextMenuOpen={contextMenu?.processId === p.id}
      contextMenuPos={contextMenu?.processId === p.id ? { x: contextMenu.x, y: contextMenu.y } : null}
      onCloseContextMenu={closeContextMenu}
    />
  );

  return (
    <div className={styles.container}>
      {!hasContent ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No processes configured</div>
          <div className={styles.emptyText}>
            Click &quot;+ Process&quot; or &quot;+ Group&quot; to get started
          </div>
        </div>
      ) : (
        <>
          {groups.map((group) => {
            const groupProcesses = filteredProcesses.filter(
              (p) => p.group_id === group.id,
            );
            if (searchQuery && groupProcesses.length === 0) return null;
            return (
              <FolderGroup
                key={group.id}
                group={group}
                count={groupProcesses.length}
                onDelete={onDeleteGroup}
                onRename={onRenameGroup}
                onToggleCollapsed={onToggleGroupCollapsed}
              >
                {groupProcesses.map(renderProcessCard)}
              </FolderGroup>
            );
          })}

          {ungrouped.length > 0 && (
            <>
              {groups.length > 0 && (
                <div className={styles.sectionTitle}>Ungrouped</div>
              )}
              <div className={styles.ungrouped}>
                {ungrouped.map(renderProcessCard)}
              </div>
            </>
          )}
        </>
      )}

      {showSystemPorts ? (
        <SystemPorts
          ports={systemPorts}
          searchQuery={searchQuery}
          onKill={onKillSystem}
        />
      ) : (
        <button className={styles.loadSystemPortsButton} onClick={onLoadSystemPorts}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="8 12 12 16 16 12" />
            <line x1="12" y1="8" x2="12" y2="16" />
          </svg>
          Load System Ports
        </button>
      )}
    </div>
  );
}
