"use client";

import ThemeToggle from "@/components/ThemeToggle/ThemeToggle";
import UpdateChecker from "@/components/UpdateChecker/UpdateChecker";
import styles from "./Toolbar.module.css";

interface ToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddProcess: () => void;
  onAddGroup: () => void;
  showSystemPorts: boolean;
  onToggleSystemPorts: (show: boolean) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export default function Toolbar({
  searchQuery,
  onSearchChange,
  onAddProcess,
  onAddGroup,
  showSystemPorts,
  onToggleSystemPorts,
  theme,
  onToggleTheme,
}: ToolbarProps) {
  return (
    <div className={styles.toolbar}>
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

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            className={styles.checkboxInput}
            checked={showSystemPorts}
            onChange={(e) => onToggleSystemPorts(e.target.checked)}
          />
          <span className={styles.checkboxVisual}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          System Ports
        </label>
      </div>

      <div className={styles.spacer} />

      <button className={styles.actionButton} onClick={onAddProcess}>
        + Process
      </button>

      <button className={styles.actionButton} onClick={onAddGroup} style={{ marginRight: 20 }}>
        + Group
      </button>

      <UpdateChecker />

      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
    </div>
  );
}
