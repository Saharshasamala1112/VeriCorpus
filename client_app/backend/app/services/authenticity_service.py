from __future__ import annotations

import hashlib
import math
import mimetypes
from pathlib import Path

from app.services.ai_content_detection import Assessment, DetectionInput, TextAIEnsembleDetector
from app.services.forensic_adapter import forensic_adapter
from app.services.learning_service import learning_service

MEDIA_TYPES = {
    "image": {"image/", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff"},
    "video": {"video/", ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"},
    "audio": {"audio/", ".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"},
    "document": {"application/pdf", ".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".csv"},
}


def _media_type(filename: str, content_type: str | None) -> str:
    mime = (content_type or mimetypes.guess_type(filename)[0] or "").lower()
    suffix = Path(filename).suffix.lower()
    for category, markers in MEDIA_TYPES.items():
        if any(mime.startswith(marker) or mime == marker or suffix == marker for marker in markers):
            return category
    return "unknown"


def _entropy(data: bytes) -> float:
    if not data:
        return 0.0
    counts = [0] * 256
    for value in data:
        counts[value] += 1
    length = len(data)
    return round(-sum((count / length) * math.log2(count / length) for count in counts if count), 3)


def _explanations(media_type: str, language: str) -> tuple[str, str]:
    english = {
        "image": "The file has been received and basic metadata analyzed. A trained image detector is being trained.",
        "video": "The file has been received and basic metadata analyzed. A trained video detector is being trained.",
        "audio": "The file has been received and basic metadata analyzed. A trained audio detector is being trained.",
        "document": "Document received. AI-writing analysis is available for text-based documents.",
        "unknown": "The input format was accepted. Modality-specific analysis is not available for this type yet.",
    }[media_type]
    telugu = {
        "image": "ఫైల్ అందింది మరియు బేసిక్ మెటాడేటా విశ్లేషణ జరిగింది. చిత్ర డిటెక్టర్ శిక్షణ పొందుతోంది.",
        "video": "ఫైల్ అందింది మరియు బేసిక్ మెటాడేటా విశ్లేషణ జరిగింది. వీడియో డిటెక్టర్ శిక్షణ పొందుతోంది.",
        "audio": "ఫైల్ అందింది మరియు బేసిక్ మెటాడేటా విశ్లేషణ జరిగింది. ఆడియో డిటెక్టర్ శిక్షణ పొందుతోంది.",
        "document": "డాక్యుమెంట్ అందింది. టెక్స్ట్ ఆధారిత డాక్యుమెంట్ల కోసం AI-రచన విశ్లేషణ అందుబాటులో ఉంది.",
        "unknown": "ఈ ఇన్‌పుట్ ఫార్మాట్ స్వీకరించబడింది. ఈ రకానికి మోడాలిటీ-నిర్దిష్ట విశ్లేషణ ఇంకా అందుబాటులో లేదు.",
    }[media_type]
    return (telugu, english) if language == "te" else (english, telugu)


def _forensic_explanation(media_type: str, prediction: str, confidence: float, language: str) -> tuple[str, str]:
    is_fake = prediction == "FAKE"
    english = (
        f"VeriCorpus found forensic signals consistent with manipulation in this {media_type}."
        if is_fake
        else f"VeriCorpus found forensic signals more consistent with authentic {media_type}."
    )
    secondary = f"The forensic model's current confidence is {confidence:.0%}. Treat this as model evidence, not absolute proof."
    telugu = (
        f"VeriCorpus ఈ {media_type}లో మార్పుతో అనుకూలంగా ఉన్న ఫోరెన్సిక్ సంకేతాలను గుర్తించింది."
        if is_fake
        else f"VeriCorpus ఈ {media_type}లో అసలైన కంటెంట్‌కు ఎక్కువగా అనుకూలమైన ఫోరెన్సిక్ సంకేతాలను గుర్తించింది."
    )
    telugu_secondary = f"ఫోరెన్సిక్ మోడల్ ప్రస్తుత నమ్మకం {confidence:.0%}. దీన్ని ఖచ్చితమైన రుజువుగా కాకుండా మోడల్ ఆధారంగా చూడండి."
    return (telugu, telugu_secondary) if language == "te" else (english, secondary)


def _normalize_forensic_result(result: dict | None) -> dict | None:
    if not result or result.get("error") or str(result.get("prediction", "")).upper() not in {"REAL", "FAKE"}:
        return None
    prediction = str(result["prediction"]).upper()
    raw_score = result.get("final_score", result.get("cnn_score", result.get("confidence")))
    if raw_score is None:
        return None
    fake_score = float(raw_score)
    fake_score = min(max(fake_score, 0.0), 1.0)
    return {
        "prediction": prediction,
        "fake_score": round(fake_score, 4),
        "confidence": round(max(fake_score, 1.0 - fake_score), 4),
        "model": "VeriCorpus",
        "raw": result,
    }


async def analyze_input(
    data: bytes,
    filename: str = "pasted-input.txt",
    content_type: str | None = None,
    language: str = "en",
    source_url: str | None = None,
    corpus_languages: list[dict] | None = None,
) -> dict:
    media_type = "text" if filename == "pasted-input.txt" else _media_type(filename, content_type)
    primary, secondary = _explanations(media_type if media_type != "text" else "document", language)
    digest = hashlib.sha256(data).hexdigest()
    stored_sample = learning_service.record_sample(data, filename, media_type, content_type, source_url)
    text_detector_result = None
    if media_type in {"text", "document"}:
        text_detector_result = TextAIEnsembleDetector().detect(
            DetectionInput(
                modality="text",
                text=data.decode("utf-8", errors="ignore"),
                language=language,
                metadata={"filename": filename, "content_type": content_type or ""},
            )
        )
    learned_prediction = (
        learning_service.predict_text(data.decode("utf-8", errors="ignore"))
        if media_type in {"text", "document"}
        else None
    )
    forensic_prediction = _normalize_forensic_result(await forensic_adapter.analyze(data, filename, media_type))

    is_text_like = media_type in {"document", "text"}
    if forensic_prediction:
        prediction = forensic_prediction["prediction"]
        confidence = forensic_prediction["confidence"]
        verdict = (
            ("Likely manipulated" if prediction == "FAKE" else "Likely authentic")
            if language != "te"
            else ("మార్చబడిన అవకాశం ఉంది" if prediction == "FAKE" else "అసలైన అవకాశం ఉంది")
        )
        primary, secondary = _forensic_explanation(media_type, prediction, confidence, language)
        signals = [
            {
                "name": "VeriCorpus verdict",
                "value": verdict,
                "detail": "CNN and modality-specific forensic pipeline completed.",
            },
            {
                "name": "Forensic confidence",
                "value": f"{confidence:.0%}",
                "detail": f"Manipulation score: {forensic_prediction['fake_score']:.0%}.",
            },
            {
                "name": "Explainability",
                "value": "Available"
                if forensic_prediction["raw"].get("gradcam") or forensic_prediction["raw"].get("reconstructed")
                else "Score only",
                "detail": "Grad-CAM or reconstruction artifacts may be available from the model pipeline.",
            },
        ]
        if learned_prediction:
            signals.append(
                {
                    "name": "AI-writing signal",
                    "value": f"{learned_prediction['ai_score']:.0%} AI-likelihood",
                    "detail": "Continuous text model signal; separate from media manipulation.",
                }
            )
    elif is_text_like and text_detector_result and text_detector_result.calibrated_probability is not None:
        ai_score = text_detector_result.model_probability
        calibrated_probability = text_detector_result.calibrated_probability
        is_ai = text_detector_result.assessment == Assessment.LIKELY_AI
        confidence = calibrated_probability
        verdict = (
            ("Likely AI-generated" if is_ai else "Likely human-written")
            if language != "te"
            else ("AI-ద్వారా రాయబడిన అవకాశం ఉంది" if is_ai else "మానవుడు రాసిన అవకాశం ఉంది")
        )
        if is_ai:
            primary = f"VeriCorpus's text ensemble estimated a {calibrated_probability:.0%} calibrated probability of AI-generated content."
        else:
            primary = f"VeriCorpus's text ensemble estimated a {calibrated_probability:.0%} calibrated probability of AI-generated content; the assessment is likely human-written."
        secondary = "This estimate combines lexical, stylometric, statistical, and optional trained-model signals. It is probabilistic evidence, not proof of authorship."
        if language == "te":
            if is_ai:
                primary = f"VeriCorpus టెక్స్ట్ ఎన్సెంబుల్ AI-ద్వారా రూపొందించబడిన కంటెంట్‌కు {calibrated_probability:.0%} కేలిబ్రేటెడ్ సంభావ్యతను అంచనా వేసింది."
            else:
                primary = f"VeriCorpus టెక్స్ట్ ఎన్సెంబుల్ AI-ద్వారా రూపొందించబడిన కంటెంట్‌కు {calibrated_probability:.0%} కేలిబ్రేటెడ్ సంభావ్యతను అంచనా వేసింది; అంచనా మానవ రచనకు అనుకూలంగా ఉంది."
            secondary = "ఈ అంచనా లెక్సికల్, స్టైలొమెట్రిక్, గణాంక మరియు అందుబాటులో ఉన్న మోడల్ సంకేతాలను కలుపుతుంది. ఇది రచయితత్వానికి రుజువు కాదు."
        signals = [
            {
                "name": "AI-writing detection",
                "value": f"{calibrated_probability:.0%} calibrated probability",
                "detail": "Lexical, syntactic, stylometric, statistical, and distributional ensemble signal.",
            },
            {
                "name": "Raw model probability",
                "value": f"{ai_score:.0%}" if ai_score is not None else "Unavailable",
                "detail": "Uncalibrated ensemble output before probability calibration.",
            },
            *[
                {
                    "name": signal.name,
                    "value": str(signal.value),
                    "detail": signal.description,
                }
                for signal in text_detector_result.signals
            ][:4],
            {
                "name": "Input integrity",
                "value": "Received",
                "detail": f"SHA-256: {digest[:16]}...",
            },
            {
                "name": "Sample stored",
                "value": "Yes",
                "detail": "This sample is saved for continuous learning.",
            },
        ]
    elif is_text_like:
        verdict = "Text analysis — no model prediction" if language != "te" else "టెక్స్ట్ విశ్లేషణ — మోడల్ అంచనా లేదు"
        confidence = 0.0
        signals = [
            {"name": "Input integrity", "value": "Received", "detail": f"SHA-256: {digest[:16]}..."},
            {
                "name": "Document type",
                "value": Path(filename).suffix.upper() or "Document",
                "detail": "File format classified successfully.",
            },
            {
                "name": "AI-writing model",
                "value": "Not available",
                "detail": "Text model has not been trained yet.",
            },
        ]
    else:
        verdict = "Basic metadata analysis" if language != "te" else "బేసిక్ మెటాడేటా విశ్లేషణ"
        confidence = 0.0
        signals = [
            {"name": "Input integrity", "value": "Received", "detail": f"SHA-256: {digest[:16]}..."},
            {"name": "Modality", "value": media_type.title(), "detail": "Input type classified successfully."},
            {"name": "File size", "value": f"{len(data):,} bytes", "detail": "File received and hashed."},
        ]

    return {
        "status": "likely_manipulated"
        if forensic_prediction and forensic_prediction["prediction"] == "FAKE"
        else "likely_authentic"
        if forensic_prediction
        else (
            "likely_manipulated"
            if is_text_like and text_detector_result and text_detector_result.assessment == Assessment.LIKELY_AI
            else "likely_authentic"
            if is_text_like and text_detector_result and text_detector_result.assessment == Assessment.LIKELY_HUMAN
            else "inconclusive"
        ),
        "verdict": verdict,
        "confidence": confidence,
        "model_probability": text_detector_result.model_probability if text_detector_result else None,
        "calibrated_probability": text_detector_result.calibrated_probability if text_detector_result else None,
        "evidence_strength": text_detector_result.evidence_strength if text_detector_result else 0.0,
        "manipulation_probability": forensic_prediction["fake_score"] if forensic_prediction else None,
        "media_type": media_type,
        "filename": filename,
        "size_bytes": len(data),
        "sha256": digest,
        "source_url": source_url,
        "sample_id": stored_sample["id"],
        "learning": {
            "stored": True,
            "model_prediction": learned_prediction,
            "status": learning_service.status(),
        },
        "detector": {
            "name": "VeriCorpus",
            "status": "active" if forensic_prediction else "unavailable",
            "runtime": forensic_adapter.status(),
            "raw": forensic_prediction["raw"] if forensic_prediction else None,
        },
        "corpus_context": {
            "available": corpus_languages is not None,
            "language_count": len(corpus_languages or []),
            "languages": corpus_languages or [],
            "note": "Corpus language metadata is contextual evidence, not detector training data.",
        },
        "signals": signals,
        "explanation": {"primary": primary, "secondary": secondary, "language": language},
        "limitations": (
            [
                "This result is not a claim that the document is authentic or manipulated.",
                "Document provenance and AI-writing checks require a labeled corpus and a validated detector model.",
            ]
            if forensic_prediction
            else [
                "Multimodal forensic models (image, video, audio) are being trained. Results will improve as models are deployed.",
                "Current analysis uses metadata, file structure, and text classification where applicable.",
            ]
            if not is_text_like
            else [
                *(text_detector_result.limitations if text_detector_result else []),
                "Results are probabilistic evidence and should not be treated as proof of authorship.",
            ]
        ),
    }
