import { describe, it, expect, beforeEach } from 'vitest'
import { ExplanationEngine } from '../services/explanation.service'
import type { AuthenticityResult } from '../services/authenticity.service'

// Mock AuthenticityResult factory
const createMockResult = (overrides: Partial<AuthenticityResult> = {}): AuthenticityResult => ({
  media_type: 'text',
  status: 'likely_manipulated',
  confidence: 0.85,
  verdict: 'AI-generated text detected',
  size_bytes: 1024,
  sha256: 'abc123',
  sample_id: 'test-001',
  signals: [
    { name: 'AI Detection', value: 'High', detail: 'Strong AI indicators detected' },
    { name: 'Vocabulary Consistency', value: '92%', detail: 'Consistent vocabulary patterns' },
    { name: 'Burstiness Score', value: '0.23', detail: 'Low burstiness indicates AI' },
  ],
  explanation: {
    primary: 'Analysis indicates AI-generated content',
    secondary: 'TF-IDF + Logistic Regression classifier',
    language: 'en',
  },
  detector: {
    name: 'VeriCorpus Text Classifier',
    status: 'active',
    runtime: {
      configured: true,
      ready: true,
      model_path: 'models/v1.2/classifier.pkl',
      error: null,
    },
    raw: { dataset_version: 'v2.0' },
  },
  learning: {
    stored: true,
    model_prediction: { ai_score: 0.85, model: 'tfidf_lr' },
    status: {
      total_samples: 100,
      labeled_samples: 80,
      label_counts: { real: 40, ai: 40 },
      model_ready: true,
      last_run: {
        status: 'completed',
        sample_count: 80,
        metrics: { accuracy: 0.9, f1: 0.88 },
        completed_at: '2026-09-10T00:00:00Z',
      },
    },
  },
  limitations: ['Single modality analysis', 'No cross-reference with external databases'],
  filename: 'test.txt',
  manipulation_probability: 0.85,
  corpus_context: {
    available: false,
    language_count: 0,
    languages: [],
    note: '',
  },
  ...overrides,
})

