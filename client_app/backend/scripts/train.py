#!/usr/bin/env python3
"""VeriCorpus AI - Automated Training Script.

Runs the full training pipeline:
  1. Generate synthetic AI samples
  2. Train ensemble models (LR + RF + GBM)
  3. Evaluate and report metrics
  4. Optionally commit results to git

Usage:
    python scripts/train.py [--no-git] [--config configs/training.yaml]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

# Ensure project root is on sys.path
_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root))


def log(msg: str) -> None:
    ts = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def train(config_path: str | None = None, commit_git: bool = True) -> dict:
    """Run the full training pipeline and return the metrics dict."""
    from app.services.learning_service import learning_service

    log("=== VeriCorpus Training Pipeline ===")

    # 1. Status before training
    status = learning_service.status()
    log(f"Samples before training: {status['total_samples']} (labeled: {status['labeled_samples']})")
    log(f"Label distribution: {status['label_counts']}")

    # 2. Generate synthetic AI samples if needed
    ai_count = status["label_counts"].get("ai_written", 0)

    target_per_class = 100
    if ai_count < target_per_class:
        gen_count = target_per_class - ai_count
        log(f"Generating {gen_count} synthetic AI samples (have {ai_count})...")
        result = learning_service.generate_ai_samples(count=gen_count)
        log(f"Generated: {result['generated']}, total AI samples: {result['total_ai_samples']}")

    # 3. Run training
    log("Starting ensemble training...")
    t0 = time.time()
    learning_service._train()
    elapsed = time.time() - t0
    log(f"Training completed in {elapsed:.1f}s")

    # 4. Fetch results
    status = learning_service.status()
    last_run = status.get("last_run") or {}
    metrics = last_run.get("metrics", {})
    model_version = last_run.get("model_version", "unknown")

    log(f"Model version: {model_version}")
    log(f"Accuracy: {metrics.get('accuracy', 'N/A')}")
    log(f"F1 Score: {metrics.get('f1', 'N/A')}")
    log(f"ROC AUC: {metrics.get('roc_auc', 'N/A')}")
    log(f"Model used: {metrics.get('model_used', 'N/A')}")
    log(f"Total samples: {metrics.get('total_samples', 'N/A')}")

    if "cv_scores" in metrics:
        log("Cross-validation scores:")
        for name, score in metrics["cv_scores"].items():
            log(f"  {name}: {score}")

    # 5. Save training report
    report_dir = _project_root / "data" / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_file = report_dir / f"training_report_{model_version}.json"
    report = {
        "timestamp": datetime.now(UTC).isoformat(),
        "model_version": model_version,
        "elapsed_seconds": round(elapsed, 2),
        "status_before": {
            "total_samples": status["total_samples"],
            "label_counts": status["label_counts"],
        },
        "metrics": metrics,
    }
    report_file.write_text(json.dumps(report, indent=2, default=str))
    log(f"Report saved: {report_file}")

    # 6. Git commit
    if commit_git:
        _git_commit(model_version, metrics)

    log("=== Training Pipeline Complete ===")
    return metrics


def _git_commit(model_version: str, metrics: dict) -> None:
    """Stage data files and commit training results."""
    try:
        repo_root = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            cwd=str(_project_root),
        ).stdout.strip()

        if not repo_root:
            log("Not a git repository, skipping commit.")
            return

        # Stage data and reports (not .env or secrets)
        subprocess.run(
            ["git", "add", "backend/data/reports/"],
            cwd=repo_root,
            capture_output=True,
        )

        acc = metrics.get("accuracy", "?")
        f1 = metrics.get("f1", "?")
        commit_msg = f"chore(training): {model_version} - acc={acc} f1={f1}"

        result = subprocess.run(
            ["git", "commit", "-m", commit_msg],
            cwd=repo_root,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            log(f"Git committed: {commit_msg}")
            push_result = subprocess.run(
                ["git", "push", "origin", "Main"],
                cwd=repo_root,
                capture_output=True,
                text=True,
            )
            if push_result.returncode == 0:
                log("Pushed to origin/Main")
            else:
                log(f"Push failed: {push_result.stderr}")
        else:
            log(f"Nothing to commit or commit failed: {result.stderr.strip()}")

    except Exception as e:
        log(f"Git operation failed: {e}")


def main() -> None:
    parser = argparse.ArgumentParser(description="VeriCorpus AI Training Pipeline")
    parser.add_argument("--no-git", action="store_true", help="Skip git commit/push")
    parser.add_argument("--config", type=str, default=None, help="Path to training config YAML")
    args = parser.parse_args()

    metrics = train(config_path=args.config, commit_git=not args.no_git)
    sys.exit(0 if metrics else 1)


if __name__ == "__main__":
    main()
