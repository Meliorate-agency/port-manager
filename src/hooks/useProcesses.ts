"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  SavedProcess,
  ProcessGroup,
  AppConfig,
  RunningProcess,
  SystemPortInfo,
} from "@/lib/types";
import * as commands from "@/lib/commands";

export function useProcesses() {
  const [savedProcesses, setSavedProcesses] = useState<SavedProcess[]>([]);
  const [groups, setGroups] = useState<ProcessGroup[]>([]);
  const [runningStatus, setRunningStatus] = useState<RunningProcess[]>([]);
  const [systemPorts, setSystemPorts] = useState<SystemPortInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSystemPorts, setShowSystemPorts] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Use refs to always have latest state in callbacks
  const savedProcessesRef = useRef(savedProcesses);
  savedProcessesRef.current = savedProcesses;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const loadAll = useCallback(async () => {
    try {
      const [config, status] = await Promise.all([
        commands.loadConfig(),
        commands.getRunningStatus(),
      ]);
      // Ensure last_ports is always an array (for old configs without it)
      const processes = config.processes.map((p) => ({
        ...p,
        last_ports: p.last_ports || [],
      }));
      setSavedProcesses(processes);
      setGroups(config.groups);
      setRunningStatus(status);
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();

    intervalRef.current = setInterval(async () => {
      try {
        const status = await commands.getRunningStatus();
        setRunningStatus(status);
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [loadAll]);

  const refreshPorts = useCallback(async () => {
    try {
      const [status, ports] = await Promise.all([
        commands.refreshPorts(),
        commands.listSystemPorts(),
      ]);
      setRunningStatus(status);
      setSystemPorts(ports);
      setShowSystemPorts(true);
    } catch (err) {
      console.error("Refresh error:", err);
    }
  }, []);

  const fetchSystemPorts = useCallback(async () => {
    try {
      const ports = await commands.listSystemPorts();
      setSystemPorts(ports);
      setShowSystemPorts(true);
    } catch (err) {
      console.error("Failed to fetch system ports:", err);
    }
  }, []);

  const saveAndUpdateConfig = useCallback(
    async (processes: SavedProcess[], processGroups: ProcessGroup[]) => {
      const config: AppConfig = { processes, groups: processGroups };
      await commands.saveConfig(config);
      setSavedProcesses(processes);
      setGroups(processGroups);
    },
    [],
  );

  const addProcess = useCallback(
    async (data: Omit<SavedProcess, "id" | "last_ports">) => {
      const id = crypto.randomUUID();
      const newProcess: SavedProcess = { ...data, id, last_ports: [] };
      const updated = [...savedProcessesRef.current, newProcess];
      await saveAndUpdateConfig(updated, groupsRef.current);
    },
    [saveAndUpdateConfig],
  );

  const updateProcess = useCallback(
    async (id: string, data: Partial<Omit<SavedProcess, "id">>) => {
      const updated = savedProcessesRef.current.map((p) =>
        p.id === id ? { ...p, ...data } : p,
      );
      await saveAndUpdateConfig(updated, groupsRef.current);
    },
    [saveAndUpdateConfig],
  );

  const removeProcess = useCallback(
    async (id: string) => {
      const updated = savedProcessesRef.current.filter((p) => p.id !== id);
      await saveAndUpdateConfig(updated, groupsRef.current);
    },
    [saveAndUpdateConfig],
  );

  const addGroup = useCallback(
    async (name: string) => {
      const id = crypto.randomUUID();
      const newGroup: ProcessGroup = { id, name, collapsed: false };
      const updated = [...groupsRef.current, newGroup];
      await saveAndUpdateConfig(savedProcessesRef.current, updated);
    },
    [saveAndUpdateConfig],
  );

  const removeGroup = useCallback(
    async (groupId: string) => {
      const updatedGroups = groupsRef.current.filter((g) => g.id !== groupId);
      const updatedProcesses = savedProcessesRef.current.map((p) =>
        p.group_id === groupId ? { ...p, group_id: null } : p,
      );
      await saveAndUpdateConfig(updatedProcesses, updatedGroups);
    },
    [saveAndUpdateConfig],
  );

  const renameGroup = useCallback(
    async (groupId: string, newName: string) => {
      const updated = groupsRef.current.map((g) =>
        g.id === groupId ? { ...g, name: newName } : g,
      );
      await saveAndUpdateConfig(savedProcessesRef.current, updated);
    },
    [saveAndUpdateConfig],
  );

  const toggleGroupCollapsed = useCallback(
    async (groupId: string) => {
      const updated = groupsRef.current.map((g) =>
        g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
      );
      await saveAndUpdateConfig(savedProcessesRef.current, updated);
    },
    [saveAndUpdateConfig],
  );

  const startProcess = useCallback(async (id: string) => {
    await commands.startProcess(id);
    const status = await commands.getRunningStatus();
    setRunningStatus(status);
  }, []);

  const stopProcess = useCallback(async (id: string) => {
    await commands.stopProcess(id);
    const status = await commands.getRunningStatus();
    setRunningStatus(status);
  }, []);

  const killSystemProcess = useCallback(async (pid: number) => {
    await commands.killSystemProcess(pid);
    const ports = await commands.listSystemPorts();
    setSystemPorts(ports);
  }, []);

  return {
    savedProcesses,
    groups,
    runningStatus,
    systemPorts,
    isLoading,
    searchQuery,
    setSearchQuery,
    showSystemPorts,
    setShowSystemPorts,
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
  };
}
