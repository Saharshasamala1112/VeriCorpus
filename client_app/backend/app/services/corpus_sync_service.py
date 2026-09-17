"""Enhanced corpus synchronization service with batch processing and quality filtering."""

from __future__ import annotations

import asyncio
import hashlib
import re
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import settings
from app.logger import logger


class CorpusSyncService:
    """Batch corpus synchronization with quality filtering and deduplication."""

    def __init__(self, db_path: str | None = None) -> None:
        self.database_path = Path(db_path or settings.LEARNING_DB_PATH)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._batch_size = 100
        self._min_text_length = 50
        self._max_text_length = 10000
        self._quality_filters = {
            "min_word_count": 10,
            "max_repeated_words_ratio": 0.3,
            "min_unique_word_ratio": 0.4,
            "max_punctuation_ratio": 0.3,
            "min_alpha_ratio": 0.5,
        }

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

    def filter_quality(self, text: str) -> tuple[bool, str]:
        """Filter text based on quality metrics. Returns (passed, reason)."""
        if not text or not text.strip():
            return False, "empty_text"

        text = text.strip()

        # Length check
        if len(text) < self._min_text_length:
            return False, f"too_short_{len(text)}_<_{self._min_text_length}"
        if len(text) > self._max_text_length:
            return False, f"too_long_{len(text)}>_{self._max_text_length}"

        words = text.split()
        filters = self._quality_filters

        # Word count
        if len(words) < filters["min_word_count"]:
            return False, f"few_words_{len(words)}"

        # Repeated words ratio
        word_counts: dict[str, int] = {}
        for w in words:
            low = w.lower()
            word_counts[low] = word_counts.get(low, 0) + 1
        if words:
            max_repeat = max(word_counts.values())
            repeat_ratio = max_repeat / len(words)
            if repeat_ratio > filters["max_repeated_words_ratio"]:
                return False, f"high_repetition_{repeat_ratio:.2f}"

        # Unique word ratio
        unique_ratio = len(word_counts) / len(words)
        if unique_ratio < filters["min_unique_word_ratio"]:
            return False, f"low_uniqueness_{unique_ratio:.2f}"

        # Punctuation ratio
        punct_count = sum(1 for c in text if c in ".,;:!?\"'()-")
        punct_ratio = punct_count / max(len(text), 1)
        if punct_ratio > filters["max_punctuation_ratio"]:
            return False, f"high_punctuation_{punct_ratio:.2f}"

        # Alpha ratio
        alpha_count = sum(1 for c in text if c.isalpha())
        alpha_ratio = alpha_count / max(len(text), 1)
        if alpha_ratio < filters["min_alpha_ratio"]:
            return False, f"low_alpha_{alpha_ratio:.2f}"

        # Check for excessive newlines or whitespace
        newline_ratio = text.count("\n") / max(len(text.split()), 1)
        if newline_ratio > 0.5:
            return False, f"excessive_newlines_{newline_ratio:.2f}"

        return True, "passed"

    def normalize_text(self, text: str) -> str:
        """Normalize text for consistent training data."""
        # Normalize whitespace
        text = re.sub(r"\s+", " ", text)
        # Normalize quotes
        text = re.sub(r"[" "']", '"', text)
        # Normalize dashes
        text = re.sub(r"[\u2014\u2013]", "-", text)
        # Strip leading/trailing whitespace
        text = text.strip()
        return text

    def store_corpus_batch(
        self,
        records: list[dict],
        source: str = "corpus_api",
    ) -> dict:
        """Store a batch of corpus records with quality filtering."""
        stored = 0
        filtered = 0
        duplicates = 0
        errors = 0

        with self._connect() as connection:
            for record in records:
                try:
                    record_id = record.get("id", str(uuid.uuid4()))
                    title = record.get("title", "")
                    description = record.get("description", "")
                    media_type = record.get("media_type", "text")

                    text = f"{title}\n\n{description}".strip()
                    if not text:
                        errors += 1
                        continue

                    # Normalize
                    text = self.normalize_text(text)

                    # Quality filter
                    passed, reason = self.filter_quality(text)
                    if not passed:
                        filtered += 1
                        logger.debug(f"Filtered record {record_id}: {reason}")
                        continue

                    # Deduplication
                    sha = hashlib.sha256(text.encode()).hexdigest()
                    existing = connection.execute("SELECT id FROM learning_samples WHERE sha256 = ?", (sha,)).fetchone()
                    if existing:
                        duplicates += 1
                        continue

                    # Store
                    sample_id = str(uuid.uuid4())
                    now = datetime.now(UTC).isoformat()
                    connection.execute(
                        """
                        INSERT INTO learning_samples
                        (id, sha256, filename, media_type, content_type, content, text_content,
                         label, label_source, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            sample_id,
                            sha,
                            f"corpus_{record_id}.txt",
                            media_type,
                            "text/plain",
                            text.encode(),
                            text,
                            "human_written",
                            source,
                            now,
                            now,
                        ),
                    )
                    connection.execute(
                        "INSERT OR IGNORE INTO corpus_sync (id, record_id, synced_at) VALUES (?, ?, ?)",
                        (str(uuid.uuid4()), record_id, now),
                    )
                    stored += 1
                except Exception as e:
                    errors += 1
                    logger.error(f"Error storing record: {e}")

        return {
            "stored": stored,
            "filtered": filtered,
            "duplicates": duplicates,
            "errors": errors,
            "total_processed": len(records),
        }

    def sync_from_corpus_api(
        self,
        corpus_service,
        languages: list[str] | None = None,
        max_records: int = 500,
    ) -> dict:
        """Synchronize records from the Swecha Corpus API."""
        if languages is None:
            languages = ["en", "te", "hi", "ta", "kn"]

        total_stored = 0
        total_filtered = 0
        total_duplicates = 0
        total_errors = 0

        for lang in languages:
            try:
                # Fetch records for this language
                loop = asyncio.new_event_loop()
                try:
                    records = loop.run_until_complete(
                        corpus_service.search_records(query=lang, limit=min(max_records, 100))
                    )
                finally:
                    loop.close()

                if not records:
                    continue

                # Handle different response formats
                record_list = records if isinstance(records, list) else records.get("items", records.get("results", []))

                result = self.store_corpus_batch(record_list, source=f"corpus_api_{lang}")
                total_stored += result["stored"]
                total_filtered += result["filtered"]
                total_duplicates += result["duplicates"]
                total_errors += result["errors"]

                logger.info(
                    f"Lang {lang}: stored={result['stored']}, "
                    f"filtered={result['filtered']}, dupes={result['duplicates']}"
                )
            except Exception as e:
                logger.error(f"Error syncing language {lang}: {e}")
                total_errors += 1

        return {
            "languages_synced": len(languages),
            "total_stored": total_stored,
            "total_filtered": total_filtered,
            "total_duplicates": total_duplicates,
            "total_errors": total_errors,
        }

    def get_sync_stats(self) -> dict:
        """Get synchronization statistics."""
        with self._connect() as connection:
            total = connection.execute(
                "SELECT COUNT(*) as count FROM learning_samples WHERE label = 'human_written'"
            ).fetchone()
            synced = connection.execute("SELECT COUNT(*) as count FROM corpus_sync").fetchone()
            by_source = connection.execute(
                "SELECT label_source, COUNT(*) as count FROM learning_samples WHERE label = 'human_written' GROUP BY label_source"
            ).fetchall()

        return {
            "total_human_samples": total["count"] if total else 0,
            "total_synced_records": synced["count"] if synced else 0,
            "by_source": {row["label_source"]: row["count"] for row in by_source} if by_source else {},
        }
