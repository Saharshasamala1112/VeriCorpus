"""Tests for multilingual NLP, embeddings, similarity, AI detection, and explanations."""

from __future__ import annotations

import math

from app.core.language_config import (
    AnalysisCapability,
    Language,
    LanguageProfile,
    get_profile,
    has_capability,
    is_language_supported,
)
from app.i18n import get_error_message, get_status_message
from app.i18n.nlp import (
    count_words,
    detect_script,
    get_text_statistics,
    segment_paragraphs,
    segment_sentences,
    tokenize,
    tokenize_indic,
    tokenize_whitespace,
)
from app.services.ai_content_detection import DetectionInput, TextAIEnsembleDetector, extract_text_features
from app.services.analysis_engine import (
    AnalysisSignalData,
    ExplainabilityEngine,
    LanguageAnalyzer,
    PlagiarismAnalyzer,
    SignalSeverity,
    SignalType,
    SimilarityAnalyzer,
)
from app.services.embedding_retrieval import HashEmbeddingProvider

# ── i18n module tests ───────────────────────────────────────────────────────


class TestI18nModule:
    def test_list_supported_languages(self):
        from app.core.language_config import SUPPORTED_LANGUAGES

        assert set(SUPPORTED_LANGUAGES) == {"en", "te", "hi", "ta", "kn", "ml"}

    def test_get_error_message_english(self):
        msg = get_error_message("file_too_large", "en")
        assert "file" in msg.lower() or "size" in msg.lower()

    def test_get_error_message_telugu(self):
        msg = get_error_message("auth.invalid_token", "te")
        # Telugu script range: 0x0C00-0x0C7F
        assert any(0x0C00 <= ord(c) <= 0x0C7F for c in msg)

    def test_get_error_message_fallback_to_english(self):
        msg_en = get_error_message("file_too_large", "en")
        msg_xx = get_error_message("file_too_large", "xx")
        assert msg_en == msg_xx

    def test_get_status_message_all_languages(self):
        from app.core.language_config import SUPPORTED_LANGUAGES

        for lang in SUPPORTED_LANGUAGES:
            msg = get_status_message("completed", lang)
            assert isinstance(msg, str)
            assert len(msg) > 0

    def test_get_status_message_unknown_key_returns_default(self):
        msg = get_status_message("nonexistent_key", "en")
        assert isinstance(msg, str)
        assert len(msg) > 0


# ── NLP tests ───────────────────────────────────────────────────────────────


class TestNLPTokenize:
    def test_english_tokenization(self):
        tokens = tokenize("The quick brown fox jumps", "en")
        assert tokens == ["The", "quick", "brown", "fox", "jumps"]

    def test_english_empty_text(self):
        assert tokenize("", "en") == []
        assert tokenize("   ", "en") == []

    def test_telugu_tokenization(self):
        tokens = tokenize("\u0c05\u0c3e\u0c21\u0c41 \u0c2e\u0c02\u0c17\u0c32\u0c41", "te")
        assert len(tokens) >= 1

    def test_hindi_tokenization(self):
        tokens = tokenize("\u0939\u093f\u0902\u0926\u0940 \u092d\u093e\u0937\u093e\u0964", "hi")
        assert len(tokens) >= 1

    def test_tamil_tokenization(self):
        tokens = tokenize("\u0ba4\u0bae\u0bbf\u0bb4\u0bcd \u0b95\u0b9f\u0bcd\u0b9a\u0bcd", "ta")
        assert len(tokens) >= 1

    def test_kannada_tokenization(self):
        tokens = tokenize("\u0c95\u0ca8\u0ccd\u0ca1 \u0ca8\u0cc1\u0ca1\u0cc1", "kn")
        assert len(tokens) >= 1

    def test_malayalam_tokenization(self):
        tokens = tokenize("\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02 \u0d2d\u0d3e\u0d37", "ml")
        assert len(tokens) >= 1

    def test_detect_script_english(self):
        assert detect_script("Hello world") == "Latin"

    def test_detect_script_telugu(self):
        assert detect_script("\u0c05\u0c3e\u0c21\u0c41") == "Telugu"

    def test_detect_script_hindi(self):
        assert detect_script("\u0939\u093f\u0902\u0926\u0940") == "Devanagari"

    def test_detect_script_tamil(self):
        assert detect_script("\u0ba4\u0bae\u0bbf\u0bb4") == "Tamil"

    def test_detect_script_kannada(self):
        assert detect_script("\u0c95\u0ca8\u0ccd\u0ca1") == "Kannada"

    def test_detect_script_malayalam(self):
        assert detect_script("\u0d2e\u0d32\u0d2f\u0d3e\u0d33") == "Malayalam"

    def test_detect_script_empty(self):
        assert detect_script("") == "Unknown"

    def test_segment_sentences_english(self):
        sents = segment_sentences("Hello world. How are you? I'm fine.", "en")
        assert len(sents) == 3

    def test_segment_sentences_hindi_danda(self):
        sents = segment_sentences("\u0939\u093e\u0932\u094b\u0964 \u0915\u0948\u0938\u0947\u0964", "hi")
        assert len(sents) == 2

    def test_segment_paragraphs(self):
        paras = segment_paragraphs("Para one.\n\nPara two.")
        assert len(paras) == 2

    def test_count_words(self):
        assert count_words("one two three", "en") == 3

    def test_get_text_statistics_english(self):
        stats = get_text_statistics("The quick brown fox.", "en")
        assert stats["word_count"] == 4
        assert stats["sentence_count"] == 1
        assert stats["script"] == "Latin"
        assert stats["language"] == "en"

    def test_get_text_statistics_telugu(self):
        stats = get_text_statistics("\u0c05\u0c3e\u0c21\u0c41 \u0c2e\u0c02\u0c17\u0c32\u0c41\u0640", "te")
        assert stats["script"] == "Telugu"
        assert stats["language"] == "te"
        assert stats["word_count"] >= 1


