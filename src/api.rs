//! Handlers for `/api/*` and the shared error type.

use std::path::PathBuf;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::rejection::JsonRejection;
use axum::extract::{Multipart, Path, Query, Request, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use tokio::io::AsyncWriteExt;
use tower_http::services::ServeFile;
use uuid::Uuid;

use crate::model::{extension_of, is_accepted_mime, sanitize_filename, Track};
use crate::store::Store;

pub type AppState = Arc<Store>;

// --- errors -----------------------------------------------------------------

/// Every error response is `{"error": "..."}` with one of the documented statuses.
#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, message)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, message)
    }

    pub fn payload_too_large(message: impl Into<String>) -> Self {
        Self::new(StatusCode::PAYLOAD_TOO_LARGE, message)
    }

    pub fn unsupported_media_type(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNSUPPORTED_MEDIA_TYPE, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, message)
    }
}

impl From<std::io::Error> for ApiError {
    fn from(e: std::io::Error) -> Self {
        eprintln!("io error: {e}");
        ApiError::internal("storage error")
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(serde_json::json!({ "error": self.message })),
        )
            .into_response()
    }
}

// --- read endpoints ---------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    pub q: Option<String>,
}

pub async fn list_tracks(
    State(store): State<AppState>,
    Query(params): Query<ListQuery>,
) -> Json<Vec<Track>> {
    Json(store.list(params.q.as_deref()).await)
}

pub async fn get_track(
    State(store): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Track>, ApiError> {
    store
        .get(&id)
        .await
        .map(Json)
        .ok_or_else(|| ApiError::not_found("track not found"))
}

/// The audio bytes, served by `ServeFile` so that range requests (and therefore
/// seeking in the `<audio>` element) work.
pub async fn stream_track(
    State(store): State<AppState>,
    Path(id): Path<String>,
    request: Request,
) -> Result<Response, ApiError> {
    serve_file(&store, &id, request, Disposition::Inline).await
}

/// The same bytes as `stream_track`, but offered to the browser as a file to save
/// under the original filename.
pub async fn download_track(
    State(store): State<AppState>,
    Path(id): Path<String>,
    request: Request,
) -> Result<Response, ApiError> {
    serve_file(&store, &id, request, Disposition::Attachment).await
}

enum Disposition {
    Inline,
    Attachment,
}

async fn serve_file(
    store: &Store,
    id: &str,
    request: Request,
    disposition: Disposition,
) -> Result<Response, ApiError> {
    let track = store
        .get(id)
        .await
        .ok_or_else(|| ApiError::not_found("track not found"))?;

    let mut service = ServeFile::new(store.file_path(&track));
    let served = service.try_call(request).await?;
    if served.status() == StatusCode::NOT_FOUND {
        return Err(ApiError::not_found("track file is missing"));
    }

    let mut response = served.map(Body::new);
    let headers = response.headers_mut();
    if let Ok(value) = HeaderValue::from_str(&track.content_type) {
        headers.insert(header::CONTENT_TYPE, value);
    }
    let disposition = match disposition {
        Disposition::Inline => "inline".to_string(),
        Disposition::Attachment => attachment_disposition(&track.filename),
    };
    if let Ok(value) = HeaderValue::from_str(&disposition) {
        headers.insert(header::CONTENT_DISPOSITION, value);
    }
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    Ok(response)
}

/// `Content-Disposition` for a download: a plain ASCII `filename` every client
/// understands, plus the RFC 5987 `filename*` form that keeps non-ASCII names intact.
fn attachment_disposition(filename: &str) -> String {
    let ascii: String = filename
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || " ()-._~".contains(c) {
                c
            } else {
                '_'
            }
        })
        .collect();
    let ascii = if ascii.trim().is_empty() {
        "track".to_string()
    } else {
        ascii
    };

    let mut encoded = String::new();
    for byte in filename.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                encoded.push(*byte as char)
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }

    format!("attachment; filename=\"{ascii}\"; filename*=UTF-8''{encoded}")
}

// --- mutating endpoints -----------------------------------------------------

pub async fn upload_track(
    State(store): State<AppState>,
    multipart: Multipart,
) -> Result<Response, ApiError> {
    let id = Uuid::new_v4().to_string();
    let mut written: Option<PathBuf> = None;

    let track = match read_upload(&store, &id, multipart, &mut written).await {
        Ok(track) => track,
        Err(e) => {
            discard(written).await;
            return Err(e);
        }
    };

    // The file is on disk before the metadata row exists, so a crash here leaves an
    // orphan rather than a row pointing at nothing.
    if let Err(e) = store.insert(track.clone()).await {
        discard(written).await;
        return Err(e.into());
    }

    Ok((StatusCode::CREATED, Json(track)).into_response())
}

