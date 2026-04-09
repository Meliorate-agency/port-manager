"use client";

import { useState } from "react";
import type { ProcessGroup, ProcessType } from "@/lib/types";
import styles from "./AddProcessModal.module.css";

interface AddProcessModalProps {
  groups: ProcessGroup[];
  onSave: (data: {
    name: string;
    command: string;
    directory: string;
    group_id: string | null;
    process_type?: ProcessType;
    compose_file?: string | null;
    prod_command?: string | null;
    prod_directory?: string | null;
    prod_compose_file?: string | null;
    container_id?: string | null;
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
  const [processType, setProcessType] = useState<ProcessType>("Command");
  const [composeFile, setComposeFile] = useState("");
  const [showProd, setShowProd] = useState(false);
  const [prodCommand, setProdCommand] = useState("");
  const [prodDirectory, setProdDirectory] = useState("");
  const [prodComposeFile, setProdComposeFile] = useState("");
  const [containerId, setContainerId] = useState("");
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
      await onSave({
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
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>Add Process</div>

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
            placeholder="My Dev Server"
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
              placeholder="npm run dev"
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
              placeholder="C:\Projects\my-app"
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
