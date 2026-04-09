"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { SavedProcess, ProcessGroup, ProcessResources, RunningProcess, SystemPortInfo } from "@/lib/types";
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
  processResources: Map<string, ProcessResources>;
  showSystemPorts: boolean;
  searchQuery: string;
  onStart: (id: string, mode?: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRestart: (id: string, mode?: string) => Promise<void>;
  onReorderProcesses: (processes: SavedProcess[]) => Promise<void>;
  onDeleteProcess: (id: string) => Promise<void>;
  onEditProcess: (process: SavedProcess) => void;
  onDeleteGroup: (id: string) => Promise<void>;
  onRenameGroup: (id: string, newName: string) => Promise<void>;
  onToggleGroupCollapsed: (id: string) => Promise<void>;
  onKillSystem: (pid: number) => Promise<void>;
  onLoadSystemPorts: () => Promise<void>;
  onSelectProcess?: (id: string) => void;
}

export default function ProcessList({
  processes,
  groups,
  runningStatus,
  systemPorts,
  processResources,
  showSystemPorts,
  searchQuery,
  onStart,
  onStop,
  onRestart,
  onReorderProcesses,
  onDeleteProcess,
  onEditProcess,
  onDeleteGroup,
  onRenameGroup,
  onToggleGroupCollapsed,
  onKillSystem,
  onLoadSystemPorts,
  onSelectProcess,
}: ProcessListProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [folderMenuCloseCounter, setFolderMenuCloseCounter] = useState(0);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const groupRectsRef = useRef<Map<string, DOMRect>>(new Map());

  const getStatus = (id: string) => runningStatus.find((r) => r.id === id);

  const handleProcessContextMenu = useCallback((e: React.MouseEvent, processId: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Close any open folder context menus
    setFolderMenuCloseCounter((c) => c + 1);
    setContextMenu({ processId, x: e.clientX, y: e.clientY });
  }, []);

  const handleFolderContextMenuOpen = useCallback(() => {
    // Close process context menu and other folder menus
    setContextMenu(null);
    setFolderMenuCloseCounter((c) => c + 1);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

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

  const selfProcess = processes.find((p) => p.id === "port-manager-self");

  const filteredProcesses = processes.filter((p) => {
    if (p.id === "port-manager-self") return false;
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

  // --- Mouse-based drag-and-drop ---
  const registerCardRef = useCallback((processId: string, el: HTMLDivElement | null) => {
    if (el) {
      cardRectsRef.current.set(processId, el.getBoundingClientRect());
    }
  }, []);

  const registerGroupRef = useCallback((groupId: string, el: HTMLDivElement | null) => {
    if (el) {
      groupRectsRef.current.set(groupId, el.getBoundingClientRect());
    }
  }, []);

  const handleGripMouseDown = useCallback((e: React.MouseEvent, processId: string) => {
    e.preventDefault();
    // Snapshot all card and group rects at drag start
    if (containerRef.current) {
      const cards = containerRef.current.querySelectorAll<HTMLDivElement>("[data-process-id]");
      cardRectsRef.current.clear();
      cards.forEach((card) => {
        const id = card.dataset.processId!;
        cardRectsRef.current.set(id, card.getBoundingClientRect());
      });
      const groupHeaders = containerRef.current.querySelectorAll<HTMLDivElement>("[data-group-id]");
      groupRectsRef.current.clear();
      groupHeaders.forEach((header) => {
        const id = header.dataset.groupId!;
        groupRectsRef.current.set(id, header.getBoundingClientRect());
      });
    }
    setDraggedId(processId);
  }, []);

  useEffect(() => {
    if (!draggedId) return;

    let rafId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const y = e.clientY;

        // Check process cards
        let foundCard: string | null = null;
        for (const [id, rect] of cardRectsRef.current.entries()) {
          if (id !== draggedId && y >= rect.top && y <= rect.bottom) {
            foundCard = id;
            break;
          }
        }

        if (foundCard) {
          setDragOverId(foundCard);
          setDragOverGroupId(null);
          return;
        }

        // Check group headers
        let foundGroup: string | null = null;
        for (const [id, rect] of groupRectsRef.current.entries()) {
          if (y >= rect.top && y <= rect.bottom) {
            foundGroup = id;
            break;
          }
        }

        if (foundGroup) {
          setDragOverGroupId(foundGroup);
          setDragOverId(null);
        } else {
          setDragOverId(null);
          setDragOverGroupId(null);
        }
      });
    };

    const handleMouseUp = () => {
      if (dragOverId) {
        // Drop onto a process card — reorder and adopt its group
        const allProcesses = [...processes];
        const fromIdx = allProcesses.findIndex((p) => p.id === draggedId);
        const toIdx = allProcesses.findIndex((p) => p.id === dragOverId);
        if (fromIdx !== -1 && toIdx !== -1) {
          const targetGroupId = allProcesses[toIdx].group_id;
          const [moved] = allProcesses.splice(fromIdx, 1);
          moved.group_id = targetGroupId;
          const newToIdx = allProcesses.findIndex((p) => p.id === dragOverId);
          allProcesses.splice(newToIdx, 0, moved);
          onReorderProcesses(allProcesses);
        }
      } else if (dragOverGroupId) {
        // Drop onto a folder header — move into that group
        const groupId = dragOverGroupId === "ungrouped" ? null : dragOverGroupId;
        const allProcesses = [...processes];
        const fromIdx = allProcesses.findIndex((p) => p.id === draggedId);
        if (fromIdx !== -1) {
          allProcesses[fromIdx] = { ...allProcesses[fromIdx], group_id: groupId };
          const [moved] = allProcesses.splice(fromIdx, 1);
          const lastInGroup = allProcesses.reduce((last, p, i) => p.group_id === groupId ? i : last, -1);
          allProcesses.splice(lastInGroup + 1, 0, moved);
          onReorderProcesses(allProcesses);
        }
      }

      setDraggedId(null);
      setDragOverId(null);
      setDragOverGroupId(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [draggedId, dragOverId, dragOverGroupId, processes, onReorderProcesses]);

  const renderProcessCard = (p: SavedProcess, grouped = false) => (
    <ProcessCard
      key={p.id}
      process={p}
      status={getStatus(p.id)}
      resources={processResources.get(p.id)}
      isGrouped={grouped}
      onStart={onStart}
      onStop={onStop}
      onRestart={onRestart}
      onDelete={onDeleteProcess}
      onEdit={onEditProcess}
      onContextMenu={handleProcessContextMenu}
      contextMenuOpen={contextMenu?.processId === p.id}
      contextMenuPos={contextMenu?.processId === p.id ? { x: contextMenu.x, y: contextMenu.y } : null}
      onCloseContextMenu={closeContextMenu}
      onGripMouseDown={!searchQuery ? handleGripMouseDown : undefined}
      isDragOver={dragOverId === p.id}
      isDragging={draggedId === p.id}
      onSelect={onSelectProcess}
    />
  );

  return (
    <div className={styles.container} ref={containerRef}>
      {selfProcess && renderProcessCard(selfProcess)}

      {!hasContent ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No processes configured</div>
          <div className={styles.emptyText}>
            Click &quot;+ Process&quot; or &quot;+ Group&quot; to get started
          </div>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {groups.map((group) => {
              const groupProcesses = filteredProcesses.filter(
                (p) => p.group_id === group.id,
              );
              if (searchQuery && groupProcesses.length === 0) return null;
              const hasRunning = groupProcesses.some((p) => {
                const s = getStatus(p.id);
                return s && (s.status === "Running" || s.status === "Starting");
              });
              const hasStopped = groupProcesses.some((p) => {
                const s = getStatus(p.id);
                return !s || s.status === "Stopped";
              });
              return (
                <FolderGroup
                  key={group.id}
                  group={group}
                  count={groupProcesses.length}
                  hasRunning={hasRunning}
                  hasStopped={hasStopped}
                  onDelete={onDeleteGroup}
                  onRename={onRenameGroup}
                  onToggleCollapsed={onToggleGroupCollapsed}
                  onStartAll={async () => {
                    for (const p of groupProcesses) {
                      const s = getStatus(p.id);
                      if (!s || s.status === "Stopped") {
                        await onStart(p.id);
                      }
                    }
                  }}
                  onStopAll={async () => {
                    for (const p of groupProcesses) {
                      const s = getStatus(p.id);
                      if (s && (s.status === "Running" || s.status === "Starting")) {
                        await onStop(p.id);
                      }
                    }
                  }}
                  isDragOver={dragOverGroupId === group.id}
                  registerRef={registerGroupRef}
                  forceCloseMenu={folderMenuCloseCounter}
                  onContextMenuOpen={handleFolderContextMenuOpen}
                >
                  {groupProcesses.map((p) => renderProcessCard(p, true))}
                </FolderGroup>
              );
            })}
          </div>

          {ungrouped.length > 0 && (
            <>
              {groups.length > 0 && (
                <div
                  className={`${styles.sectionTitle} ${dragOverGroupId === "ungrouped" ? styles.sectionTitleDragOver : ""}`}
                  data-group-id="ungrouped"
                >
                  Ungrouped
                </div>
              )}
              <div className={styles.ungrouped}>
                {ungrouped.map((p) => renderProcessCard(p))}
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
