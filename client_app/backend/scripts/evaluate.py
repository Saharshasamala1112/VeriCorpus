#!/usr/bin/env python3
"""VeriCorpus AI - Model Evaluation Script.

Evaluates the trained text detection model with detailed metrics,
cross-validation, and confusion matrix analysis.

Usage:
    python scripts/evaluate.py [--verbose]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root))


def log(msg: str) -> None:
    ts = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def evaluate(verbose: bool = False) -> dict:
    """Run full model evaluation."""
    from app.services.learning_service import learning_service

    log("=== Model Evaluation ===")

    # 1. Load data
    with learning_service._lock, learning_service._connect() as connection:
        rows = connection.execute(
            """
            SELECT text_content, label FROM learning_samples
            WHERE text_content IS NOT NULL AND label IN ('human_written', 'ai_written')
            ORDER BY created_at
            """
        ).fetchall()

    if not rows:
        log("No labeled data found. Run training first.")
        return {}

    labels = [row["label"] for row in rows]
    texts = [row["text_content"] for row in rows]
    log(f"Total samples: {len(texts)}")
    log(f"Human-written: {labels.count('human_written')}")
    log(f"AI-written: {labels.count('ai_written')}")

    if len(set(labels)) < 2:
        log("Need at least 2 classes for evaluation.")
        return {}

    # 2. Vectorize and split
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.model_selection import StratifiedKFold, train_test_split

    vectorizer = TfidfVectorizer(
        analyzer="char",
        ngram_range=(2, 4),
        min_df=3,
        max_features=30000,
        sublinear_tf=True,
    )
    features = vectorizer.fit_transform(texts)
    x_train, x_test, y_train, y_test = train_test_split(
        features, labels, test_size=0.2, random_state=42, stratify=labels
    )

    # 3. Cross-validation
    from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import (
        accuracy_score,
        classification_report,
        confusion_matrix,
        f1_score,
        roc_auc_score,
    )

    models = {
        "LogisticRegression": LogisticRegression(max_iter=2000, class_weight="balanced", C=0.5, solver="lbfgs"),
        "RandomForest": RandomForestClassifier(
            n_estimators=200, max_depth=20, class_weight="balanced", random_state=42, n_jobs=-1
        ),
        "GradientBoosting": GradientBoostingClassifier(
            n_estimators=150, max_depth=5, learning_rate=0.1, subsample=0.8, random_state=42
        ),
    }

    log("\n--- Cross-Validation (5-fold) ---")
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_results: dict[str, dict] = {}

    for name, model in models.items():
        fold_f1s = []
        fold_accs = []
        for train_idx, val_idx in skf.split(features, labels):
            x_fold_train = features[train_idx]
            y_fold_train = [labels[i] for i in train_idx]
            x_fold_val = features[val_idx]
            y_fold_val = [labels[i] for i in val_idx]

            from sklearn.base import clone

            fold_model = clone(model)
            fold_model.fit(x_fold_train, y_fold_train)
            preds = fold_model.predict(x_fold_val)
            fold_f1s.append(float(f1_score(y_fold_val, preds, pos_label="ai_written", zero_division=0)))
            fold_accs.append(float(accuracy_score(y_fold_val, preds)))

        mean_f1 = sum(fold_f1s) / len(fold_f1s)
        mean_acc = sum(fold_accs) / len(fold_accs)
        cv_results[name] = {
            "mean_f1": round(mean_f1, 4),
            "std_f1": round(max(fold_f1s) - min(fold_f1s), 4),
            "mean_accuracy": round(mean_acc, 4),
        }
        log(f"  {name}: F1={mean_f1:.4f} (+/- {max(fold_f1s) - min(fold_f1s):.4f}), Acc={mean_acc:.4f}")

    # 4. Train and evaluate each model on test set
    log("\n--- Test Set Evaluation ---")
    test_results: dict[str, dict] = {}

    for name, model in models.items():
        model.fit(x_train, y_train)
        preds = model.predict(x_test)
        proba = model.predict_proba(x_test)

        acc = float(accuracy_score(y_test, preds))
        f1 = float(f1_score(y_test, preds, pos_label="ai_written", zero_division=0))

        try:
            ai_idx = list(model.classes_).index("ai_written") if "ai_written" in model.classes_ else 1
            roc = float(
                roc_auc_score(
                    [1 if lbl == "ai_written" else 0 for lbl in y_test],
                    proba[:, ai_idx],
                )
            )
        except Exception:
            roc = 0.0

        cm = confusion_matrix(y_test, preds, labels=["human_written", "ai_written"]).tolist()

        test_results[name] = {
            "accuracy": round(acc, 4),
            "f1": round(f1, 4),
            "roc_auc": round(roc, 4),
            "confusion_matrix": cm,
        }
        log(f"  {name}: Acc={acc:.4f}, F1={f1:.4f}, ROC={roc:.4f}")

        if verbose:
            log(f"\n  Classification Report ({name}):")
            report = classification_report(y_test, preds, output_dict=True)
            for cls in ["human_written", "ai_written"]:
                if cls in report:
                    log(
                        f"    {cls}: P={report[cls]['precision']:.4f}, "
                        f"R={report[cls]['recall']:.4f}, F1={report[cls]['f1-score']:.4f}"
                    )

    # 5. Feature importance (for GradientBoosting)
    log("\n--- Top Features (GradientBoosting) ---")
    gb_model = models["GradientBoosting"]
    gb_model.fit(x_train, y_train)
    importances = gb_model.feature_importances_
    feature_names = vectorizer.get_feature_names_out()
    top_indices = importances.argsort()[::-1][:20]
    for idx in top_indices:
        log(f"  {feature_names[idx]}: {importances[idx]:.4f}")

    # 6. Summary
    best_name = max(test_results, key=lambda k: test_results[k]["f1"])
    best = test_results[best_name]

    summary = {
        "timestamp": datetime.now(UTC).isoformat(),
        "total_samples": len(texts),
        "human_samples": labels.count("human_written"),
        "ai_samples": labels.count("ai_written"),
        "cv_results": cv_results,
        "test_results": test_results,
        "best_model": best_name,
        "best_f1": best["f1"],
        "best_accuracy": best["accuracy"],
    }

    # Save report
    report_dir = _project_root / "data" / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_file = report_dir / f"evaluation_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.json"
    report_file.write_text(json.dumps(summary, indent=2, default=str))

    log(f"\n=== Best Model: {best_name} ===")
    log(f"F1: {best['f1']}, Accuracy: {best['accuracy']}, ROC AUC: {best['roc_auc']}")
    log(f"Report saved: {report_file}")

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="VeriCorpus AI Model Evaluation")
    parser.add_argument("--verbose", action="store_true", help="Show detailed metrics per class")
    args = parser.parse_args()
    evaluate(verbose=args.verbose)


if __name__ == "__main__":
    main()
