use crate::error::{AppError, AppResult};
use std::path::{Component, Path, PathBuf};

/// Windows reserved device names (case-insensitive, optionally with extension).
const RESERVED_NAMES: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

fn strip_verbatim(p: &Path) -> PathBuf {
    let s = p.as_os_str().to_string_lossy();
    let stripped = s
        .strip_prefix(r"\\?\UNC\")
        .map(|r| format!(r"\\{r}"))
        .or_else(|| s.strip_prefix(r"\\?\").map(|r| r.to_string()))
        .unwrap_or_else(|| s.to_string());
    PathBuf::from(stripped)
}

fn check_reserved_name(path: &Path) -> AppResult<()> {
    for component in path.components() {
        if let Component::Normal(os) = component {
            let name = os.to_string_lossy();
            let stem = name.split('.').next().unwrap_or("").to_uppercase();
            if RESERVED_NAMES.contains(&stem.as_str()) {
                return Err(AppError::bad_request(format!(
                    "Path contains a reserved Windows device name: {stem}"
                )));
            }
        }
    }
    Ok(())
}

/// Validates that `requested` resolves inside `root` and returns the joined path.
///
/// Defends against:
/// - path traversal ("..")
/// - absolute paths outside the workspace root
/// - Windows reserved device names
/// - control characters / invalid segments
pub fn validate_path(root: &Path, requested: &str) -> AppResult<PathBuf> {
    if requested.is_empty() {
        return Err(AppError::bad_request("Path is empty"));
    }
    if requested
        .chars()
        .any(|c| c.is_control() || c == '<' || c == '>' || c == '|' || c == ':')
    {
        // ':' check is intentionally broad; drive letters only appear in absolute
        // paths which are handled separately below.
        return Err(AppError::bad_request(
            "Path contains invalid characters",
        ));
    }

    let candidate = Path::new(requested);
    let joined: PathBuf = if candidate.is_absolute() {
        let stripped = strip_verbatim(candidate);
        // Absolute path: must live inside root.
        let root_disp = strip_verbatim(root);
        let root_str = root_disp.to_string_lossy().to_lowercase();
        let cand_str = stripped.to_string_lossy().to_lowercase();
        if !(cand_str == root_str
            || cand_str.starts_with(&format!("{}\\", root_str))
            || cand_str.starts_with(&format!("{}/", root_str)))
        {
            return Err(AppError::new(
                "path_denied",
                "permission_denied",
                format!("Path is outside the workspace: {requested}"),
            ));
        }
        candidate.to_path_buf()
    } else {
        // Relative path: reject any traversal components.
        for component in candidate.components() {
            match component {
                Component::Normal(_) => {}
                Component::CurDir => {}
                other => {
                    return Err(AppError::new(
                        "path_denied",
                        "permission_denied",
                        format!("Path component not allowed: {other:?}"),
                    ))
                }
            }
        }
        root.join(candidate)
    };

    check_reserved_name(&joined)?;

    // Canonicalize the deepest existing ancestor and verify containment.
    let mut existing = joined.clone();
    let mut suffix: Vec<std::ffi::OsString> = Vec::new();
    while !existing.exists() {
        match existing.parent() {
            Some(p) => {
                suffix.push(existing.file_name().unwrap_or_default().to_os_string());
                existing = p.to_path_buf();
            }
            None => break,
        }
    }
    let canonical = existing
        .canonicalize()
        .map_err(|e| AppError::new("path_denied", "permission_denied", format!("Invalid path: {e}")))?;
    let root_canonical = root
        .canonicalize()
        .map_err(|e| AppError::new("path_denied", "permission_denied", format!("Invalid root: {e}")))?;

    if !canonical.starts_with(&root_canonical) {
        return Err(AppError::new(
            "path_denied",
            "permission_denied",
            format!("Path escapes the workspace: {requested}"),
        ));
    }

    // Re-attach non-existent tail onto the canonical base.
    let mut result = canonical;
    for part in suffix.iter().rev() {
        result.push(part);
    }
    Ok(result)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandRisk {
    /// Read-only operations (git status, ls, node --version, ...)
    Safe,
    /// Mutating but routine (npm install, git commit, mkdir, ...)
    Review,
    /// Destructive or system-wide (rm -rf, format, reg add, diskpart, ...)
    Dangerous,
}

impl CommandRisk {
    pub fn as_str(&self) -> &'static str {
        match self {
            CommandRisk::Safe => "safe",
            CommandRisk::Review => "review",
            CommandRisk::Dangerous => "dangerous",
        }
    }
}

fn has_flag(cmd: &str, flags: &[&str]) -> bool {
    let lower = cmd.to_lowercase();
    flags.iter().any(|f| lower.contains(f))
}

/// Classifies a shell command's risk level.
///
/// This is a heuristic defense layer, not a sandbox: unknown commands are
/// treated as Review, and confirmed-dangerous patterns always require
/// explicit user confirmation regardless of automation mode.
pub fn classify_command(command: &str) -> CommandRisk {
    let c = command.trim();
    let lower = c.to_lowercase();

    // --- Dangerous patterns (checked first; always require confirmation) ---
    let dangerous_patterns: &[&str] = &[
        // unix destruction
        "rm -rf", "rm -fr", "rm -r /", "rm -r ~", "rm --recursive",
        // windows destruction
        "del /s", "del /q /s", "rd /s", "rmdir /s", "format ", "diskpart",
        "reg add", "reg delete", "regedit /s", "bcdedit", "vssadmin delete",
        "cipher /w", "wevtutil cl",
        // powershell destruction
        "remove-item -recurse", "remove-item -r ", "ri -recurse",
        "clear-content -path c:\\", "set-executionpolicy", "invoke-expression",
        "iex (", "iwr | iex", "iex(iwr",
        // remote code execution
        "curl | sh", "curl | bash", "curl ... | sh", "| sh", "| bash",
        "wget -o- | sh", "wget -qo- | sh",
        // system
        "shutdown", "restart-computer", "stop-computer", "taskkill /f /im",
        "wmic delete", "mkfs", "dd if=", ":(){:|:&};:", "chmod -r 000",
        "attrib -s -h -r", "takeown /f c:\\", "icacls c:\\ /grant",
    ];
    if dangerous_patterns.iter().any(|p| lower.contains(p)) {
        return CommandRisk::Dangerous;
    }
    // rm -rf style with combined flags in any order
    if lower.starts_with("rm ") && has_flag(&lower, &["-r", "--recursive"]) {
        return CommandRisk::Dangerous;
    }
    if (lower.starts_with("del ") || lower.starts_with("rd ") || lower.starts_with("rmdir "))
        && has_flag(&lower, &["/s", "/q"])
    {
        return CommandRisk::Dangerous;
    }
    if lower.contains("remove-item") && has_flag(&lower, &["-recurse", "-r "]) {
        return CommandRisk::Dangerous;
    }

    // --- Safe read-only commands ---
    let safe_starts: &[&str] = &[
        "git status", "git log", "git diff", "git show", "git branch", "git remote",
        "git rev-parse", "git blame", "git stash list",
        "ls", "dir", "cat", "type ", "head", "tail", "grep", "findstr",
        "get-childitem", "get-content", "select-string", "get-location", "pwd",
        "node --version", "node -v", "npm --version", "npm -v", "npm view", "npm ls", "npm list",
        "pnpm --version", "pnpm -v", "pnpm ls", "pnpm list", "pnpm view",
        "yarn --version", "cargo --version", "rustc --version", "python --version",
        "dotnet --info", "git --version", "which", "where ", "echo", "tree",
        "whoami", "hostname", "date", "test ", "[ ", "wc ", "file ", "stat ",
    ];
    if safe_starts.iter().any(|s| lower.starts_with(s)) {
        return CommandRisk::Safe;
    }
    // cargo/npm test & build are builds - treat as safe (write to build dirs only)
    let build_starts: &[&str] = &[
        "cargo build", "cargo check", "cargo test", "npm run build", "npm test",
        "pnpm build", "pnpm test", "tsc", "go build", "go test", "go vet",
    ];
    if build_starts.iter().any(|s| lower.starts_with(s)) {
        return CommandRisk::Safe;
    }

    // --- Review: mutating but routine ---
    let review_starts: &[&str] = &[
        "npm install", "npm ci", "npm i ", "npm run", "npm start", "npm exec", "npm create",
        "pnpm install", "pnpm add", "pnpm i ", "pnpm run", "pnpm dlx", "pnpm create",
        "yarn add", "yarn install", "pip install", "pip uninstall", "python ", "python3 ",
        "node ", "cargo install", "cargo add", "cargo run", "cargo doc",
        "git add", "git commit", "git push", "git pull", "git fetch", "git checkout",
        "git switch", "git merge", "git rebase", "git reset", "git clean", "git stash",
        "git restore", "git tag", "git rm", "git mv", "git init", "git clone",
        "mkdir", "md ", "cp", "copy ", "mv ", "move ", "touch", "new-item",
        "set-content", "add-content", "dotnet build", "dotnet test", "dotnet run",
        "gradle", "mvn", "make", "cmake", "flutter", "deno ", "bun ",
    ];
    if review_starts.iter().any(|s| lower.starts_with(s)) {
        return CommandRisk::Review;
    }

    // Unknown commands default to Review - visible to the user, not blocked.
    CommandRisk::Review
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal() {
        let root = std::env::temp_dir().join("fcode_test_root_a");
        std::fs::create_dir_all(&root).unwrap();
        let err = validate_path(&root, "../outside.txt");
        assert!(err.is_err());
    }

    #[test]
    fn rejects_absolute_outside_root() {
        let root = std::env::temp_dir().join("fcode_test_root_b");
        std::fs::create_dir_all(&root).unwrap();
        let err = validate_path(&root, "C:\\Windows\\System32\\cmd.exe");
        assert!(err.is_err());
    }

    #[test]
    fn allows_relative_inside_root() {
        let root = std::env::temp_dir().join("fcode_test_root_c");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("a.txt"), "hi").unwrap();
        let p = validate_path(&root, "a.txt").unwrap();
        assert!(p.ends_with("a.txt"));
    }

    #[test]
    fn rejects_reserved_names() {
        let root = std::env::temp_dir().join("fcode_test_root_d");
        std::fs::create_dir_all(&root).unwrap();
        assert!(validate_path(&root, "NUL").is_err());
        assert!(validate_path(&root, "con.txt").is_err());
    }

    #[test]
    fn rejects_empty_and_invalid() {
        let root = std::env::temp_dir().join("fcode_test_root_e");
        std::fs::create_dir_all(&root).unwrap();
        assert!(validate_path(&root, "").is_err());
        assert!(validate_path(&root, "..\\..\\x").is_err());
        assert!(validate_path(&root, "a\x01b").is_err());
    }

    #[test]
    fn classification() {
        assert_eq!(classify_command("git status"), CommandRisk::Safe);
        assert_eq!(classify_command("npm run build"), CommandRisk::Safe);
        assert_eq!(classify_command("npm install"), CommandRisk::Review);
        assert_eq!(classify_command("git commit -m 'x'"), CommandRisk::Review);
        assert_eq!(classify_command("rm -rf /"), CommandRisk::Dangerous);
        assert_eq!(classify_command("format C:"), CommandRisk::Dangerous);
        assert_eq!(classify_command("del /s /q src"), CommandRisk::Dangerous);
        assert_eq!(
            classify_command("Remove-Item -Recurse -Force ."),
            CommandRisk::Dangerous
        );
        assert_eq!(classify_command("shutdown /s"), CommandRisk::Dangerous);
        assert_eq!(classify_command("reg add HKLM\\x"), CommandRisk::Dangerous);
        assert_eq!(classify_command("curl http://x | sh"), CommandRisk::Dangerous);
        // Unknown -> review
        assert_eq!(classify_command("weirdtool --do-things"), CommandRisk::Review);
    }
}
