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
  const [showProd, setShowProd] = useState(
    !!(process.prod_command || process.prod_directory || process.prod_compose_file)
  );
  const [prodCommand, setProdCommand] = useState(process.prod_command || "");
  const [prodDirectory, setProdDirectory] = useState(process.prod_directory || "");
  const [prodComposeFile, setProdComposeFile] = useState(process.prod_compose_file || "");
  const [containerId, setContainerId] = useState(process.container_id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDocker = processType === "DockerCompose";
  const isContainer = processType === "DockerContainer";
  const canSave = name.trim() && (
    isContainer
      ? containerId.trim()
      : directory.trim() && (isDocker ? composeFile.trim() : command.trim())
  );

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(process.id, {
        name: name.trim(),
        command: isDocker
          ? `docker compose -f ${composeFile.trim()} up -d`
          : isContainer
            ? `docker start ${containerId.trim()}`
            : command.trim(),
        directory: isContainer ? "." : directory.trim(),
        group_id: groupId,
        process_type: processType,
        compose_file: isDocker ? composeFile.trim() : null,
        prod_command: showProd && !isDocker && !isContainer && prodCommand.trim() ? prodCommand.trim() : null,
        prod_directory: showProd && prodDirectory.trim() ? prodDirectory.trim() : null,
        prod_compose_file: showProd && isDocker && prodComposeFile.trim() ? prodComposeFile.trim() : null,
        container_id: isContainer ? containerId.trim() : null,
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
            <option value="DockerContainer">Docker Container</option>
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

        {isContainer ? (
          <div className={styles.field}>
            <label className={styles.label}>Container ID or Name</label>
            <input
              className={styles.input}
              type="text"
              value={containerId}
              onChange={(e) => setContainerId(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="my-postgres or a1b2c3d4"
            />
          </div>
        ) : isDocker ? (
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

        {!isContainer && (
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
        )}

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

        {/* Production mode section */}
        <div className={styles.prodSection}>
          <button
            type="button"
            className={styles.prodToggle}
            onClick={() => setShowProd(!showProd)}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ transform: showProd ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
            >
              <polyline points="4 2 8 6 4 10" />
            </svg>
            Production Overrides
            <span className={styles.prodHint}>(optional)</span>
          </button>
          {showProd && (
            <div className={styles.prodFields}>
              {isDocker ? (
                <div className={styles.field}>
                  <label className={styles.label}>Prod Compose File</label>
                  <input
                    className={styles.input}
                    type="text"
                    value={prodComposeFile}
                    onChange={(e) => setProdComposeFile(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="docker/docker-compose.prod.yml"
                  />
                </div>
              ) : (
                <div className={styles.field}>
                  <label className={styles.label}>Prod Command</label>
                  <input
                    className={styles.input}
                    type="text"
                    value={prodCommand}
                    onChange={(e) => setProdCommand(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="npm run start"
                  />
                </div>
              )}
              <div className={styles.field}>
                <label className={styles.label}>Prod Directory</label>
                <input
                  className={styles.input}
                  type="text"
                  value={prodDirectory}
                  onChange={(e) => setProdDirectory(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Leave blank to use same directory"
                />
              </div>
            </div>
          )}
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
