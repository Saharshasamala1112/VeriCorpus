import type {
  ExplanationTemplate,
  VerdictCategory,
  ConfidenceLevel,
  HumanExplanation,
} from '../types/explainability'
import { getExplanationTemplate } from '../i18n'

/**
 * ExplanationLocalization layer.
 *
 * Separates machine-readable results (language-independent) from
 * human-readable explanations (localized). The analysis result is
 * never retrained or reprocessed to change the UI language.
 */

export function getLocalizedTemplate(langCode: string): ExplanationTemplate {
  return getExplanationTemplate(langCode)
}

/**
 * Interpolates a template string with variable values.
 * Variables use {{key}} syntax.
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{{${key}}}`,
  )
}

/**
 * Localizes a confidence value into a human-readable string.
 */
export function localizedConfidence(confidence: number, template: ExplanationTemplate): string {
  return `${template.confidenceLabel}: ${(confidence * 100).toFixed(0)}%`
}

/**
 * Generates a risk-level badge label from a confidence score.
 */
export function confidenceBadgeVariant(
  confidence: number,
): 'success' | 'warning' | 'danger' | 'info' {
  if (confidence >= 0.8) return 'danger'
  if (confidence >= 0.6) return 'warning'
  if (confidence >= 0.3) return 'info'
  return 'success'
}

/**
 * Returns the localized verdict label for a verdict category.
 */
export function getVerdictLabel(
  verdictCategory: VerdictCategory,
  template: ExplanationTemplate,
): string {
  switch (verdictCategory) {
    case 'likely_manipulated':
      return template.verdict.likelyManipulated
    case 'likely_authentic':
      return template.verdict.likelyAuthentic
    case 'inconclusive':
      return template.verdict.inconclusive
  }
}

/**
 * Returns the localized confidence level label.
 */
export function getConfidenceLevelLabel(
  level: ConfidenceLevel,
  template: ExplanationTemplate,
): string {
  const keyMap: Record<ConfidenceLevel, keyof typeof template.confidenceLevel> = {
    very_high: 'veryHigh',
    high: 'high',
    moderate: 'moderate',
    low: 'low',
    very_low: 'veryLow',
  }
  return template.confidenceLevel[keyMap[level]]
}

/**
 * Localizes the human-readable explanation using template interpolation.
 */
export function localizeHumanExplanation(
  human: HumanExplanation,
  _template: ExplanationTemplate,
  vars: Record<string, string | number> = {},
): HumanExplanation {
  return {
    summary: interpolate(human.summary, vars),
    why: interpolate(human.why, vars),
    keyFactors: human.keyFactors.map((f) => interpolate(f, vars)),
    confidenceBreakdown: interpolate(human.confidenceBreakdown, vars),
    limitations: interpolate(human.limitations, vars),
  }
}

/**
 * Wraps ExplanationResult with localized template for rendering.
 * The result object stays language-independent; the template provides UI strings.
 */
export interface LocalizedExplanation {
  template: ExplanationTemplate
  language: string
}

export function createLocalizedExplanation(langCode: string): LocalizedExplanation {
  return {
    template: getExplanationTemplate(langCode),
    language: langCode,
  }
}
