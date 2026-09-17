#!/usr/bin/env python3
"""VeriCorpus AI - Corpus Synchronization Script.

Fetches human-written text from the Swecha Corpus API and stores
it as labeled training data for the text detection model.

Usage:
    python scripts/sync_corpus.py [--languages en,te,hi] [--max-records 500]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root))


def log(msg: str) -> None:
    ts = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def sync_corpus(languages: list[str], max_records: int = 500) -> dict:
    """Sync corpus data from the Swecha API."""
    from app.services.corpus_service import CorpusService
    from app.services.learning_service import learning_service

    log("=== Corpus Sync Pipeline ===")
    log(f"Languages: {languages}")
    log(f"Max records per language: {max_records}")

    corpus_service = CorpusService()
    total_stored = 0
    total_duplicates = 0
    total_errors = 0

    for lang in languages:
        log(f"Syncing language: {lang}")
        try:
            # Search for records in this language
            loop = asyncio.new_event_loop()
            try:
                records = loop.run_until_complete(
                    corpus_service.search_records(query=lang, limit=min(max_records, 100))
                )
            finally:
                loop.close()

            if not records:
                log(f"  No records found for {lang}")
                continue

            record_list = records if isinstance(records, list) else records.get("items", records.get("results", []))
            log(f"  Fetched {len(record_list)} records")

            # Store as batch
            result = learning_service.store_corpus_batch(record_list, source=f"corpus_api_{lang}")
            total_stored += result["stored"]
            total_duplicates += result["duplicates"]
            total_errors += result["errors"]
            log(f"  Stored: {result['stored']}, Duplicates: {result['duplicates']}, Errors: {result['errors']}")

        except Exception as e:
            log(f"  Error syncing {lang}: {e}")
            total_errors += 1

    # Summary
    status = learning_service.status()
    log("=== Sync Complete ===")
    log(f"New records stored: {total_stored}")
    log(f"Duplicates skipped: {total_duplicates}")
    log(f"Errors: {total_errors}")
    log(f"Total human samples now: {status['label_counts'].get('human_written', 0)}")
    log(f"Total samples: {status['total_samples']}")

    # Save sync report
    report_dir = _project_root / "data" / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_file = report_dir / f"sync_report_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.json"
    report = {
        "timestamp": datetime.now(UTC).isoformat(),
        "languages": languages,
        "max_records": max_records,
        "total_stored": total_stored,
        "total_duplicates": total_duplicates,
        "total_errors": total_errors,
        "status_after": status,
    }
    report_file.write_text(json.dumps(report, indent=2, default=str))
    log(f"Report saved: {report_file}")

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="VeriCorpus AI Corpus Sync")
    parser.add_argument(
        "--languages",
        type=str,
        default="en,te,hi",
        help="Comma-separated language codes (default: en,te,hi)",
    )
    parser.add_argument(
        "--max-records",
        type=int,
        default=500,
        help="Maximum records per language (default: 500)",
    )
    args = parser.parse_args()

    languages = [lang.strip() for lang in args.languages.split(",") if lang.strip()]
    sync_corpus(languages=languages, max_records=args.max_records)


if __name__ == "__main__":
    main()
