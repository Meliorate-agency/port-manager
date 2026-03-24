"use client";

import { useState } from "react";
import styles from "./AddGroupModal.module.css";

interface AddGroupModalProps {
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}

export default function AddGroupModal({ onSave, onClose }: AddGroupModalProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(name.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>Add Group</div>
        <div className={styles.field}>
          <label className={styles.label}>Group Name</label>
          <input
            className={styles.input}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) handleSave();
            }}
            placeholder="Development Servers"
            autoFocus
          />
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
