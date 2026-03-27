"use client";

import { useState } from "react";
import type { SavedProcess, ProcessGroup, ProcessType } from "@/lib/types";
import styles from "./EditProcessModal.module.css";

interface EditProcessModalProps {
  process: SavedProcess;
  groups: ProcessGroup[];
  onSave: (id: string, data: Partial<Omit<SavedProcess, "id">>) => Promise<void>;
  onClose: () => void;
}

export default function EditProcessModal({
  process,
  groups,
  onSave,
  onClose,
}: EditProcessModalProps) {
  const [name, setName] = useState(process.name);
  const [command, setCommand] = useState(process.command);
  const [directory, setDirectory] = useState(process.directory);
  const [groupId, setGroupId] = useState<string | null>(process.group_id);
  const [processType, setProcessType] = useState<ProcessType>(process.process_type || "Command");
  const [composeFile, setComposeFile] = useState(process.compose_file || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDocker = processType === "DockerCompose";
  const canSave = name.trim() && directory.trim() && (isDocker ? composeFile.trim() : command.trim());

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(process.id, {
        name: name.trim(),
        command: isDocker
          ? `docker compose -f ${composeFile.trim()} up -d`
          : command.trim(),
        directory: directory.trim(),
        group_id: groupId,
        process_type: processType,
        compose_file: isDocker ? composeFile.trim() : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canSave) {
      handleSave();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>Edit Process</div>

        <div className={styles.field}>
          <label className={styles.label}>Type</label>
          <select
            className={styles.select}
            value={processType}
            onChange={(e) => setProcessType(e.target.value as ProcessType)}
          >
            <option value="Command">Command</option>
            <option value="DockerCompose">Docker Compose</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Name</label>
          <input
            className={styles.input}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>

        {isDocker ? (
          <div className={styles.field}>
            <label className={styles.label}>Compose File</label>
            <input
              className={styles.input}
              type="text"
              value={composeFile}
              onChange={(e) => setComposeFile(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="docker/docker-compose.yml"
            />
          </div>
        ) : (
          <div className={styles.field}>
            <label className={styles.label}>Command</label>
            <input
              className={styles.input}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label}>Directory</label>
          <input
            className={styles.input}
            type="text"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            onKeyDown={handleKeyDown}
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

        {error && <div className={styles.error}>{error}</div>}

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
