use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::ipc::Channel;

use crate::models::TerminalEvent;

const MARKER: &str = "__FCEND__";
const MAX_OUTPUT_LINES: usize = 4000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInfo {
    pub session_id: String,
    pub cwd: String,
}

struct Session {
    cwd: PathBuf,
    child_pid: AtomicU64,
}

pub struct TerminalManager {
    sessions: Mutex<std::collections::HashMap<String, Session>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(std::collections::HashMap::new()),
        }
    }

    pub fn session_cwd(&self, session_id: &str) -> Option<PathBuf> {
        self.sessions
            .lock()
            .unwrap()
            .get(session_id)
            .map(|s| s.cwd.clone())
    }

    fn ensure_session(&self, session_id: &str, cwd: PathBuf) {
        let mut sessions = self.sessions.lock().unwrap();
        sessions
            .entry(session_id.to_string())
            .or_insert(Session {
                cwd,
                child_pid: AtomicU64::new(0),
            });
    }

    fn set_cwd(&self, session_id: &str, cwd: PathBuf) {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(session_id) {
            session.cwd = cwd;
        }
    }

    /// Runs `command` in the session shell/cwd, streaming output through the
    /// channel. Persists cwd changes made by the command (PowerShell only).
    /// `timeout_secs`: None = run until completion (interactive UI terminal).
    pub fn run(
        &self,
        session_id: &str,
        root: &Path,
        shell: &str,
        command: &str,
        timeout_secs: Option<u64>,
        events: Channel<TerminalEvent>,
    ) -> AppResult<TerminalInfo> {
        if command.trim().is_empty() {
            return Err(AppError::bad_request("Command is empty"));
        }
        self.ensure_session(session_id, root.to_path_buf());
        let cwd = self
            .session_cwd(session_id)
            .unwrap_or_else(|| root.to_path_buf());

        let mut full_command = command.replace('\r', " ");
        if shell == "powershell" {
            full_command = format!(
                "{full_command} ; Write-Output (\"{MARKER}\" + (Get-Location).Path + \":\" + $LASTEXITCODE)"
            );
        }

        let mut cmd = if shell == "cmd" {
            let mut c = Command::new("cmd.exe");
            c.args(["/C", &full_command]);
            c
        } else {
            let mut c = Command::new("powershell.exe");
            c.args([
                "-NoLogo",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &full_command,
            ]);
            c
        };
        cmd.current_dir(&cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());
        hide_window(&mut cmd);

        let mut child = cmd.spawn().map_err(|e| {
            AppError::new(
                "terminal_error",
                "internal",
                format!("Failed to start {shell}: {e}"),
            )
        })?;
        {
            let sessions = self.sessions.lock().unwrap();
            if let Some(session) = sessions.get(session_id) {
                session.child_pid.store(child.id() as u64, Ordering::SeqCst);
            }
        }

        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let new_cwd: std::sync::Arc<std::sync::Mutex<Option<String>>> =
            std::sync::Arc::new(std::sync::Mutex::new(None));

        let out_events = events.clone();
        let out_cwd = new_cwd.clone();
        let out_thread = std::thread::spawn(move || {
            read_stream(stdout, "stdout", out_events, Some(out_cwd));
        });
        let err_events = events.clone();
        let err_thread = std::thread::spawn(move || {
            read_stream(stderr, "stderr", err_events, None);
        });

        let deadline = timeout_secs
            .map(|s| std::time::Instant::now() + std::time::Duration::from_secs(s.max(1)));
        let mut timed_out = false;
        loop {
            match child.try_wait()? {
                Some(_) => break,
                None => {
                    let expired = deadline
                        .map(|d| std::time::Instant::now() > d)
                        .unwrap_or(false);
                    if expired {
                        let _ = child.kill();
                        let _ = child.wait();
                        let _ = events.send(TerminalEvent::Error {
                            message: format!(
                                "Command timed out after {}s and was terminated",
                                timeout_secs.unwrap_or(0)
                            ),
                        });
                        timed_out = true;
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(120));
                }
            }
        }

        let _ = out_thread.join();
        let _ = err_thread.join();
        let code = child.try_wait()?.and_then(|s| s.code());

        {
            let sessions = self.sessions.lock().unwrap();
            if let Some(session) = sessions.get(session_id) {
                session.child_pid.store(0, Ordering::SeqCst);
            }
        }

        if let Some(cwd) = new_cwd.lock().unwrap().take() {
            let p = PathBuf::from(&cwd);
            if p.is_dir() {
                self.set_cwd(session_id, p);
            }
        }

        let final_cwd = self.session_cwd(session_id).unwrap_or(cwd);
        let _ = events.send(TerminalEvent::Exit { code });
        if timed_out {
            return Ok(TerminalInfo {
                session_id: session_id.to_string(),
                cwd: final_cwd.to_string_lossy().to_string(),
            });
        }
        Ok(TerminalInfo {
            session_id: session_id.to_string(),
            cwd: final_cwd.to_string_lossy().to_string(),
        })
    }

    /// Kills the currently running command in a session (process tree).
    pub fn stop(&self, session_id: &str) {
        let pid = {
            let sessions = self.sessions.lock().unwrap();
            sessions
                .get(session_id)
                .map(|s| s.child_pid.load(Ordering::SeqCst))
                .unwrap_or(0)
        };
        if pid > 0 {
            let mut kill = Command::new("taskkill");
            kill.args(["/PID", &pid.to_string(), "/T", "/F"]);
            hide_window(&mut kill);
            let _ = kill.output();
        }
    }
}

fn read_stream<R: Read + Send + 'static>(
    stream: R,
    name: &str,
    events: Channel<TerminalEvent>,
    cwd_out: Option<std::sync::Arc<std::sync::Mutex<Option<String>>>>,
) {
    let reader = BufReader::new(stream);
    let mut count = 0usize;
    for line in reader.lines() {
        match line {
            Ok(l) => {
                if let Some(pos) = l.find(MARKER) {
                    if let Some(cwd_out) = &cwd_out {
                        let payload = &l[pos + MARKER.len()..];
                        if let Some(cwd_end) = payload.rfind(':') {
                            let cwd_str = &payload[..cwd_end];
                            if !cwd_str.is_empty() {
                                if let Ok(mut guard) = cwd_out.lock() {
                                    *guard = Some(cwd_str.to_string());
                                }
                            }
                        }
                    }
                    // Marker lines are control data; not emitted to the UI.
                } else {
                    if count < MAX_OUTPUT_LINES {
                        let _ = events.send(TerminalEvent::Data {
                            stream: name.to_string(),
                            data: l,
                        });
                    } else if count == MAX_OUTPUT_LINES {
                        let _ = events.send(TerminalEvent::Data {
                            stream: name.to_string(),
                            data: "... output truncated ...".into(),
                        });
                    }
                    count += 1;
                }
            }
            Err(_) => break,
        }
    }
}

fn hide_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    #[cfg(not(windows))]
    let _ = cmd;
}
