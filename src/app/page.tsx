"use client";

import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useProcesses } from "@/hooks/useProcesses";
import type { SavedProcess } from "@/lib/types";
import Toolbar from "@/components/Toolbar/Toolbar";
import ProcessList from "@/components/ProcessList/ProcessList";
import DetailPanel from "@/components/DetailPanel/DetailPanel";
import AddProcessModal from "@/components/AddProcessModal/AddProcessModal";
import AddGroupModal from "@/components/AddGroupModal/AddGroupModal";
import EditProcessModal from "@/components/EditProcessModal/EditProcessModal";
import UpdateChecker from "@/components/UpdateChecker/UpdateChecker";
import styles from "./page.module.css";

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const {
    savedProcesses,
    groups,
    runningStatus,
    systemPorts,
    processResources,
    isLoading,
    searchQuery,
    setSearchQuery,
    showSystemPorts,
    refreshPorts,
    fetchSystemPorts,
    addProcess,
    updateProcess,
    removeProcess,
    addGroup,
    removeGroup,
    renameGroup,
    toggleGroupCollapsed,
    reorderProcesses,
    startProcess,
    stopProcess,
    restartProcess,
    killSystemProcess,
  } = useProcesses();

  const [showAddProcess, setShowAddProcess] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [editingProcess, setEditingProcess] = useState<SavedProcess | null>(null);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);

  const selectedProcess = selectedProcessId
    ? savedProcesses.find((p) => p.id === selectedProcessId) ?? null
    : null;

  if (isLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <div className={styles.main}>
      <UpdateChecker />
      <Toolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddProcess={() => setShowAddProcess(true)}
        onAddGroup={() => setShowAddGroup(true)}
        onRefresh={refreshPorts}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <div className={styles.contentWrapper}>
        <ProcessList
          processes={savedProcesses}
          groups={groups}
          runningStatus={runningStatus}
          systemPorts={systemPorts}
          processResources={processResources}
          showSystemPorts={showSystemPorts}
          searchQuery={searchQuery}
          onStart={startProcess}
          onStop={stopProcess}
          onRestart={restartProcess}
          onReorderProcesses={reorderProcesses}
          onDeleteProcess={removeProcess}
          onEditProcess={setEditingProcess}
          onDeleteGroup={removeGroup}
          onRenameGroup={renameGroup}
          onToggleGroupCollapsed={toggleGroupCollapsed}
          onKillSystem={killSystemProcess}
          onLoadSystemPorts={fetchSystemPorts}
          onSelectProcess={setSelectedProcessId}
        />
        {selectedProcess && (
          <DetailPanel
            process={selectedProcess}
            status={runningStatus.find((r) => r.id === selectedProcessId)}
            resources={processResources.get(selectedProcessId!)}
            onClose={() => setSelectedProcessId(null)}
            onStart={startProcess}
            onStop={stopProcess}
            onRestart={restartProcess}
          />
        )}
      </div>
      {showAddProcess && (
        <AddProcessModal
          groups={groups}
          onSave={addProcess}
          onClose={() => setShowAddProcess(false)}
        />
      )}
      {showAddGroup && (
        <AddGroupModal
          onSave={addGroup}
          onClose={() => setShowAddGroup(false)}
        />
      )}
      {editingProcess && (
        <EditProcessModal
          process={editingProcess}
          groups={groups}
          onSave={updateProcess}
          onClose={() => setEditingProcess(null)}
        />
      )}
    </div>
  );
}
