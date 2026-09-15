use crate::error::{AppError, AppResult};
use crate::security::validate_path;
use serde::Serialize;
use std::fs;
use std::path::Path;

const MAX_READ_BYTES: u64 = 2 * 1024 * 1024;
const MAX_WRITE_BYTES: usize = 2 * 1024 * 1024;
const MAX_LIST_ENTRIES: usize = 2000;
const MAX_SEARCH_RESULTS: usize = 200;
const MAX_GREP_FILE_BYTES: u64 = 512 * 1024;
const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", "target", "dist", "build", "out", ".next",
    "__pycache__", ".venv", "venv", ".idea", ".gradle", ".terraform",
    "vendor", ".pnpm-store", ".cache",
];

const BINARY_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "ico", "webp", "bmp", "exe", "dll", "so", "dylib",
    "zip", "gz", "tar", "7z", "rar", "pdf", "woff", "woff2", "ttf", "otf", "eot",
    "mp3", "mp4", "avi", "mov", "wav", "sqlite", "db", "pdb", "obj", "lib", "a",
    "class", "jar", "wasm", "bin", "iso", "msi", "node", "pyc", "pyd",
];

pub fn is_binary_ext(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| BINARY_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn should_skip_dir(name: &str) -> bool {
    SKIP_DIRS.contains(&name) || name == "index.json"
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    /// Path relative to the workspace root
    pub path: String,
    pub kind: String, // "file" | "dir"
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    pub content: String,
    pub truncated: bool,
    pub size: u64,
}

pub fn fs_read(root: &Path, rel: &str) -> AppResult<ReadResult> {
    use std::io::Read;
    let path = validate_path(root, rel)?;
    let meta = fs::metadata(&path)
        .map_err(|_| AppError::bad_request(format!("File not found: {rel}")))?;
    if meta.is_dir() {
        return Err(AppError::bad_request(format!("Path is a directory: {rel}")));
    }
    let size = meta.len();
    let file = fs::File::open(&path)?;
    let mut limited = file.take(MAX_READ_BYTES);
    let bytes: Vec<u8> = {
        let mut buf = Vec::new();
        limited.read_to_end(&mut buf)?;
        buf
    };
    let truncated = size > MAX_READ_BYTES;
    let content = String::from_utf8_lossy(&bytes).to_string();
    Ok(ReadResult { content, truncated, size })
}

const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;

fn image_mime(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        _ => return None,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageData {
    pub data_url: String,
    pub size: u64,
}

/// Reads a previewable image file and returns it as a base64 data URL.
pub fn fs_read_data_url(root: &Path, rel: &str) -> AppResult<ImageData> {
    use base64::Engine as _;
    let path = validate_path(root, rel)?;
    let meta = fs::metadata(&path)
        .map_err(|_| AppError::bad_request(format!("File not found: {rel}")))?;
    if meta.is_dir() {
        return Err(AppError::bad_request(format!("Path is a directory: {rel}")));
    }
    let mime = image_mime(&path)
        .ok_or_else(|| AppError::bad_request(format!("Not a previewable image: {rel}")))?;
    if meta.len() > MAX_IMAGE_BYTES {
        return Err(AppError::bad_request(
            "Image exceeds the 20 MB preview limit",
        ));
    }
    let bytes = fs::read(&path)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(ImageData {
        data_url: format!("data:{mime};base64,{b64}"),
        size: meta.len(),
    })
}

pub fn fs_write(root: &Path, rel: &str, content: &str) -> AppResult<u64> {
    if content.len() > MAX_WRITE_BYTES {
        return Err(AppError::bad_request("File content exceeds the 2 MB limit"));
    }
    let path = validate_path(root, rel)?;
    if is_binary_ext(&path) && !content.is_empty() {
        return Err(AppError::bad_request("Refusing to write binary file types"));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let bytes = content.as_bytes();
    fs::write(&path, bytes)?;
    Ok(bytes.len() as u64)
}

/// Replaces an exact occurrence of `old` with `new` in a text file.
/// Fails when the target text is not found or is ambiguous.
pub fn fs_edit(root: &Path, rel: &str, old: &str, new: &str, replace_all: bool) -> AppResult<u64> {
    if old.is_empty() {
        return Err(AppError::bad_request("Search text must not be empty"));
    }
    let path = validate_path(root, rel)?;
    let content = fs::read_to_string(&path)
        .map_err(|e| AppError::bad_request(format!("Cannot read file {rel}: {e}")))?;
    let count = content.matches(old).count();
    if count == 0 {
        return Err(AppError::bad_request("Search text not found in file"));
    }
    if count > 1 && !replace_all {
        return Err(AppError::bad_request(format!(
            "Search text appears {count} times; provide more context or set replaceAll"
        )));
    }
    let updated = if replace_all {
        content.replace(old, new)
    } else {
        content.replacen(old, new, 1)
    };
    fs::write(&path, updated.as_bytes())?;
    Ok(count as u64)
}

pub fn fs_delete(root: &Path, rel: &str, recursive: bool) -> AppResult<()> {
    let path = validate_path(root, rel)?;
    let meta = fs::symlink_metadata(&path)
        .map_err(|_| AppError::bad_request(format!("Path not found: {rel}")))?;
    if meta.is_dir() {
        let empty = fs::read_dir(&path)?.next().is_none();
        if !empty && !recursive {
            return Err(AppError::bad_request(
                "Directory is not empty; pass recursive=true to delete it",
            ));
        }
        fs::remove_dir_all(&path)?;
    } else {
        fs::remove_file(&path)?;
    }
    Ok(())
}

pub fn fs_list(root: &Path, rel: &str) -> AppResult<Vec<FileEntry>> {
    let path = if rel.is_empty() {
        root.to_path_buf()
    } else {
        validate_path(root, rel)?
    };
    let mut entries: Vec<FileEntry> = Vec::new();
    for entry in fs::read_dir(&path)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type()?.is_dir();
        if !is_dir && (name.starts_with('.') && name != ".gitignore") {
            continue;
        }
        if is_dir && should_skip_dir(&name) {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let rel_path = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}")
        };
        entries.push(FileEntry {
            name,
            path: rel_path.replace('\\', "/"),
            kind: if is_dir { "dir".into() } else { "file".into() },
            size,
        });
        if entries.len() >= MAX_LIST_ENTRIES {
            break;
        }
    }
    entries.sort_by(|a, b| b.kind.cmp(&a.kind).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

/// Recursively lists directories up to `depth`, skipping heavy folders.
pub fn list_tree(root: &Path, rel: &str, depth: u32) -> AppResult<Vec<FileEntry>> {
    let mut out = Vec::new();
    walk_tree(root, rel, depth, &mut out)?;
    Ok(out)
}

fn walk_tree(root: &Path, rel: &str, depth: u32, out: &mut Vec<FileEntry>) -> AppResult<()> {
    if depth == 0 || out.len() >= MAX_LIST_ENTRIES {
        return Ok(());
    }
    for entry in fs_list(root, rel)? {
        let is_dir = entry.kind == "dir";
        let child_rel = if rel.is_empty() {
            entry.name.clone()
        } else {
            format!("{rel}/{}", entry.name)
        };
        out.push(entry);
        if is_dir {
            walk_tree(root, &child_rel, depth - 1, out)?;
        }
    }
    Ok(())
}

/// Filename search (case-insensitive substring).
pub fn fs_search(root: &Path, query: &str, max: usize) -> AppResult<Vec<FileEntry>> {
    let q = query.to_lowercase();
    if q.is_empty() {
        return Err(AppError::bad_request("Search query is empty"));
    }
    let max = max.clamp(1, MAX_SEARCH_RESULTS);
    let mut results = Vec::new();
    let mut scanned = 0usize;
    search_walk(root, "", &q, max, &mut results, &mut scanned);
    Ok(results)
}

fn search_walk(
    root: &Path,
    rel: &str,
    q: &str,
    max: usize,
    results: &mut Vec<FileEntry>,
    scanned: &mut usize,
) {
    if results.len() >= max || *scanned > 20000 {
        return;
    }
    let entries = match fs_list(root, rel) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries {
        *scanned += 1;
        if results.len() >= max {
            return;
        }
        if entry.name.to_lowercase().contains(q) {
            results.push(entry.clone());
        }
        if entry.kind == "dir" {
            let child_rel = if rel.is_empty() {
                entry.name.clone()
            } else {
                format!("{rel}/{}", entry.name)
            };
            search_walk(root, &child_rel, q, max, results, scanned);
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrepMatch {
    pub path: String,
    pub line_number: u64,
    pub line: String,
}

/// Content search: case-insensitive substring by default, regex when requested.
pub fn fs_grep(
    root: &Path,
    pattern: &str,
    is_regex: bool,
    max: usize,
) -> AppResult<Vec<GrepMatch>> {
    if pattern.is_empty() {
        return Err(AppError::bad_request("Grep pattern is empty"));
    }
    let max = max.clamp(1, MAX_SEARCH_RESULTS);
    let matcher: Box<dyn Fn(&str) -> bool> = if is_regex {
        let re = regex::Regex::new(pattern)
            .map_err(|e| AppError::bad_request(format!("Invalid regex: {e}")))?;
        Box::new(move |line: &str| re.is_match(line))
    } else {
        let p = pattern.to_lowercase();
        Box::new(move |line: &str| line.to_lowercase().contains(&p))
    };

    let mut results = Vec::new();
    let mut scanned = 0usize;
    grep_walk(root, "", matcher.as_ref(), max, &mut results, &mut scanned);
    Ok(results)
}

fn grep_walk(
    root: &Path,
    rel: &str,
    matcher: &dyn Fn(&str) -> bool,
    max: usize,
    results: &mut Vec<GrepMatch>,
    scanned: &mut usize,
) {
    if results.len() >= max || *scanned > 20000 {
        return;
    }
    let entries = match fs_list(root, rel) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries {
        if results.len() >= max {
            return;
        }
        let child_rel = if rel.is_empty() {
            entry.name.clone()
        } else {
            format!("{rel}/{}", entry.name)
        };
        if entry.kind == "dir" {
            grep_walk(root, &child_rel, matcher, max, results, scanned);
        } else {
            *scanned += 1;
            if *scanned > 20000 || is_binary_ext(Path::new(&entry.name)) {
                continue;
            }
            if entry.size > MAX_GREP_FILE_BYTES {
                continue;
            }
            let path = validate_path(root, &child_rel).ok();
            let Some(path) = path else { continue };
            let Ok(content) = fs::read_to_string(&path) else { continue };
            for (i, line) in content.lines().enumerate() {
                if matcher(line) {
                    results.push(GrepMatch {
                        path: child_rel.clone(),
                        line_number: (i + 1) as u64,
                        line: line.chars().take(240).collect(),
                    });
                    if results.len() >= max {
                        return;
                    }
                }
            }
        }
    }
}
