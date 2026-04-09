import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  ProcessLogResult,
  ProcessResources,
  RunningProcess,
  SystemPortInfo,
} from "./types";

export async function listSystemPorts(): Promise<SystemPortInfo[]> {
  return invoke("list_system_ports");
}

export async function startProcess(id: string, mode?: string): Promise<number> {
  return invoke("start_process", { id, mode: mode ?? null });
}

export async function stopProcess(id: string): Promise<void> {
  return invoke("stop_process", { id });
}

export async function killSystemProcess(pid: number): Promise<void> {
  return invoke("kill_system_process", { pid });
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return invoke("save_config", { config });
}

export async function loadConfig(): Promise<AppConfig> {
  return invoke("load_config");
}

export async function getRunningStatus(): Promise<RunningProcess[]> {
  return invoke("get_running_status");
}

export async function refreshPorts(): Promise<RunningProcess[]> {
  return invoke("refresh_ports");
}

export async function getProcessResources(): Promise<ProcessResources[]> {
  return invoke("get_process_resources");
}

export async function getProcessLogs(id: string, since: number): Promise<ProcessLogResult> {
  return invoke("get_process_logs", { id, since });
}
