"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ProcessGroup } from "@/lib/types";
import ConfirmDialog from "@/components/ConfirmDialog/ConfirmDialog";
import styles from "./FolderGroup.module.css";

interface FolderGroupProps {
  group: ProcessGroup;
  count: number;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, newName: string) => Promise<void>;
  onToggleCollapsed: (id: string) => Promise<void>;
  children: React.ReactNode;
}

interface ContextMenuPos {
  x: number;
  y: number;
}

export default function FolderGroup({
  group,
  count,
  onDelete,
  onRename,
  onToggleCollapsed,
  children,
}: FolderGroupProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuPos | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(group.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const isOpen = !group.collapsed;

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
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

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const handleRenameSubmit = async () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== group.name) {
      await onRename(group.id, trimmed);
    }
    setIsRenaming(false);
  };

  return (
    <div className={styles.group}>
      <div
        className={styles.header}
        onClick={() => onToggleCollapsed(group.id)}
        onContextMenu={handleContextMenu}
      >
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <svg className={styles.folderIcon} viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
        </svg>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className={styles.renameInput}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") {
                setRenameValue(group.name);
                setIsRenaming(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={styles.name}>{group.name}</span>
        )}
        <span className={styles.count}>{count}</span>
      </div>

      {isOpen && (
        count > 0 ? (
          <div className={styles.children}>{children}</div>
        ) : (
          <div className={styles.emptyChildren}>No processes in this group</div>
        )
      )}

      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              setRenameValue(group.name);
              setIsRenaming(true);
              setContextMenu(null);
            }}
          >
            <svg className={styles.contextMenuIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Rename
          </button>
          <button
            className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`}
            onClick={() => {
              setShowConfirm(true);
              setContextMenu(null);
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

      {showConfirm && (
        <ConfirmDialog
          title="Remove Group"
          message={`Remove group "${group.name}"? Processes will be moved to ungrouped.`}
          onConfirm={async () => {
            await onDelete(group.id);
            setShowConfirm(false);
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