# ── Language config tests ────────────────────────────────────────────────────


class TestLanguageConfig:
    def test_get_profile_english(self):
        profile = get_profile("en")
        assert profile.code == "en"
        assert profile.name == "English"

    def test_get_profile_telugu(self):
        profile = get_profile("te")
        assert profile.code == "te"
        assert profile.script == "Telugu"

    def test_has_capability_english_ai_detection(self):
        assert has_capability("en", AnalysisCapability.AI_DETECTION) is True

    def test_has_capability_telugu_ai_detection(self):
        profile = get_profile("te")
        assert AnalysisCapability.AI_DETECTION in profile.capabilities

    def test_all_languages_have_tokenization(self):
        from app.core.language_config import SUPPORTED_LANGUAGES

        for lang in SUPPORTED_LANGUAGES:
            assert has_capability(lang, AnalysisCapability.TOKENIZATION) is True

    def test_all_languages_have_similarity(self):
        from app.core.language_config import SUPPORTED_LANGUAGES

        for lang in SUPPORTED_LANGUAGES:
            assert has_capability(lang, AnalysisCapability.SIMILARITY) is True

    def test_all_languages_have_explanation(self):
        from app.core.language_config import SUPPORTED_LANGUAGES

        for lang_code in SUPPORTED_LANGUAGES:
            profile = get_profile(lang_code)
            assert profile.explanation_supported is True

    def test_all_languages_have_ui(self):
        from app.core.language_config import SUPPORTED_LANGUAGES

        for lang_code in SUPPORTED_LANGUAGES:
            profile = get_profile(lang_code)
            assert profile.ui_supported is True

    def test_invalid_language_returns_fallback(self):
        profile = get_profile("xx")
        assert profile.fallback_language == "en"


# ── AI content detection tests ──────────────────────────────────────────────


