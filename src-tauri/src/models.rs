use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProcessType {
    Command,
    DockerCompose,
    DockerContainer,
}

impl Default for ProcessType {
    fn default() -> Self {
        ProcessType::Command
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RunMode {
    Dev,
    Prod,
}

impl Default for RunMode {
    fn default() -> Self {
        RunMode::Dev
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedProcess {
    pub id: String,
    pub name: String,
    pub command: String,
    pub directory: String,
    pub group_id: Option<String>,
    #[serde(default)]
    pub last_ports: Vec<u16>,
    #[serde(default)]
    pub process_type: ProcessType,
    #[serde(default)]
    pub compose_file: Option<String>,
    #[serde(default)]
    pub prod_command: Option<String>,
    #[serde(default)]
    pub prod_directory: Option<String>,
    #[serde(default)]
    pub prod_compose_file: Option<String>,
    #[serde(default)]
    pub container_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessGroup {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub collapsed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub processes: Vec<SavedProcess>,
    pub groups: Vec<ProcessGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProcessStatus {
    Running,
    Stopped,
    Starting,
}

#[derive(Debug, Clone, Serialize)]
pub struct RunningProcess {
    pub id: String,
    pub pid: u32,
    pub status: ProcessStatus,
    pub ports: Vec<u16>,
    #[serde(default)]
    pub run_mode: RunMode,
}

#[derive(Debug, Clone, Serialize)]
pub struct PortResources {
    pub port: u16,
    pub pid: u32,
    pub cpu_usage: f32,
    pub memory_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessResources {
    pub id: String,
    pub port_resources: Vec<PortResources>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemPortInfo {
    pub pid: u32,
    pub process_name: String,
    pub protocol: String,
    pub local_addr: String,
    pub local_port: u16,
    pub state: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessLogResult {
    pub lines: Vec<String>,
    pub offset: usize,
}
