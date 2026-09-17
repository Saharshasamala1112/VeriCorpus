"""
Language configuration and capability registry.

Defines supported languages, their capabilities across NLP/embedding/detection
pipelines, and the separation between analysis language (machine-readable,
language-independent) and explanation language (user-facing, localized).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class Language(StrEnum):
    """Supported languages (ISO 639-1 codes)."""

    EN = "en"
    TE = "te"
    HI = "hi"
    TA = "ta"
    KN = "kn"
    ML = "ml"


class AnalysisCapability(StrEnum):
    """What a language can do in the analysis pipeline."""

    TOKENIZATION = "tokenization"
    LANGUAGE_DETECTION = "language_detection"
    EMBEDDING = "embedding"
    SIMILARITY = "similarity"
    PLAGIARISM = "plagiarism"
    AI_DETECTION = "ai_detection"
    STYLOMETRIC = "stylometric"
    NLP_FEATURES = "nlp_features"


@dataclass(frozen=True)
class LanguageProfile:
    """Complete profile for a supported language."""

    code: str
    name: str
    native_name: str
    script: str
    unicode_range_start: int
    unicode_range_end: int
    capabilities: frozenset[AnalysisCapability] = field(default_factory=frozenset)
    ui_supported: bool = True
    explanation_supported: bool = True
    nlp_model_available: bool = False
    embedding_model_available: bool = False
    ai_detection_model_available: bool = False
    fallback_language: str = "en"


# ---------------------------------------------------------------------------
# Language profiles
# ---------------------------------------------------------------------------

LANGUAGE_PROFILES: dict[str, LanguageProfile] = {
    Language.EN: LanguageProfile(
        code="en",
        name="English",
        native_name="English",
        script="Latin",
        unicode_range_start=0x0000,
        unicode_range_end=0x007F,
        capabilities=frozenset(
            [
                AnalysisCapability.TOKENIZATION,
                AnalysisCapability.LANGUAGE_DETECTION,
                AnalysisCapability.EMBEDDING,
                AnalysisCapability.SIMILARITY,
                AnalysisCapability.PLAGIARISM,
                AnalysisCapability.AI_DETECTION,
                AnalysisCapability.STYLOMETRIC,
                AnalysisCapability.NLP_FEATURES,
            ]
        ),
        nlp_model_available=True,
        embedding_model_available=True,
        ai_detection_model_available=True,
    ),
    Language.TE: LanguageProfile(
        code="te",
        name="Telugu",
        native_name="\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41",
        script="Telugu",
        unicode_range_start=0x0C00,
        unicode_range_end=0x0C7F,
        capabilities=frozenset(
            [
                AnalysisCapability.TOKENIZATION,
                AnalysisCapability.LANGUAGE_DETECTION,
                AnalysisCapability.EMBEDDING,
                AnalysisCapability.SIMILARITY,
                AnalysisCapability.AI_DETECTION,
            ]
        ),
        nlp_model_available=True,
        embedding_model_available=True,
        ai_detection_model_available=True,
    ),
    Language.HI: LanguageProfile(
        code="hi",
        name="Hindi",
        native_name="\u0939\u093f\u0928\u094d\u0926\u0940",
        script="Devanagari",
        unicode_range_start=0x0900,
        unicode_range_end=0x097F,
        capabilities=frozenset(
            [
                AnalysisCapability.TOKENIZATION,
                AnalysisCapability.LANGUAGE_DETECTION,
                AnalysisCapability.EMBEDDING,
                AnalysisCapability.SIMILARITY,
                AnalysisCapability.AI_DETECTION,
            ]
        ),
        nlp_model_available=True,
        embedding_model_available=True,
        ai_detection_model_available=True,
    ),
    Language.TA: LanguageProfile(
        code="ta",
        name="Tamil",
        native_name="\u0ba4\u0bae\u0bbf\u0bb4\u0bcd",
        script="Tamil",
        unicode_range_start=0x0B80,
        unicode_range_end=0x0BFF,
        capabilities=frozenset(
            [
                AnalysisCapability.TOKENIZATION,
                AnalysisCapability.LANGUAGE_DETECTION,
                AnalysisCapability.EMBEDDING,
                AnalysisCapability.SIMILARITY,
                AnalysisCapability.AI_DETECTION,
            ]
        ),
        nlp_model_available=False,
        embedding_model_available=True,
        ai_detection_model_available=False,
    ),
    Language.KN: LanguageProfile(
        code="kn",
        name="Kannada",
        native_name="\u0c95\u0ca8\u0ccd\u0ca8\u0ca1",
        script="Kannada",
        unicode_range_start=0x0C80,
        unicode_range_end=0x0CFF,
        capabilities=frozenset(
            [
                AnalysisCapability.TOKENIZATION,
                AnalysisCapability.LANGUAGE_DETECTION,
                AnalysisCapability.EMBEDDING,
                AnalysisCapability.SIMILARITY,
                AnalysisCapability.AI_DETECTION,
            ]
        ),
        nlp_model_available=False,
        embedding_model_available=True,
        ai_detection_model_available=False,
    ),
    Language.ML: LanguageProfile(
        code="ml",
        name="Malayalam",
        native_name="\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02",
        script="Malayalam",
        unicode_range_start=0x0D00,
        unicode_range_end=0x0D7F,
        capabilities=frozenset(
            [
                AnalysisCapability.TOKENIZATION,
                AnalysisCapability.LANGUAGE_DETECTION,
                AnalysisCapability.EMBEDDING,
                AnalysisCapability.SIMILARITY,
                AnalysisCapability.AI_DETECTION,
            ]
        ),
        nlp_model_available=False,
        embedding_model_available=True,
        ai_detection_model_available=False,
    ),
}


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------

SUPPORTED_LANGUAGES: list[str] = [lang.value for lang in Language]
UI_LANGUAGES: list[str] = SUPPORTED_LANGUAGES
EXPLANATION_LANGUAGES: list[str] = SUPPORTED_LANGUAGES
ANALYSIS_LANGUAGES: list[str] = SUPPORTED_LANGUAGES


def get_profile(code: str) -> LanguageProfile:
    """Get language profile by code. Falls back to English for unknown codes."""
    return LANGUAGE_PROFILES.get(code, LANGUAGE_PROFILES[Language.EN])


def has_capability(code: str, capability: AnalysisCapability) -> bool:
    """Check if a language has a specific analysis capability."""
    return capability in get_profile(code).capabilities


def get_supported_languages_for(capability: AnalysisCapability) -> list[str]:
    """Return all language codes that support a given capability."""
    return [code for code, profile in LANGUAGE_PROFILES.items() if capability in profile.capabilities]


def get_fallback_language(code: str) -> str:
    """Get the fallback language for a given language code."""
    return get_profile(code).fallback_language


def is_language_supported(code: str) -> bool:
    """Check if a language code is supported."""
    return code in LANGUAGE_PROFILES


def get_capability_warnings(code: str) -> list[str]:
    """Return warnings about reduced capabilities for a language."""
    profile = get_profile(code)
    warnings = []

    if not profile.nlp_model_available:
        warnings.append(
            f"NLP models not available for {profile.name}. Using rule-based tokenization. Results may be less accurate."
        )
    if not profile.ai_detection_model_available:
        warnings.append(
            f"AI detection model not trained for {profile.name}. "
            "Stylometric features will be used instead. Accuracy is reduced."
        )
    if not profile.embedding_model_available:
        warnings.append(f"Embedding model not available for {profile.name}. Falling back to hash-based embeddings.")
    return warnings
