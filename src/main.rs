//! music-storage — a self-hosted web app and REST API for storing and playing
//! music files. Configuration comes from environment variables only; see README.md.

mod api;
mod auth;
mod model;
mod store;

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;

use axum::extract::DefaultBodyLimit;
use axum::routing::{delete, get, post};
use axum::Router;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use tower_http::services::ServeDir;

use crate::store::Store;

struct Config {
    token: String,
    data_dir: PathBuf,
    addr: String,
    max_upload_bytes: usize,
}

fn load_config() -> Result<Config, String> {
    let token = std::env::var("MUSIC_STORAGE_TOKEN").unwrap_or_default();
    if token.trim().is_empty() {
        return Err(
            "MUSIC_STORAGE_TOKEN is not set. Set it to a non-empty secret before starting, \
             e.g. MUSIC_STORAGE_TOKEN=$(openssl rand -hex 32) cargo run"
                .to_string(),
        );
    }

    let data_dir = PathBuf::from(env_or("MUSIC_STORAGE_DATA_DIR", "./data"));

    // MUSIC_STORAGE_ADDR sets host and port together; MUSIC_STORAGE_PORT overrides just
    // the port, so the port can be changed without repeating the bind host.
    let mut addr = env_or("MUSIC_STORAGE_ADDR", "127.0.0.1:8080");
    if let Ok(raw_port) = std::env::var("MUSIC_STORAGE_PORT") {
        if !raw_port.trim().is_empty() {
            let port: u16 = raw_port.trim().parse().map_err(|_| {
                format!("MUSIC_STORAGE_PORT is not a port number (0-65535): {raw_port}")
            })?;
            addr = replace_port(&addr, port);
        }
    }

    let raw_max = env_or("MUSIC_STORAGE_MAX_UPLOAD_MB", "100");
    let max_mb: usize = raw_max
        .parse()
        .map_err(|_| format!("MUSIC_STORAGE_MAX_UPLOAD_MB is not a number: {raw_max}"))?;
    if max_mb == 0 {
        return Err("MUSIC_STORAGE_MAX_UPLOAD_MB must be greater than zero".to_string());
    }

    Ok(Config {
        token,
        data_dir,
        addr,
        max_upload_bytes: max_mb * 1024 * 1024,
    })
}

/// Swap the port in a bind address, keeping the host. Handles the bracketed IPv6 form
/// (`[::1]:8080`) and an address that carries no port at all.
fn replace_port(addr: &str, port: u16) -> String {
    match addr.rsplit_once(':') {
        Some((host, tail)) if !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()) => {
            format!("{host}:{port}")
        }
        _ => format!("{addr}:{port}"),
    }
}

fn env_or(key: &str, default: &str) -> String {
    match std::env::var(key) {
        Ok(value) if !value.trim().is_empty() => value,
        _ => default.to_string(),
    }
}

/// Current time as an RFC 3339 UTC timestamp with second precision.
pub fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .replace_nanosecond(0)
        .expect("0 is a valid nanosecond")
        .format(&Rfc3339)
        .expect("RFC 3339 formatting cannot fail for a UTC timestamp")
}

fn build_router(store: Arc<Store>, token: Arc<String>, max_upload_bytes: usize) -> Router {
    // The auth layer guards only the mutating methods; `GET`s stay public.
    let guard = axum::middleware::from_fn_with_state(token, auth::require_token);

    let tracks = get(api::list_tracks).merge(
        post(api::upload_track)
            .route_layer(guard.clone())
            .layer(DefaultBodyLimit::max(max_upload_bytes)),
    );
    let track = get(api::get_track).merge(delete(api::delete_track).route_layer(guard));

    let api_routes = Router::new()
        .route("/tracks", tracks)
        .route("/tracks/{id}", track)
        .route("/tracks/{id}/stream", get(api::stream_track));

    Router::new()
        .nest("/api", api_routes)
        .fallback_service(ServeDir::new("static"))
        .with_state(store)
}

#[tokio::main]
async fn main() -> ExitCode {
    let config = match load_config() {
        Ok(config) => config,
        Err(message) => {
            eprintln!("music-storage: {message}");
            return ExitCode::FAILURE;
        }
    };

    let store = match Store::open(config.data_dir.clone()) {
        Ok(store) => Arc::new(store),
        Err(e) => {
            eprintln!(
                "music-storage: cannot use data directory {}: {e}",
                config.data_dir.display()
            );
            return ExitCode::FAILURE;
        }
    };

    if !std::path::Path::new("static").is_dir() {
        eprintln!(
            "music-storage: warning — ./static not found relative to the working directory; \
             the web interface will return 404s"
        );
    }

    let app = build_router(store, Arc::new(config.token), config.max_upload_bytes);

    let listener = match tokio::net::TcpListener::bind(&config.addr).await {
        Ok(listener) => listener,
        Err(e) => {
            eprintln!("music-storage: cannot bind {}: {e}", config.addr);
            return ExitCode::FAILURE;
        }
    };

    // Report what was actually bound, so a port picked by the OS (port 0) is not misreported.
    let bound = listener
        .local_addr()
        .map(|a| a.to_string())
        .unwrap_or_else(|_| config.addr.clone());

    println!(
        "music-storage listening on http://{bound} (data dir: {}, max upload: {} MB)",
        config.data_dir.display(),
        config.max_upload_bytes / 1024 / 1024
    );

    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("music-storage: server error: {e}");
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}
