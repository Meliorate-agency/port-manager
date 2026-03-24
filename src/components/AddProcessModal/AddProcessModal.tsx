"use client";

import { useState } from "react";
import type { ProcessGroup } from "@/lib/types";
import styles from "./AddProcessModal.module.css";

interface AddProcessModalProps {
  groups: ProcessGroup[];
  onSave: (data: {
    name: string;
    command: string;
    directory: string;
    group_id: string | null;
  }) => Promise<void>;
  onClose: () => void;
}

export default function AddProcessModal({
  groups,
  onSave,
  onClose,
}: AddProcessModalProps) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [directory, setDirectory] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim() && command.trim() && directory.trim();

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        command: command.trim(),
        directory: directory.trim(),
        group_id: groupId,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canSave) {
      handleSave();
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>Add Process</div>

        <div className={styles.field}>
          <label className={styles.label}>Name</label>
          <input
            className={styles.input}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="My Dev Server"
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Command</label>
          <input
            className={styles.input}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="npm run dev"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Directory</label>
          <input
            className={styles.input}
            type="text"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="C:\Projects\my-app"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Group (optional)</label>
          <select
            className={styles.select}
            value={groupId || ""}
            onChange={(e) => setGroupId(e.target.value || null)}
          >
            <option value="">None</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button
            className={styles.saveButton}
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
