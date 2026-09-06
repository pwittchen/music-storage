# syntax=docker/dockerfile:1

# Build stage. The registry and target directories are BuildKit caches, so a rebuild
# after a source edit does not download and recompile every dependency again.
FROM rust:1-slim-bookworm AS builder

WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked \
    && cp target/release/plainsong /usr/local/bin/plainsong

# Runtime stage: the binary, the static files, and curl for the health check.
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home --home-dir /app plainsong

WORKDIR /app
COPY --from=builder /usr/local/bin/plainsong /usr/local/bin/plainsong
# The server resolves `static/` relative to the working directory.
COPY static ./static

# Owned by the app user so a fresh named volume inherits that ownership.
RUN install -d -o plainsong -g plainsong /data

USER plainsong

ENV PLAINSONG_DATA_DIR=/data \
    PLAINSONG_ADDR=0.0.0.0:8080

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/api/tracks -o /dev/null || exit 1

CMD ["plainsong"]
