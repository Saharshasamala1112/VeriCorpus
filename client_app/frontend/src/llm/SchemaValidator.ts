import { LLMReasoningOutputSchema } from './types'
import type { LLMReasoningOutput } from './types'

// ─── Schema Validator ────────────────────────────────────────────────────────

export interface ValidationResult {
  success: boolean
  data?: LLMReasoningOutput
  errors?: string[]
  warnings?: string[]
}

export class SchemaValidator {
  private readonly schema = LLMReasoningOutputSchema

  /**
   * Validate LLM output against the schema
   */
  validate(rawOutput: string): ValidationResult {
    const warnings: string[] = []

    // Step 1: Try to parse JSON
    let parsed: unknown
    try {
      parsed = JSON.parse(rawOutput)
    } catch (e) {
      return {
        success: false,
        errors: [`Invalid JSON: ${(e as Error).message}`],
      }
    }

    // Step 2: Validate against schema
    const result = this.schema.safeParse(parsed)

    if (!result.success) {
      const errors = result.error.issues.map((err) => `${err.path.join('.')}: ${err.message}`)
      return {
        success: false,
        errors,
      }
    }

    // Step 3: Additional semantic validation
    const semanticResult = this.validateSemantics(result.data)
    warnings.push(...semanticResult.warnings)

    return {
      success: true,
      data: result.data,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  }

  /**
   * Try to fix common LLM output issues
   */
  tryFix(rawOutput: string): string {
    let fixed = rawOutput

    // Remove markdown code blocks
    fixed = fixed.replace(/^```json\n?/gm, '')
    fixed = fixed.replace(/^```\n?/gm, '')

    // Remove trailing commas
    fixed = fixed.replace(/,\s*([\]}])/g, '$1')

    // Fix common string escaping issues
    fixed = fixed.replace(/\\'/g, "'")

    // Try to extract JSON from the response if it's wrapped in text
    const jsonMatch = fixed.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      fixed = jsonMatch[0]
    }

    return fixed
  }

  /**
   * Build a fallback output when validation fails
   */
  buildFallbackOutput(rawOutput: string, _evidence: { modality: string }): LLMReasoningOutput {
    // Try to extract any useful information from the raw output
    const verdictMatch = rawOutput.match(
      /LIKELY_AUTHENTIC|LIKELY_MANIPULATED|UNCERTAIN|INSUFFICIENT_EVIDENCE/,
    )
    const confidenceMatch = rawOutput.match(/(?:confidence|score)[:\s]*(\d+\.?\d*)/i)

    return {
      assessment: {
        verdict: (verdictMatch?.[0] as LLMReasoningOutput['assessment']['verdict']) || 'UNCERTAIN',
        confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
        reasoning: rawOutput.substring(0, 1000),
        evidenceInterpretation: [],
        confidenceFactors: [],
        uncertaintyNote: 'Output validation failed, using fallback parsing',
      },
      summary: rawOutput.substring(0, 500) || 'Analysis completed with limited confidence',
      confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
      signals: [],
      counterSignals: [],
      evidence: [],
      contradictingEvidence: [],
      sources: [
        {
          type: 'inference',
          description: 'Parsed from unstructured LLM output',
        },
      ],
      similarityMatches: [],
      affectedRegions: [],
      affectedSegments: [],
      limitations: [
        {
          category: 'validation',
          description: 'LLM output failed schema validation, using fallback parsing',
          impact: 'high',
        },
      ],
      recommendedFollowUp: [
        {
          type: 'retry',
          description: 'Retry with a different LLM provider or lower temperature',
          priority: 'medium',
          reason: 'Previous output was not valid JSON',
        },
      ],
    }
  }

  // ── Semantic Validation ────────────────────────────────────────────────────

  private validateSemantics(data: LLMReasoningOutput): {
    warnings: string[]
  } {
    const warnings: string[] = []

    // Check confidence consistency
    if (Math.abs(data.assessment.confidence - data.confidence) > 0.2) {
      warnings.push('Assessment confidence and overall confidence differ by more than 20%')
    }

    // Check for empty evidence interpretation when evidence exists
    if (data.evidence.length > 0 && data.assessment.evidenceInterpretation.length === 0) {
      warnings.push('Evidence items exist but no evidence interpretation provided')
    }

    // Check for evidence marked as not direct when it should be
    const nonDirectEvidence = data.evidence.filter((e) => !e.isDirectEvidence)
    if (nonDirectEvidence.length > data.evidence.length * 0.5) {
      warnings.push(
        'More than 50% of evidence is marked as inference rather than direct observation',
      )
    }

    // Check for conflicting signals
    const supportingSignals = data.signals.filter((s) => s.agreement === 'supports')
    const contradictingSignals = data.counterSignals.filter((s) => s.agreement === 'contradicts')
    if (supportingSignals.length > 0 && contradictingSignals.length > 0) {
      warnings.push(
        'Both supporting and contradicting signals present - assessment may be uncertain',
      )
    }

    // Check for missing follow-up when confidence is low
    if (data.confidence < 0.5 && data.recommendedFollowUp.length === 0) {
      warnings.push('Low confidence but no follow-up actions recommended')
    }

    return { warnings }
  }
}