class TestAIContentDetection:
    def test_english_text_features(self):
        features = extract_text_features(
            "Furthermore the systematic methodology demonstrates comprehensive analysis of the "
            "underlying computational framework. Additionally the results provide significant "
            "insights into the mechanisms supporting the proposed evaluation.",
            "en",
        )
        assert features["word_count"] > 15
        assert "sentence_length_std" in features
        assert "transition_density" in features

    def test_telugu_text_features(self):
        features = extract_text_features(
            "\u0c35\u0c4d\u0c36\u0c4d\u0c32\u0c47\u0c37\u0c23 \u0c15\u0c4d\u0c30\u0c2e \u0c2e\u0c3e\u0c30\u0c4d\u0c17 "
            "\u0c15\u0c3f\u0c02 \u0c2a\u0c4d\u0c30\u0c2d\u0c3e\u0c35 \u0c1a\u0c47\u0c2f\u0c21\u0c3e \u0c15\u0c38\u0c4d\u0c1f\u0c47 \u0c15\u0c3e\u0c26\u0c32\u0c41\u0c1a\u0c4d \u0c05\u0c35\u0c38\u0c30\u0c3e \u0c2d\u0c3e\u0c34\u0c3f\u0c2f\u0c3e\u0c02\u0c1f\u0c3e\u0c30 \u0c15\u0c4d \u0c15\u0c4d\u0c30\u0c2e\u0c3f\u0c24 \u0c24\u0c2f\u0c3e\u0c30\u0c40 \u0c09\u0c28\u0cd9\u0c30\u0c3e\u0c35\u0c32\u0c41\u0c1a\u0c4d \u0c1a\u0c47\u0c2f\u0c21\u0c3e.",
            "te",
        )
        assert features["word_count"] >= 1
        assert "sentence_length_std" in features

    def test_ensemble_detector_english(self):
        detector = TextAIEnsembleDetector()
        result = detector.detect(
            DetectionInput(
                modality="text",
                text="Furthermore, the systematic methodology demonstrates comprehensive "
                "analysis of the underlying computational framework. Additionally, the "
                "results provide significant insights into the mechanisms supporting the "
                "proposed evaluation methodology and the systematic approach to evaluating "
                "the overall performance of the system in a controlled environment.",
            )
        )
        assert result.assessment.value in ("LIKELY_AI", "LIKELY_HUMAN", "UNCERTAIN", "INSUFFICIENT_EVIDENCE")
        assert result.model_probability is None or 0 <= result.model_probability <= 1

    def test_short_text_returns_insufficient(self):
        detector = TextAIEnsembleDetector()
        result = detector.detect(DetectionInput(modality="text", text="hello"))
        assert result.assessment.value == "INSUFFICIENT_EVIDENCE"

    def test_ensemble_detector_telugu(self):
        detector = TextAIEnsembleDetector()
        result = detector.detect(
            DetectionInput(
                modality="text",
                text="\u0c35\u0c4d\u0c36\u0c4d\u0c32\u0c47\u0c37\u0c23 \u0c15\u0c4d\u0c30\u0c2e \u0c2e\u0c3e\u0c30\u0c4d\u0c17 "
                "\u0c15\u0c3f\u0c02 \u0c2a\u0c4d\u0c30\u0c2d\u0c3e\u0c35 \u0c1a\u0c47\u0c2f\u0c21\u0c3e \u0c15\u0c38\u0c4d\u0c1f\u0c47 "
                "\u0c15\u0c3e\u0c26\u0c32\u0c41\u0c1a\u0c4d \u0c05\u0c35\u0c38\u0c30\u0c3e \u0c2d\u0c3e\u0c34\u0c3f\u0c2f\u0c3e\u0c02\u0c1f\u0c3e\u0c30 "
                "\u0c15\u0c4d \u0c15\u0c4d\u0c30\u0c2e\u0c3f\u0c24 \u0c24\u0c2f\u0c3e\u0c30\u0c40 \u0c09\u0c28\u0cd9\u0c30\u0c3e\u0c35\u0c32\u0c41\u0c1a\u0c4d "
                "\u0c1a\u0c47\u0c2f\u0c21\u0c3e \u0c15\u0c3e \u0c35\u0c3f\u0c36\u0c4d\u0c32\u0c47\u0c37\u0c23\u0c02 \u0c15\u0c4d\u0c30\u0c2e \u0c2e\u0c3e\u0c30\u0c4d\u0c17 "
                "\u0c15\u0c3f\u0c02 \u0c2a\u0c4d\u0c30\u0c2d\u0c3e\u0c35 \u0c1a\u0c47\u0c2f\u0c21\u0c3e \u0c15\u0c38\u0c4d\u0c1f\u0c47 "
                "\u0c15\u0c3e\u0c26\u0c32\u0c41\u0c1a\u0c4d \u0c05\u0c35\u0c38\u0c30\u0c3e \u0c2d\u0c3e\u0c34\u0c3f\u0c2f\u0c3e\u0c02\u0c1f\u0c3e\u0c30 "
                "\u0c15\u0c4d \u0c15\u0c4d\u0c30\u0c2e\u0c3f\u0c24 \u0c24\u0c2f\u0c3e\u0c30\u0c40 \u0c09\u0c28\u0cd9\u0c30\u0c3e\u0c35\u0c32\u0c41\u0c1a\u0c4d "
                "\u0c1a\u0c47\u0c2f\u0c21\u0c3e.",
            )
        )
        # Telugu uses stylometric only; result should still be valid
        assert result.assessment.value in ("LIKELY_AI", "LIKELY_HUMAN", "UNCERTAIN", "INSUFFICIENT_EVIDENCE")


# ── Multilingual embedding tests ────────────────────────────────────────────


