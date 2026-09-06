//! The single entity of this app: a stored audio file plus its metadata.

use serde::{Deserialize, Serialize};

/// Extensions we accept, lowercase, without the leading dot.
pub const ALLOWED_EXTENSIONS: [&str; 11] = [
    "mp3", "wav", "flac", "ogg", "oga", "opus", "m4a", "aac", "aiff", "aif", "wma",
];

/// Non-`audio/*` MIME types browsers are known to send for audio files.
pub const ALLOWED_MIME_ALIASES: [&str; 2] = ["application/ogg", "application/octet-stream"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub filename: String,
    pub title: String,
    pub content_type: String,
    pub size_bytes: u64,
    pub uploaded_at: String,
}

impl Track {
    /// Case-insensitive substring search over filename and title.
    pub fn matches(&self, query_lowercase: &str) -> bool {
        self.filename.to_lowercase().contains(query_lowercase)
            || self.title.to_lowercase().contains(query_lowercase)
    }

    /// Name of the file on disk: `<id>.<ext>`, never anything derived from user input
    /// beyond an extension taken from the allow-list.
    pub fn stored_file_name(&self) -> String {
        match extension_of(&self.filename) {
            Some(ext) => format!("{}.{}", self.id, ext),
            None => self.id.clone(),
        }
    }
}

/// The lowercase extension of `filename`, if it is on the allow-list.
pub fn extension_of(filename: &str) -> Option<&'static str> {
    let raw = filename.rsplit_once('.')?.1.to_lowercase();
    ALLOWED_EXTENSIONS.iter().copied().find(|ext| *ext == raw)
}

/// True when the multipart part's declared MIME type is acceptable for an audio file
/// whose extension is already known to be on the allow-list.
pub fn is_accepted_mime(content_type: &str) -> bool {
    let mime = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();
    mime.starts_with("audio/") || ALLOWED_MIME_ALIASES.contains(&mime.as_str())
}

/// Strip anything that could turn a filename into a path or confuse a terminal,
/// and cap the length. The result is stored in the CSV, never used as a path.
pub fn sanitize_filename(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .filter(|c| !c.is_control() && *c != '\0' && *c != '/' && *c != '\\')
        .collect();
    let cleaned = cleaned.trim_matches(['.', ' ']).to_string();
    cleaned.chars().take(255).collect()
}