#[derive(Debug, Deserialize)]
pub struct UpdateTrack {
    pub title: String,
}

/// Rename a track. Only the title is editable; the file and everything derived from
/// it stay as uploaded.
pub async fn update_track(
    State(store): State<AppState>,
    Path(id): Path<String>,
    body: Result<Json<UpdateTrack>, JsonRejection>,
) -> Result<Json<Track>, ApiError> {
    // axum's own rejection body is plain text; map it so every error stays `{"error": …}`.
    let Json(body) = body.map_err(|e| match e {
        JsonRejection::MissingJsonContentType(_) => {
            ApiError::unsupported_media_type("expected `Content-Type: application/json`")
        }
        _ => ApiError::bad_request("body must be JSON with a `title` string"),
    })?;

    let title = normalize_title(&body.title)
        .ok_or_else(|| ApiError::bad_request("`title` must not be empty"))?;

    store
        .set_title(&id, title)
        .await?
        .map(Json)
        .ok_or_else(|| ApiError::not_found("track not found"))
}

pub async fn delete_track(
    State(store): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    if store.remove(&id).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::not_found("track not found"))
    }
}

/// Consume the multipart body: stream the `file` part to disk and pick up `title`.
async fn read_upload(
    store: &Store,
    id: &str,
    mut multipart: Multipart,
    written: &mut Option<PathBuf>,
) -> Result<Track, ApiError> {
    let mut title: Option<String> = None;
    let mut file_part: Option<(String, String, u64)> = None;

    while let Some(mut field) = multipart.next_field().await.map_err(multipart_error)? {
        match field.name().unwrap_or_default() {
            "title" => {
                title = Some(field.text().await.map_err(multipart_error)?);
            }
            "file" => {
                let filename = sanitize_filename(field.file_name().unwrap_or_default());
                let Some(extension) = extension_of(&filename) else {
                    return Err(ApiError::unsupported_media_type(
                        "unsupported file extension — audio files only",
                    ));
                };
                let content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                if !is_accepted_mime(&content_type) {
                    return Err(ApiError::unsupported_media_type(format!(
                        "unsupported content type: {content_type}"
                    )));
                }

                let path = store.files_dir().join(format!("{id}.{extension}"));
                let mut file = tokio::fs::File::create(&path).await?;
                *written = Some(path);

                let mut size_bytes = 0u64;
                while let Some(chunk) = field.chunk().await.map_err(multipart_error)? {
                    size_bytes += chunk.len() as u64;
                    file.write_all(&chunk).await?;
                }
                file.sync_all().await?;

                file_part = Some((filename, content_type, size_bytes));
            }
            _ => {}
        }
    }

    let Some((filename, content_type, size_bytes)) = file_part else {
        return Err(ApiError::bad_request("missing `file` part"));
    };
    if size_bytes == 0 {
        return Err(ApiError::bad_request("uploaded file is empty"));
    }

    let title = title
        .as_deref()
        .and_then(normalize_title)
        .unwrap_or_else(|| default_title(&filename));

    Ok(Track {
        id: id.to_string(),
        filename,
        title,
        content_type,
        size_bytes,
        uploaded_at: crate::now_rfc3339(),
    })
}

/// Trim a title, drop control characters and cap its length. `None` when nothing
/// usable is left — the caller decides whether that is a fallback or an error.
fn normalize_title(raw: &str) -> Option<String> {
    let cleaned: String = raw
        .chars()
        .filter(|c| !c.is_control())
        .take(TITLE_MAX_CHARS)
        .collect();
    let cleaned = cleaned.trim().to_string();
    (!cleaned.is_empty()).then_some(cleaned)
}

const TITLE_MAX_CHARS: usize = 255;

/// Filename without its extension.
fn default_title(filename: &str) -> String {
    match filename.rsplit_once('.') {
        Some((stem, _)) if !stem.is_empty() => stem.to_string(),
        _ => filename.to_string(),
    }
}

async fn discard(path: Option<PathBuf>) {
    if let Some(path) = path {
        let _ = tokio::fs::remove_file(path).await;
    }
}

fn multipart_error(e: axum::extract::multipart::MultipartError) -> ApiError {
    if e.status() == StatusCode::PAYLOAD_TOO_LARGE {
        ApiError::payload_too_large("file is larger than the configured upload limit")
    } else {
        ApiError::bad_request("malformed multipart request")
    }
}
