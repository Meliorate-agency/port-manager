export type ProcessType = "Command" | "DockerCompose" | "DockerContainer";
export type RunMode = "Dev" | "Prod";

export interface SavedProcess {
  id: string;
  name: string;
  command: string;
  directory: string;
  group_id: string | null;
  last_ports: number[];
  process_type: ProcessType;
  compose_file: string | null;
  prod_command: string | null;
  prod_directory: string | null;
  prod_compose_file: string | null;
  container_id: string | null;
}

export interface ProcessGroup {
  id: string;
  name: string;
  collapsed: boolean;
}

export interface AppConfig {
  processes: SavedProcess[];
  groups: ProcessGroup[];
}

export interface RunningProcess {
  id: string;
  pid: number;
  status: "Running" | "Stopped" | "Starting";
  ports: number[];
  run_mode: RunMode;
}

export interface PortResources {
  port: number;
  pid: number;
  cpu_usage: number;
  memory_bytes: number;
}

export interface ProcessResources {
  id: string;
  port_resources: PortResources[];
}

export interface SystemPortInfo {
  pid: number;
  process_name: string;
  protocol: string;
  local_addr: string;
  local_port: number;
  state: string;
}

export interface ProcessLogResult {
  lines: string[];
  offset: number;
}
