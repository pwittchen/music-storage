//! In-memory track list, its CSV mirror on disk, and the audio files next to it.
//!
//! The whole metadata set is small, so it lives in a `Vec<Track>` behind an `RwLock`
//! and the CSV is rewritten in full after every mutation.

use std::io::{self, Write};
use std::path::{Path, PathBuf};

use tokio::sync::RwLock;

use crate::model::Track;

pub struct Store {
    data_dir: PathBuf,
    tracks: RwLock<Vec<Track>>,
}

impl Store {
    /// Create `data_dir` and `data_dir/files` if missing, create `metadata.csv` with a
    /// header row if missing, and load whatever is already there.
    pub fn open(data_dir: PathBuf) -> io::Result<Self> {
        std::fs::create_dir_all(&data_dir)?;
        std::fs::create_dir_all(data_dir.join("files"))?;

        let csv_path = data_dir.join("metadata.csv");
        let tracks = if csv_path.exists() {
            load_csv(&csv_path)?
        } else {
            let tracks = Vec::new();
            write_csv(&csv_path, &tracks)?;
            tracks
        };

        Ok(Self {
            data_dir,
            tracks: RwLock::new(tracks),
        })
    }

    pub fn files_dir(&self) -> PathBuf {
        self.data_dir.join("files")
    }

    fn csv_path(&self) -> PathBuf {
        self.data_dir.join("metadata.csv")
    }

    pub fn file_path(&self, track: &Track) -> PathBuf {
        self.files_dir().join(track.stored_file_name())
    }

    /// All tracks, newest first, optionally narrowed by a case-insensitive substring.
    pub async fn list(&self, query: Option<&str>) -> Vec<Track> {
        let query = query.map(str::trim).filter(|q| !q.is_empty());
        let needle = query.map(str::to_lowercase);

        let tracks = self.tracks.read().await;
        let mut found: Vec<(usize, &Track)> = tracks
            .iter()
            .enumerate()
            .filter(|(_, t)| needle.as_deref().is_none_or(|q| t.matches(q)))
            .collect();
        // RFC 3339 UTC timestamps of a fixed width sort lexicographically; upload order
        // breaks ties between two tracks stored in the same second.
        found.sort_by(|(i, a), (j, b)| b.uploaded_at.cmp(&a.uploaded_at).then(j.cmp(i)));
        found.into_iter().map(|(_, t)| t.clone()).collect()
    }

    pub async fn get(&self, id: &str) -> Option<Track> {
        self.tracks
            .read()
            .await
            .iter()
            .find(|t| t.id == id)
            .cloned()
    }

    /// Append a track to the list and persist the CSV. The audio file must already
    /// be on disk: a crash may leave an orphaned file, never a row without a file.
    pub async fn insert(&self, track: Track) -> io::Result<()> {
        let mut tracks = self.tracks.write().await;
        tracks.push(track);
        write_csv(&self.csv_path(), &tracks)
    }

    /// Remove the metadata row (persisting the CSV first), then the audio file.
    /// Returns `false` if the id is unknown.
    pub async fn remove(&self, id: &str) -> io::Result<bool> {
        let mut tracks = self.tracks.write().await;
        let Some(index) = tracks.iter().position(|t| t.id == id) else {
            return Ok(false);
        };
        let removed = tracks.remove(index);

        if let Err(e) = write_csv(&self.csv_path(), &tracks) {
            tracks.insert(index, removed);
            return Err(e);
        }
        drop(tracks);

        let path = self.files_dir().join(removed.stored_file_name());
        match std::fs::remove_file(&path) {
            Ok(()) => {}
            // The row is already gone; a missing file is not an error worth failing on.
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(e),
        }
        Ok(true)
    }
}

fn load_csv(path: &Path) -> io::Result<Vec<Track>> {
    let mut reader = csv::Reader::from_path(path)?;
    let mut tracks = Vec::new();
    for record in reader.deserialize() {
        let track: Track = record.map_err(io::Error::other)?;
        tracks.push(track);
    }
    Ok(tracks)
}

const CSV_HEADER: [&str; 6] = [
    "id",
    "filename",
    "title",
    "content_type",
    "size_bytes",
    "uploaded_at",
];

/// Write the whole list to `metadata.csv.tmp`, fsync it, then rename over the real file.
/// The header is written explicitly so an empty list still produces a valid file.
fn write_csv(path: &Path, tracks: &[Track]) -> io::Result<()> {
    let tmp_path = path.with_extension("csv.tmp");

    let mut writer = csv::WriterBuilder::new()
        .has_headers(false)
        .from_path(&tmp_path)?;
    writer.write_record(CSV_HEADER).map_err(io::Error::other)?;
    for track in tracks {
        writer.serialize(track).map_err(io::Error::other)?;
    }
    writer.flush()?;

    let mut file = writer
        .into_inner()
        .map_err(|e| io::Error::other(e.to_string()))?;
    file.flush()?;
    file.sync_all()?;
    drop(file);

    std::fs::rename(&tmp_path, path)
}
