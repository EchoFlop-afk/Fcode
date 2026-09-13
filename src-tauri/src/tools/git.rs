use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::process::Command;
use std::time::Duration;

const GIT_TIMEOUT_SECS: u64 = 30;

fn run_git(root: &std::path::Path, args: &[&str]) -> AppResult<String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(root)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    hide_window(&mut cmd);
    let output = cmd
        .output()
        .map_err(|_| AppError::not_configured("git is not installed or not on PATH"))?;

    // Wait with timeout is not available on std; git ops here are quick.
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::new(
            "git_error",
            "internal",
            format!("git failed: {}", err.trim().chars().take(300).collect::<String>()),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn hide_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    #[cfg(not(windows))]
    let _ = cmd;
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: String,
    pub is_repo: bool,
    pub clean: bool,
    pub entries: Vec<GitEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitEntry {
    pub status: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub subject: String,
}

pub fn is_repo(root: &std::path::Path) -> bool {
    let mut cmd = Command::new("git");
    cmd.current_dir(root)
        .args(["rev-parse", "--is-inside-work-tree"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .stdin(std::process::Stdio::null());
    hide_window(&mut cmd);
    cmd.output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn git_status(root: &std::path::Path) -> AppResult<GitStatus> {
    if !is_repo(root) {
        return Ok(GitStatus {
            branch: String::new(),
            is_repo: false,
            clean: true,
            entries: vec![],
        });
    }
    let branch = run_git(root, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_default()
        .trim()
        .to_string();
    let raw = run_git(root, &["status", "--porcelain=v1", "-b"])?;
    let mut entries = Vec::new();
    for line in raw.lines().skip(1) {
        if line.len() < 4 {
            continue;
        }
        let status = line[..2].trim().to_string();
        let path = line[3..].trim().trim_matches('"').to_string();
        entries.push(GitEntry { status, path });
    }
    Ok(GitStatus {
        branch,
        is_repo: true,
        clean: entries.is_empty(),
        entries,
    })
}

pub fn git_diff(root: &std::path::Path) -> AppResult<String> {
    if !is_repo(root) {
        return Err(AppError::not_configured("Not a git repository"));
    }
    let diff = run_git(root, &["diff", "HEAD"])?;
    Ok(diff.chars().take(200_000).collect())
}

pub fn git_log(root: &std::path::Path, max: u32) -> AppResult<Vec<GitLogEntry>> {
    if !is_repo(root) {
        return Err(AppError::not_configured("Not a git repository"));
    }
    let max = max.clamp(1, 200);
    let raw = run_git(
        root,
        &[
            "log",
            &format!("-n{max}"),
            "--date=iso",
            "--pretty=format:%h%x1f%an%x1f%ad%x1f%s",
        ],
    )?;
    let mut out = Vec::new();
    for line in raw.lines() {
        let parts: Vec<&str> = line.split('\x1f').collect();
        if parts.len() == 4 {
            out.push(GitLogEntry {
                hash: parts[0].to_string(),
                author: parts[1].to_string(),
                date: parts[2].to_string(),
                subject: parts[3].to_string(),
            });
        }
    }
    Ok(out)
}

/// Timeout helper retained for future long-running git operations.
#[allow(dead_code)]
fn git_timeout() -> Duration {
    Duration::from_secs(GIT_TIMEOUT_SECS)
}
