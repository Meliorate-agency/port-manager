"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  SavedProcess,
  ProcessGroup,
  AppConfig,
  RunningProcess,
  ProcessResources,
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
  const [processResources, setProcessResources] = useState<Map<string, ProcessResources>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resourceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      // Ensure fields have defaults (for old configs)
      const processes = config.processes.map((p) => ({
        ...p,
        last_ports: p.last_ports || [],
        process_type: p.process_type || "Command" as const,
        compose_file: p.compose_file || null,
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
    }, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [loadAll]);

  // Separate 5-second polling for CPU/RAM resources
  useEffect(() => {
    const fetchResources = async () => {
      try {
        const resources = await commands.getProcessResources();
        const map = new Map<string, ProcessResources>();
        for (const r of resources) {
          map.set(r.id, r);
        }
        setProcessResources(map);
      } catch (err) {
        console.error("Resource polling error:", err);
      }
    };

    fetchResources();
    resourceIntervalRef.current = setInterval(fetchResources, 5000);

    return () => {
      if (resourceIntervalRef.current) {
        clearInterval(resourceIntervalRef.current);
      }
    };
  }, []);

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
      try {
        await commands.saveConfig(config);
        setSavedProcesses(processes);
        setGroups(processGroups);
      } catch (err) {
        console.error("Failed to save config:", err);
        throw err;
      }
    },
    [],
  );

  const addProcess = useCallback(
    async (data: Omit<SavedProcess, "id" | "last_ports" | "process_type" | "compose_file"> & { process_type?: SavedProcess["process_type"]; compose_file?: string | null }) => {
      const id = crypto.randomUUID();
      const newProcess: SavedProcess = {
        ...data,
        id,
        last_ports: [],
        process_type: data.process_type || "Command",
        compose_file: data.compose_file || null,
      };
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

  const reorderProcesses = useCallback(
    async (reordered: SavedProcess[]) => {
      await saveAndUpdateConfig(reordered, groupsRef.current);
    },
    [saveAndUpdateConfig],
  );

  const startProcess = useCallback(async (id: string) => {
    try {
      await commands.startProcess(id);
    } catch (err) {
      console.error("Failed to start process:", err);
    } finally {
      try {
        const status = await commands.getRunningStatus();
        setRunningStatus(status);
      } catch {}
    }
  }, []);

  const stopProcess = useCallback(async (id: string) => {
    try {
      await commands.stopProcess(id);
    } catch (err) {
      console.error("Failed to stop process:", err);
    } finally {
      try {
        const status = await commands.getRunningStatus();
        setRunningStatus(status);
      } catch {}
    }
  }, []);

  const restartProcess = useCallback(async (id: string) => {
    try {
      await commands.stopProcess(id);
      await commands.startProcess(id);
    } catch (err) {
      console.error("Failed to restart process:", err);
    } finally {
      try {
        const status = await commands.getRunningStatus();
        setRunningStatus(status);
      } catch {}
    }
  }, []);

  const killSystemProcess = useCallback(async (pid: number) => {
    try {
      await commands.killSystemProcess(pid);
    } catch (err) {
      console.error("Failed to kill process:", err);
    } finally {
      try {
        const ports = await commands.listSystemPorts();
        setSystemPorts(ports);
      } catch {}
    }
  }, []);

  return {
    savedProcesses,
    groups,
    runningStatus,
    systemPorts,
    processResources,
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
    reorderProcesses,
    startProcess,
    stopProcess,
    restartProcess,
    killSystemProcess,
  };
}
