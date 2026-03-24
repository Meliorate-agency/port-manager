export interface SavedProcess {
  id: string;
  name: string;
  command: string;
  directory: string;
  group_id: string | null;
  last_ports: number[];
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
}

export interface SystemPortInfo {
  pid: number;
  process_name: string;
  protocol: string;
  local_addr: string;
  local_port: number;
  state: string;
}
