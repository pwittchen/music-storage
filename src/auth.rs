//! Bearer-token middleware, applied only to the mutating routes.

use std::sync::Arc;

use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::Response;

use crate::api::ApiError;

/// Reject the request unless it carries `Authorization: Bearer <token>` with the
/// configured token.
pub async fn require_token(
    State(expected): State<Arc<String>>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let header = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());

    let presented = match header {
        Some(value) => value
            .strip_prefix("Bearer ")
            .ok_or_else(|| ApiError::unauthorized("malformed Authorization header"))?,
        None => return Err(ApiError::unauthorized("missing Authorization header")),
    };

    if !constant_time_eq(presented.as_bytes(), expected.as_bytes()) {
        return Err(ApiError::forbidden("invalid token"));
    }

    Ok(next.run(request).await)
}

/// Compare two byte slices without an early exit on the first differing byte.
/// The lengths themselves are not secret.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