describe('ExplanationEngine', () => {
  beforeEach(() => {
    // Clear cache before each test
    ExplanationEngine.explain(createMockResult()) // This populates cache, but we'll test caching separately
  })

  describe('classifyVerdict', () => {
    it('classifies likely_manipulated correctly', () => {
      expect(ExplanationEngine.classifyVerdict('likely_manipulated')).toBe('likely_manipulated')
    })

    it('classifies likely_authentic correctly', () => {
      expect(ExplanationEngine.classifyVerdict('likely_authentic')).toBe('likely_authentic')
    })

    it('classifies unknown status as inconclusive', () => {
      expect(ExplanationEngine.classifyVerdict('unknown')).toBe('inconclusive')
      expect(ExplanationEngine.classifyVerdict('')).toBe('inconclusive')
    })
  })

  describe('classifyConfidence', () => {
    it('classifies very high confidence (>= 0.9)', () => {
      expect(ExplanationEngine.classifyConfidence(0.95)).toBe('very_high')
      expect(ExplanationEngine.classifyConfidence(0.9)).toBe('very_high')
    })

    it('classifies high confidence (>= 0.75)', () => {
      expect(ExplanationEngine.classifyConfidence(0.85)).toBe('high')
      expect(ExplanationEngine.classifyConfidence(0.75)).toBe('high')
    })

    it('classifies moderate confidence (>= 0.5)', () => {
      expect(ExplanationEngine.classifyConfidence(0.65)).toBe('moderate')
      expect(ExplanationEngine.classifyConfidence(0.5)).toBe('moderate')
    })

    it('classifies low confidence (>= 0.3)', () => {
      expect(ExplanationEngine.classifyConfidence(0.4)).toBe('low')
      expect(ExplanationEngine.classifyConfidence(0.3)).toBe('low')
    })

    it('classifies very low confidence (< 0.3)', () => {
      expect(ExplanationEngine.classifyConfidence(0.2)).toBe('very_low')
      expect(ExplanationEngine.classifyConfidence(0)).toBe('very_low')
    })
  })

  describe('explain', () => {
    it('returns empty explanation for null/undefined input', () => {
      const result = ExplanationEngine.explain(null as unknown as AuthenticityResult)
      expect(result.assessment).toBe('Analysis result unavailable')
      expect(result.confidence).toBe(0)
      expect(result.verdictCategory).toBe('inconclusive')
      expect(result.supportingSignals).toHaveLength(0)
      expect(result.counterSignals).toHaveLength(0)
    })

    it('generates structured explanation for manipulated content', () => {
      const mockResult = createMockResult()
      const explanation = ExplanationEngine.explain(mockResult)

      expect(explanation.assessment).toBe('AI-generated text detected')
      expect(explanation.verdictCategory).toBe('likely_manipulated')
      expect(explanation.modality).toBe('text')
      expect(explanation.supportingSignals.length).toBeGreaterThan(0)
      expect(explanation.evidence.length).toBeGreaterThan(0)
      expect(explanation.humanExplanation.summary).toContain('AI-generated')
    })

    it('generates structured explanation for authentic content', () => {
      const mockResult = createMockResult({
        status: 'likely_authentic',
        confidence: 0.88,
        verdict: 'Human-written text',
      })
      const explanation = ExplanationEngine.explain(mockResult)

      expect(explanation.verdictCategory).toBe('likely_authentic')
      expect(explanation.humanExplanation.summary).toContain('human')
    })

    it('handles missing signals gracefully', () => {
      const mockResult = createMockResult({ signals: [] })
      const explanation = ExplanationEngine.explain(mockResult)

      expect(explanation.supportingSignals).toHaveLength(0)
      expect(explanation.counterSignals).toHaveLength(0)
      expect(explanation.evidence.length).toBeGreaterThan(0) // Still has classifier evidence
    })

    it('extracts text-specific evidence', () => {
      const mockResult = createMockResult({ media_type: 'text' })
      const explanation = ExplanationEngine.explain(mockResult)

      const linguisticEvidence = explanation.evidence.filter(
        (e) => e.type === 'linguistic_signal' || e.type === 'text_span',
      )
      expect(linguisticEvidence.length).toBeGreaterThan(0)
    })

    it('extracts image-specific evidence', () => {
      const mockResult = createMockResult({
        media_type: 'image',
        detector: {
          name: 'VeriCorpus Image Forensics',
          status: 'active',
          runtime: {
            configured: true,
            ready: true,
            model_path: 'models/v2.0/forensics.pt',
            error: null,
          },
          raw: {
            gradcam: true,
            suspicious_regions: [{ x: 10, y: 20, width: 50, height: 50 }],
          },
        },
      })
      const explanation = ExplanationEngine.explain(mockResult)

      const imageEvidence = explanation.evidence.filter(
        (e) => e.type === 'saliency_map' || e.type === 'suspicious_region',
      )
      expect(imageEvidence.length).toBeGreaterThan(0)
    })

    it('applies Bayesian confidence adjustment', () => {
      const mockResult = createMockResult({ confidence: 0.8 })
      const explanation = ExplanationEngine.explain(mockResult)

      // Bayesian adjustment should modify the confidence
      expect(explanation.confidence).not.toBe(mockResult.confidence)
    })

    it('builds human-readable explanation', () => {
      const mockResult = createMockResult()
      const explanation = ExplanationEngine.explain(mockResult)

      expect(explanation.humanExplanation.summary).toBeTruthy()
      expect(explanation.humanExplanation.why).toBeTruthy()
      expect(explanation.humanExplanation.keyFactors.length).toBeGreaterThan(0)
      expect(explanation.humanExplanation.confidenceBreakdown).toBeTruthy()
    })

    it('includes methodology information', () => {
      const mockResult = createMockResult()
      const explanation = ExplanationEngine.explain(mockResult)

      expect(explanation.methodology.name).toContain('VeriCorpus')
      expect(explanation.methodology.description).toBeTruthy()
    })
  })

  describe('caching', () => {
    it('returns cached result for identical inputs', () => {
      const mockResult = createMockResult()
      const result1 = ExplanationEngine.explain(mockResult)
      const result2 = ExplanationEngine.explain(mockResult)

      // Should be the same object reference (cached)
      expect(result1).toBe(result2)
    })

    it('returns different result for different inputs', () => {
      const result1 = ExplanationEngine.explain(createMockResult({ confidence: 0.8 }))
      const result2 = ExplanationEngine.explain(createMockResult({ confidence: 0.9 }))

      // Should be different objects
      expect(result1).not.toBe(result2)
      expect(result1.confidence).not.toBe(result2.confidence)
    })
  })

  describe('cross-signal correlation', () => {
    it('boosts weights for signals with category agreement', () => {
      const mockResult = createMockResult({
        signals: [
          { name: 'AI Detection Score', value: '0.92', detail: 'High AI probability' },
          {
            name: 'AI Detection Confidence',
            value: '0.88',
            detail: 'High confidence in detection',
          },
          { name: 'AI Detection Verdict', value: 'manipulated', detail: 'AI verdict positive' },
        ],
      })
      const explanation = ExplanationEngine.explain(mockResult)

      // Detection signals should have boosted weights (0.9 base + 0.15 boost = 1.05, clamped to 1.0)
      const detectionSignals = explanation.supportingSignals.filter((s) =>
        s.name.toLowerCase().includes('detection'),
      )
      expect(detectionSignals.length).toBeGreaterThan(0)
      detectionSignals.forEach((sig) => {
        expect(sig.weight).toBeGreaterThanOrEqual(0.85)
      })
    })
  })
})
