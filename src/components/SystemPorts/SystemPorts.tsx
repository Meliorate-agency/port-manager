"use client";

import { useState } from "react";
import type { SystemPortInfo } from "@/lib/types";
import PortBadge from "@/components/PortBadge/PortBadge";
import ConfirmDialog from "@/components/ConfirmDialog/ConfirmDialog";
import styles from "./SystemPorts.module.css";

interface SystemPortsProps {
  ports: SystemPortInfo[];
  searchQuery: string;
  onKill: (pid: number) => Promise<void>;
}

export default function SystemPorts({ ports, searchQuery, onKill }: SystemPortsProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [killTarget, setKillTarget] = useState<{ pid: number; name: string } | null>(null);

  const filtered = ports.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.process_name.toLowerCase().includes(q) ||
      p.local_port.toString().includes(q) ||
      p.pid.toString().includes(q)
    );
  });

  // Deduplicate by PID+port
  const unique = filtered.reduce<SystemPortInfo[]>((acc, port) => {
    const key = `${port.pid}-${port.local_port}-${port.protocol}`;
    if (!acc.find((p) => `${p.pid}-${p.local_port}-${p.protocol}` === key)) {
      acc.push(port);
    }
    return acc;
  }, []);

  // Sort by port
  const sorted = unique.sort((a, b) => a.local_port - b.local_port);

  return (
    <div className={styles.section}>
      <div className={styles.header} onClick={() => setIsOpen(!isOpen)}>
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className={styles.title}>System Ports</span>
        <span className={styles.count}>{sorted.length}</span>
      </div>
      {isOpen && sorted.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Process</th>
              <th>PID</th>
              <th>Protocol</th>
              <th>Port</th>
              <th>State</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((port, i) => (
              <tr key={`${port.pid}-${port.local_port}-${port.protocol}-${i}`}>
                <td className={styles.processName}>{port.process_name}</td>
                <td className={styles.pid}>{port.pid}</td>
                <td className={styles.protocol}>{port.protocol}</td>
                <td>
                  <PortBadge port={port.local_port} />
                </td>
                <td className={styles.state}>{port.state}</td>
                <td>
                  <button
                    className={styles.killButton}
                    onClick={() => setKillTarget({ pid: port.pid, name: port.process_name })}
                    title="Kill process"
                  >
                    <svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor">
                      <rect x="1" y="1" width="12" height="12" rx="1" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isOpen && sorted.length === 0 && (
        <div style={{ padding: "16px 12px", color: "var(--text-muted)", fontSize: "13px" }}>
          No listening ports found
        </div>
      )}
      {killTarget && (
        <ConfirmDialog
          title="Kill Process"
          message={`Kill "${killTarget.name}" (PID ${killTarget.pid})? This will terminate the process and all its children.`}
          onConfirm={async () => {
            await onKill(killTarget.pid);
            setKillTarget(null);
          }}
          onCancel={() => setKillTarget(null)}
        />
      )}
    </div>
  );
}
