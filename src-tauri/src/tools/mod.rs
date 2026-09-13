pub mod fs;
pub mod git;
pub mod terminal;

use crate::error::{AppError, AppResult};
use crate::security::classify_command;
use serde_json::{json, Value};
use std::path::Path;

/// Executes an agent tool by name with JSON arguments, sandboxed to the
/// project root. All filesystem operations validate paths against the root.
pub fn execute(
    root: &Path,
    name: &str,
    args: &Value,
    terminal: &terminal::TerminalManager,
    shell: &str,
    terminal_timeout: u64,
    terminal_events: tauri::ipc::Channel<crate::models::TerminalEvent>,
) -> AppResult<Value> {
    match name {
        "filesystem.read" => {
            let rel = arg_str(args, "path")?;
            let r = fs::fs_read(root, &rel)?;
            Ok(json!({ "content": r.content, "truncated": r.truncated, "size": r.size }))
        }
        "filesystem.write" => {
            let rel = arg_str(args, "path")?;
            let content = arg_str(args, "content")?;
            let bytes = fs::fs_write(root, &rel, &content)?;
            Ok(json!({ "written": bytes, "path": rel }))
        }
        "filesystem.edit" => {
            let rel = arg_str(args, "path")?;
            let old = arg_str(args, "oldText")?;
            let new = arg_str(args, "newText")?;
            let replace_all = args.get("replaceAll").and_then(|v| v.as_bool()).unwrap_or(false);
            let replaced = fs::fs_edit(root, &rel, &old, &new, replace_all)?;
            Ok(json!({ "replacements": replaced, "path": rel }))
        }
        "filesystem.delete" => {
            let rel = arg_str(args, "path")?;
            let recursive = args.get("recursive").and_then(|v| v.as_bool()).unwrap_or(false);
            fs::fs_delete(root, &rel, recursive)?;
            Ok(json!({ "deleted": rel }))
        }
        "filesystem.list" => {
            let rel = args
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let depth = args.get("depth").and_then(|v| v.as_u64()).unwrap_or(2) as u32;
            let entries = fs::list_tree(root, &rel, depth.min(4))?;
            Ok(serde_json::to_value(entries)?)
        }
        "filesystem.search" => {
            let query = arg_str(args, "query")?;
            let max = args.get("maxResults").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
            let results = fs::fs_search(root, &query, max)?;
            Ok(serde_json::to_value(results)?)
        }
        "filesystem.grep" => {
            let pattern = arg_str(args, "pattern")?;
            let is_regex = args.get("isRegex").and_then(|v| v.as_bool()).unwrap_or(false);
            let max = args.get("maxResults").and_then(|v| v.as_u64()).unwrap_or(100) as usize;
            let results = fs::fs_grep(root, &pattern, is_regex, max)?;
            Ok(serde_json::to_value(results)?)
        }
        "terminal.run" => {
            let command = arg_str(args, "command")?;
            let risk = classify_command(&command);
            let timeout = args
                .get("timeoutMs")
                .and_then(|v| v.as_u64())
                .map(|ms| (ms / 1000).clamp(1, 600))
                .unwrap_or(terminal_timeout);
            let info = terminal.run("agent", root, shell, &command, Some(timeout), terminal_events)?;
            Ok(json!({ "risk": risk.as_str(), "cwd": info.cwd }))
        }
        "git.status" => Ok(serde_json::to_value(git::git_status(root)?)?),
        "git.diff" => {
            let diff = git::git_diff(root)?;
            Ok(json!({ "diff": diff }))
        }
        "git.log" => {
            let max = args.get("max").and_then(|v| v.as_u64()).unwrap_or(20) as u32;
            Ok(serde_json::to_value(git::git_log(root, max)?)?)
        }
        "project.inspect" => Ok(project_inspect(root)?),
        other => Err(AppError::bad_request(format!("Unknown tool: {other}"))),
    }
}

fn arg_str(args: &Value, key: &str) -> AppResult<String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::bad_request(format!("Missing required argument: {key}")))
}

pub fn project_inspect(root: &Path) -> AppResult<Value> {
    let entries = fs::list_tree(root, "", 3)?;
    let file_count = entries.iter().filter(|e| e.kind == "file").count();
    let dirs: Vec<&String> = entries
        .iter()
        .filter(|e| e.kind == "dir")
        .map(|e| &e.path)
        .collect();

    // Manifests
    let manifests = ["package.json", "Cargo.toml", "pyproject.toml", "go.mod", "pom.xml", "composer.json"];
    let mut manifest_info: Vec<Value> = Vec::new();
    for m in manifests {
        if let Ok(r) = fs::fs_read(root, m) {
            let summary = r.content.chars().take(2000).collect::<String>();
            manifest_info.push(json!({ "file": m, "excerpt": summary }));
            break;
        }
    }

    let readme = fs::fs_read(root, "README.md")
        .map(|r| r.content.chars().take(1500).collect::<String>())
        .ok();

    let git = git::git_status(root).ok();

    Ok(json!({
        "root": root.to_string_lossy(),
        "fileCount": file_count,
        "directories": dirs.iter().take(50).collect::<Vec<_>>(),
        "manifests": manifest_info,
        "readmeExcerpt": readme,
        "git": git,
    }))
}
