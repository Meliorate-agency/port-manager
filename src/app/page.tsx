"use client";

import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useProcesses } from "@/hooks/useProcesses";
import type { SavedProcess } from "@/lib/types";
import Toolbar from "@/components/Toolbar/Toolbar";
import ProcessList from "@/components/ProcessList/ProcessList";
import AddProcessModal from "@/components/AddProcessModal/AddProcessModal";
import AddGroupModal from "@/components/AddGroupModal/AddGroupModal";
import EditProcessModal from "@/components/EditProcessModal/EditProcessModal";
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
    startProcess,
    stopProcess,
    killSystemProcess,
  } = useProcesses();

  const [showAddProcess, setShowAddProcess] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [editingProcess, setEditingProcess] = useState<SavedProcess | null>(null);

  if (isLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <div className={styles.main}>
      <Toolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddProcess={() => setShowAddProcess(true)}
        onAddGroup={() => setShowAddGroup(true)}
        onRefresh={refreshPorts}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
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
        onDeleteProcess={removeProcess}
        onEditProcess={setEditingProcess}
        onDeleteGroup={removeGroup}
        onRenameGroup={renameGroup}
        onToggleGroupCollapsed={toggleGroupCollapsed}
        onKillSystem={killSystemProcess}
        onLoadSystemPorts={fetchSystemPorts}
      />
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
