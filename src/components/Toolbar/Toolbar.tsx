"use client";

import { useState } from "react";
import ThemeToggle from "@/components/ThemeToggle/ThemeToggle";
import styles from "./Toolbar.module.css";

interface ToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddProcess: () => void;
  onAddGroup: () => void;
  onRefresh: () => Promise<void>;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export default function Toolbar({
  searchQuery,
  onSearchChange,
  onAddProcess,
  onAddGroup,
  onRefresh,
  theme,
  onToggleTheme,
}: ToolbarProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.title}>Port Manager</div>

      <div className={styles.searchWrapper}>
        <svg
          className={styles.searchIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className={styles.searchInput}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search processes, ports..."
        />
      </div>

      <div className={styles.spacer} />

      <button className={styles.actionButton} onClick={onAddProcess}>
        + Process
      </button>

      <button className={styles.actionButton} onClick={onAddGroup}>
        + Group
      </button>

      <button
        className={styles.refreshButton}
        onClick={handleRefresh}
        title="Refresh ports"
        disabled={refreshing}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={refreshing ? styles.spinning : ""}
        >
          <path d="M21 12a9 9 0 1 1-9-9" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
      </button>

      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
    </div>
  );
}