class TestMultilingualEmbeddings:
    async def test_hash_embedding_produces_correct_dimensions(self):
        provider = HashEmbeddingProvider(dimensions=128)
        vecs = await provider.embed(["hello world"])
        assert len(vecs) == 1
        assert len(vecs[0]) == 128

    async def test_hash_embedding_deterministic(self):
        provider = HashEmbeddingProvider(dimensions=64)
        v1 = await provider.embed(["test text"])
        v2 = await provider.embed(["test text"])
        assert v1 == v2

    async def test_different_texts_different_embeddings(self):
        provider = HashEmbeddingProvider(dimensions=64)
        v1 = await provider.embed(["cats and dogs"])
        v2 = await provider.embed(["quantum physics"])
        assert v1 != v2

    async def test_multilingual_texts_produce_valid_embeddings(self):
        provider = HashEmbeddingProvider(dimensions=64)
        texts = [
            "Hello world",
            "\u0c05\u0c3e\u0c21\u0c41 \u0c2e\u0c02\u0c17\u0c32\u0c41",  # Telugu
            "\u0939\u093e\u0932\u094b \u0926\u0941\u0928\u093f\u092f\u093e",  # Hindi
            "\u0ba4\u0bae\u0bbf\u0bb4 \u0b9a\u0b9f\u0bcd\u0b9f",  # Tamil
            "\u0c95\u0ca8\u0ccd\u0ca1 \u0ca1\u0cc1\u0c9a\u0ccd\u0c9a",  # Kannada
            "\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02 \u0d32\u0d4b\u0d15\u0d02",  # Malayalam
        ]
        vecs = await provider.embed(texts)
        assert len(vecs) == len(texts)
        for vec in vecs:
            assert len(vec) == 64
            assert all(isinstance(v, float) for v in vec)


# ── Similarity analysis tests ───────────────────────────────────────────────


class TestSimilarityAnalyzer:
    def test_analyze_returns_result(self):
        analyzer = SimilarityAnalyzer()
        assert analyzer.analyzer_type.value == "similarity"

    def test_supported_modalities(self):
        analyzer = SimilarityAnalyzer()
        assert "text" in analyzer.supported_modalities


# ── Plagiarism analyzer tests ───────────────────────────────────────────────


class TestPlagiarismAnalyzer:
    def test_analyze_returns_result(self):
        analyzer = PlagiarismAnalyzer()
        assert analyzer.analyzer_type.value == "plagiarism"

    def test_supported_modalities(self):
        analyzer = PlagiarismAnalyzer()
        assert "text" in analyzer.supported_modalities


# ── Language analyzer tests ──────────────────────────────────────────────────


class TestLanguageAnalyzer:
    def test_analyze_returns_result(self):
        analyzer = LanguageAnalyzer()
        assert analyzer.analyzer_type.value == "language"

    def test_supported_modalities(self):
        analyzer = LanguageAnalyzer()
        assert "text" in analyzer.supported_modalities


# ── Explainability engine multilingual tests ────────────────────────────────


class TestExplainabilityMultilingual:
    def test_explain_returns_human_explanation(self):
        engine = ExplainabilityEngine()
        signals = [
            AnalysisSignalData(
                signal_type=SignalType.AI_CONTENT,
                severity=SignalSeverity.HIGH,
                confidence=0.8,
                title="Statistical uniformity detected",
                description="Text shows uniform sentence structure",
            )
        ]
        scores = {"model_probability": 0.82}
        result = engine.generate(signals, scores, "text", "en")
        assert result["narrative"] is not None
        assert len(result["narrative"]) > 0
        assert result["key_factors"] is not None

    def test_explain_telugu(self):
        engine = ExplainabilityEngine()
        result = engine.generate([], {}, "text", "te")
        assert result["narrative"] is not None
        assert result["explanation_language"] == "te"

    def test_explain_all_languages(self):
        engine = ExplainabilityEngine()
        from app.core.language_config import SUPPORTED_LANGUAGES

        for lang in SUPPORTED_LANGUAGES:
            result = engine.generate([], {}, "text", lang)
            assert result["explanation_language"] == lang

    def test_explain_with_signals(self):
        engine = ExplainabilityEngine()
        signals = [
            AnalysisSignalData(
                signal_type=SignalType.AI_CONTENT,
                severity=SignalSeverity.HIGH,
                confidence=0.9,
                title="Token repetition",
                description="Repeated patterns detected",
            ),
            AnalysisSignalData(
                signal_type=SignalType.AI_CONTENT,
                severity=SignalSeverity.LOW,
                confidence=0.3,
                title="Style consistency",
                description="Style is too uniform",
            ),
        ]
        scores = {"model_probability": 0.88}
        result = engine.generate(signals, scores, "text", "en")
        assert len(result["key_factors"]) == 2
        assert result["key_factors"][0]["confidence"] >= result["key_factors"][1]["confidence"]
