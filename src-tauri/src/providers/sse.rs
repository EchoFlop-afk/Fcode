use crate::error::{AppError, AppResult};

/// Incremental line decoder for SSE / NDJSON byte streams.
pub struct LineDecoder {
    buf: Vec<u8>,
}

impl LineDecoder {
    pub fn new() -> Self {
        Self { buf: Vec::with_capacity(8192) }
    }

    /// Push raw bytes; returns complete lines (without terminators).
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        let mut lines = Vec::new();
        self.buf.extend_from_slice(chunk);
        while let Some(pos) = self.buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = self.buf.drain(..=pos).collect();
            let mut line = &line[..line.len() - 1]; // drop \n
            if line.last() == Some(&b'\r') {
                line = &line[..line.len() - 1];
            }
            lines.push(String::from_utf8_lossy(line).to_string());
        }
        lines
    }

    /// Remaining buffered content if it forms a non-empty final line.
    pub fn finish(&mut self) -> Option<String> {
        if self.buf.is_empty() {
            return None;
        }
        let line = String::from_utf8_lossy(&self.buf).to_string();
        self.buf.clear();
        if line.trim().is_empty() {
            None
        } else {
            Some(line)
        }
    }
}

impl Default for LineDecoder {
    fn default() -> Self {
        Self::new()
    }
}

/// Extracts the payload of an SSE `data:` line. Returns None for comments,
/// event/id fields, and empty lines.
pub fn sse_data(line: &str) -> Option<String> {
    let trimmed = line.trim_end();
    if let Some(rest) = trimmed.strip_prefix("data:") {
        let rest = rest.strip_prefix(' ').unwrap_or(rest);
        return Some(rest.to_string());
    }
    None
}

/// Parses an SSE data payload into JSON, mapping [DONE] sentinels to None.
pub fn parse_sse_json(payload: &str) -> AppResult<Option<serde_json::Value>> {
    let trimmed = payload.trim();
    if trimmed.is_empty() || trimmed == "[DONE]" {
        return Ok(None);
    }
    serde_json::from_str(trimmed)
        .map(Some)
        .map_err(|e| AppError::new("provider_error", "provider_error", format!("Invalid SSE payload: {e}")).retriable())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_split_lines() {
        let mut d = LineDecoder::new();
        let mut lines = d.push(b"data: {\"a\"");
        assert!(lines.is_empty());
        lines = d.push(b": 1}\n\ndata: [DONE]\n");
        assert_eq!(lines, vec!["data: {\"a\": 1}", "", "data: [DONE]"]);
        assert!(d.finish().is_none());
    }

    #[test]
    fn handles_crlf_and_final_line() {
        let mut d = LineDecoder::new();
        let lines = d.push(b"one\r\ntwo\r\nthree");
        assert_eq!(lines, vec!["one", "two"]);
        assert_eq!(d.finish(), Some("three".to_string()));
    }

    #[test]
    fn sse_payloads() {
        assert_eq!(sse_data("data: hello"), Some("hello".to_string()));
        assert_eq!(sse_data("data:hello"), Some("hello".to_string()));
        assert_eq!(sse_data("event: message"), None);
        assert_eq!(sse_data(": keepalive"), None);
        assert_eq!(parse_sse_json("[DONE]").unwrap(), None);
        let v = parse_sse_json("{\"x\":1}").unwrap().unwrap();
        assert_eq!(v["x"], 1);
    }
}
