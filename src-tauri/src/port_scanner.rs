use std::collections::HashSet;

use netstat2::{get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo};
use sysinfo::System;

use crate::models::SystemPortInfo;

pub fn get_all_listening_ports() -> Vec<SystemPortInfo> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let af_flags = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let proto_flags = ProtocolFlags::TCP | ProtocolFlags::UDP;

    let sockets = match get_sockets_info(af_flags, proto_flags) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    let mut results = Vec::new();

    for socket in sockets {
        let pids = &socket.associated_pids;
        if pids.is_empty() {
            continue;
        }

        for &pid in pids {
            let process_name = sys
                .process(sysinfo::Pid::from_u32(pid))
                .map(|p| p.name().to_string_lossy().to_string())
                .unwrap_or_else(|| "Unknown".to_string());

            match &socket.protocol_socket_info {
                ProtocolSocketInfo::Tcp(tcp) => {
                    let state = format!("{:?}", tcp.state);
                    results.push(SystemPortInfo {
                        pid,
                        process_name,
                        protocol: "TCP".to_string(),
                        local_addr: tcp.local_addr.to_string(),
                        local_port: tcp.local_port,
                        state,
                    });
                }
                ProtocolSocketInfo::Udp(udp) => {
                    results.push(SystemPortInfo {
                        pid,
                        process_name,
                        protocol: "UDP".to_string(),
                        local_addr: udp.local_addr.to_string(),
                        local_port: udp.local_port,
                        state: "OPEN".to_string(),
                    });
                }
            }
        }
    }

    results
}

pub fn get_child_pids(parent_pid: u32) -> HashSet<u32> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut result = HashSet::new();
    result.insert(parent_pid);

    let mut changed = true;
    while changed {
        changed = false;
        for (pid, process) in sys.processes() {
            if let Some(parent) = process.parent() {
                let pid_u32 = pid.as_u32();
                let parent_u32 = parent.as_u32();
                if result.contains(&parent_u32) && !result.contains(&pid_u32) {
                    result.insert(pid_u32);
                    changed = true;
                }
            }
        }
    }

    result
}

pub fn get_ports_for_pid_tree(parent_pid: u32) -> Vec<u16> {
    let pids = get_child_pids(parent_pid);

    let af_flags = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let proto_flags = ProtocolFlags::TCP | ProtocolFlags::UDP;

    let sockets = match get_sockets_info(af_flags, proto_flags) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    let mut ports: HashSet<u16> = HashSet::new();

    for socket in sockets {
        let has_match = socket.associated_pids.iter().any(|p| pids.contains(p));
        if !has_match {
            continue;
        }

        match &socket.protocol_socket_info {
            ProtocolSocketInfo::Tcp(tcp) => {
                if matches!(tcp.state, netstat2::TcpState::Listen) {
                    ports.insert(tcp.local_port);
                }
            }
            ProtocolSocketInfo::Udp(udp) => {
                ports.insert(udp.local_port);
            }
        }
    }

    let mut sorted: Vec<u16> = ports.into_iter().collect();
    sorted.sort();
    sorted
}
