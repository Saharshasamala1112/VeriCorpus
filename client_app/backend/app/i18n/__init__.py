"""
Backend i18n module.

Provides multilingual support for the VeriCorpus AI backend including:
- Language configuration and capability registry
- Locale resources for error/status messages
- Multilingual NLP tokenization
- Language-aware text processing
"""

from app.core.language_config import (
    ANALYSIS_LANGUAGES,
    EXPLANATION_LANGUAGES,
    LANGUAGE_PROFILES,
    SUPPORTED_LANGUAGES,
    UI_LANGUAGES,
    AnalysisCapability,
    Language,
    LanguageProfile,
    get_capability_warnings,
    get_fallback_language,
    get_profile,
    get_supported_languages_for,
    has_capability,
    is_language_supported,
)
from app.i18n.locales import (
    get_error_message,
    get_status_message,
)

__all__ = [
    "ANALYSIS_LANGUAGES",
    "EXPLANATION_LANGUAGES",
    "LANGUAGE_PROFILES",
    "SUPPORTED_LANGUAGES",
    "UI_LANGUAGES",
    "AnalysisCapability",
    "Language",
    "LanguageProfile",
    "get_capability_warnings",
    "get_error_message",
    "get_fallback_language",
    "get_profile",
    "get_status_message",
    "get_supported_languages_for",
    "has_capability",
    "is_language_supported",
]
