import type {
  ModalityAnalyzer,
  TextInput,
  ModalityAnalysisResult,
  ModalitySignal,
  EvidenceItem,
  AffectedRegion,
} from '../types'

// ─── Text Feature Extraction ─────────────────────────────────────────────────

interface TextFeatures {
  wordCount: number
  sentenceCount: number
  avgSentenceLength: number
  vocabularyDiversity: number
  personalPronounDensity: number
  transitionPhraseDensity: number
  fillerWordDensity: number
  errorNaturalness: number
  sentenceLengthVariance: number
  paragraphCount: number
  avgParagraphLength: number
  punctuationEntropy: number
  capitalizationAnomaly: boolean
  repeatedPhraseCount: number
  semanticCohesionScore: number
  perplexityEstimate: number
  burstinessScore: number
}

interface LinguisticAnomaly {
  type: string
  severity: 'high' | 'medium' | 'low'
  description: string
  startIndex?: number
  endIndex?: number
}

// ─── Text Analyzer ───────────────────────────────────────────────────────────

export class TextAnalyzer implements ModalityAnalyzer<TextInput> {
  modality = 'text' as const

  private readonly FILLER_WORDS = new Set([
    'um',
    'uh',
    'like',
    'actually',
    'basically',
    'literally',
    'honestly',
    'obviously',
    'clearly',
    'definitely',
    'certainly',
    'absolutely',
    'totally',
    'completely',
    'entirely',
    'utterly',
  ])

  private readonly TRANSITION_PHRASES = new Set([
    'furthermore',
    'moreover',
    'additionally',
    'consequently',
    'therefore',
    'however',
    'nevertheless',
    'nonetheless',
    'in addition',
    'on the other hand',
    'for example',
    'in conclusion',
    'to summarize',
    'as a result',
  ])

  private readonly AI_HEDGING_PATTERNS = [
    /\b(it's worth noting|it is worth noting)\b/gi,
    /\b(in conclusion|to conclude|in summary|to summarize)\b/gi,
    /\b(as we can see|as you can see|it's clear that)\b/gi,
    /\b(let's delve|let us delve|dive into|delves into)\b/gi,
    /\b(in this essay|in this article|in this piece)\b/gi,
    /\b(the purpose of|the goal of|the aim of)\b/gi,
  ]

  private readonly HUMAN_WRITING_MARKERS = [
    /\b(I think|I believe|in my opinion|from my perspective)\b/gi,
    /\b(honestly|frankly|to be honest|truth be told)\b/gi,
    /\b(weirdly|surprisingly|unfortunately|fortunately)\b/gi,
    /\b(kind of|sort of|a bit|a little)\b/gi,
    /\b(wanna|gonna|gotta|y'all|ain't)\b/gi,
  ]

  async analyze(input: TextInput): Promise<ModalityAnalysisResult> {
    const text = input.content
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const affectedRegions: AffectedRegion[] = []
    const affectedSegments: AffectedRegion[] = []
    const limitations: string[] = []

    if (!text || text.trim().length < 50) {
      limitations.push('Text too short for meaningful analysis')
      return {
        signals: [],
        counterSignals: [],
        evidence: [],
        affectedRegions: [],
        affectedSegments: [],
        limitations,
        metadata: { error: 'insufficient_text' },
      }
    }

    const features = this.extractFeatures(text)
    const anomalies = this.detectAnomalies(text, features)

    // ── Provenance Analysis ──────────────────────────────────────────────
    const provenanceSignals = this.analyzeProvenance(text, input, features)
    signals.push(...provenanceSignals.supporting)
    counterSignals.push(...provenanceSignals.counter)
    evidence.push(...provenanceSignals.evidence)

    // ── Semantic Consistency ─────────────────────────────────────────────
    const semanticSignals = this.analyzeSemanticConsistency(text, features)
    signals.push(...semanticSignals.supporting)
    counterSignals.push(...semanticSignals.counter)
    evidence.push(...semanticSignals.evidence)

    // ── Generated Content Signals ────────────────────────────────────────
    const generatedSignals = this.analyzeGeneratedContent(text, features)
    signals.push(...generatedSignals.supporting)
    counterSignals.push(...generatedSignals.counter)
    evidence.push(...generatedSignals.evidence)

    // ── Contradiction Analysis ───────────────────────────────────────────
    const contradictionSignals = this.analyzeContradictions(text, features)
    signals.push(...contradictionSignals.supporting)
    counterSignals.push(...contradictionSignals.counter)
    evidence.push(...contradictionSignals.evidence)

    // ── Source Evidence ──────────────────────────────────────────────────
    const sourceSignals = this.analyzeSourceEvidence(text, input)
    signals.push(...sourceSignals.supporting)
    counterSignals.push(...sourceSignals.counter)
    evidence.push(...sourceSignals.evidence)

    // ── Linguistic Signal Analysis ───────────────────────────────────────
    const linguisticSignals = this.analyzeLinguisticSignals(text, features, anomalies)
    signals.push(...linguisticSignals.supporting)
    counterSignals.push(...linguisticSignals.counter)
    evidence.push(...linguisticSignals.evidence)
    affectedRegions.push(...linguisticSignals.regions)

    // ── Compute Metadata ─────────────────────────────────────────────────
    const metadata: Record<string, unknown> = {
      features,
      anomalies,
      textLength: text.length,
      wordCount: features.wordCount,
      sentenceCount: features.sentenceCount,
    }

    return {
      signals,
      counterSignals,
      evidence,
      affectedRegions,
      affectedSegments,
      limitations,
      metadata,
    }
  }

  // ── Feature Extraction ─────────────────────────────────────────────────────

  private extractFeatures(text: string): TextFeatures {
    const words = text.split(/\s+/).filter((w) => w.length > 0)
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0)

    const wordFreq = new Map<string, number>()
    for (const word of words) {
      const lower = word.toLowerCase().replace(/[^a-z]/g, '')
      if (lower.length > 2) {
        wordFreq.set(lower, (wordFreq.get(lower) || 0) + 1)
      }
    }

    const uniqueWords = [...wordFreq.values()].filter((c) => c === 1).length
    const totalWords = [...wordFreq.values()].reduce((a, b) => a + b, 0)

    const sentenceLengths = sentences.map((s) => s.split(/\s+/).length)
    const avgSentenceLength =
      sentenceLengths.length > 0
        ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
        : 0
    const sentenceLengthVariance = this.calculateVariance(sentenceLengths)

    const personalPronouns = ['i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours']
    const pronounCount = words.filter((w) => personalPronouns.includes(w.toLowerCase())).length
    const personalPronounDensity = words.length > 0 ? pronounCount / words.length : 0

    const transitionCount = words.filter((w) => this.TRANSITION_PHRASES.has(w.toLowerCase())).length
    const transitionPhraseDensity = words.length > 0 ? transitionCount / words.length : 0

    const fillerCount = words.filter((w) => this.FILLER_WORDS.has(w.toLowerCase())).length
    const fillerWordDensity = words.length > 0 ? fillerCount / words.length : 0

    const punctuationText = text.replace(/[a-zA-Z0-9\s]/g, '')
    const punctFreq = new Map<string, number>()
    for (const ch of punctuationText) {
      punctFreq.set(ch, (punctFreq.get(ch) || 0) + 1)
    }
    const punctuationEntropy = this.calculateEntropy([...punctFreq.values()])

    const errorPatterns = [/[a-z][A-Z]/g, /\s{2,}/g, /[.!?]{2,}/g]
    let errorCount = 0
    for (const pattern of errorPatterns) {
      errorCount += (text.match(pattern) || []).length
    }
    const errorNaturalness = Math.min(1, errorCount / (words.length * 0.01))

    const repeatedPhrases = this.findRepeatedPhrases(text, 3)

    return {
      wordCount: words.length,
      sentenceCount: sentences.length,
      avgSentenceLength,
      vocabularyDiversity: totalWords > 0 ? uniqueWords / totalWords : 0,
      personalPronounDensity,
      transitionPhraseDensity,
      fillerWordDensity,
      errorNaturalness,
      sentenceLengthVariance,
      paragraphCount: paragraphs.length,
      avgParagraphLength:
        paragraphs.length > 0
          ? paragraphs.reduce((a, p) => a + p.split(/\s+/).length, 0) / paragraphs.length
          : 0,
      punctuationEntropy,
      capitalizationAnomaly: this.checkCapitalizationAnomaly(text),
      repeatedPhraseCount: repeatedPhrases.length,
      semanticCohesionScore: this.estimateSemanticCohesion(text),
      perplexityEstimate: this.estimatePerplexity(text),
      burstinessScore: this.calculateBurstiness(sentenceLengths),
    }
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    return values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / values.length
  }

  private calculateEntropy(frequencies: number[]): number {
    const total = frequencies.reduce((a, b) => a + b, 0)
    if (total === 0) return 0
    return -frequencies.reduce((entropy, freq) => {
      const p = freq / total
      return p > 0 ? entropy + p * Math.log2(p) : entropy
    }, 0)
  }

  private calculateBurstiness(sentenceLengths: number[]): number {
    if (sentenceLengths.length < 4) return 0.5
    const mid = Math.floor(sentenceLengths.length / 2)
    const firstHalf = sentenceLengths.slice(0, mid)
    const secondHalf = sentenceLengths.slice(mid)
    const meanFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
    const meanSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
    const diff = Math.abs(meanFirst - meanSecond)
    const maxLen = Math.max(...sentenceLengths)
    return maxLen > 0 ? diff / maxLen : 0
  }

  private estimateSemanticCohesion(text: string): number {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)
    if (sentences.length < 2) return 0.5

    let cohesionScore = 0
    const overlapThreshold = 0.1

    for (let i = 1; i < sentences.length; i++) {
      const prevWords = new Set(sentences[i - 1].toLowerCase().split(/\s+/))
      const currWords = new Set(sentences[i].toLowerCase().split(/\s+/))
      let overlap = 0
      for (const word of currWords) {
        if (prevWords.has(word) && word.length > 3) overlap++
      }
      const overlapRatio = currWords.size > 0 ? overlap / currWords.size : 0
      cohesionScore += overlapRatio > overlapThreshold ? 1 : 0
    }

    return cohesionScore / (sentences.length - 1)
  }

  private estimatePerplexity(text: string): number {
    const words = text.split(/\s+/).filter((w) => w.length > 0)
    if (words.length < 10) return 0.5

    const bigramFreq = new Map<string, number>()
    const unigramFreq = new Map<string, number>()

    for (let i = 0; i < words.length; i++) {
      const word = words[i].toLowerCase()
      unigramFreq.set(word, (unigramFreq.get(word) || 0) + 1)
      if (i > 0) {
        const bigram = `${words[i - 1].toLowerCase()}_${word}`
        bigramFreq.set(bigram, (bigramFreq.get(bigram) || 0) + 1)
      }
    }

    let logProbSum = 0
    for (let i = 1; i < words.length; i++) {
      const bigram = `${words[i - 1].toLowerCase()}_${words[i].toLowerCase()}`
      const bigramCount = bigramFreq.get(bigram) || 0
      const unigramCount = unigramFreq.get(words[i - 1].toLowerCase()) || 1
      const prob = bigramCount / unigramCount
      logProbSum += Math.log2(prob + 1e-10)
    }

    const entropy = -logProbSum / words.length
    return Math.min(1, entropy / 15)
  }

  private findRepeatedPhrases(text: string, minWords: number): string[] {
    const words = text.toLowerCase().split(/\s+/)
    const phrases = new Map<string, number>()
    const repeated: string[] = []

    for (let len = minWords; len <= Math.min(8, words.length); len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const phrase = words.slice(i, i + len).join(' ')
        const count = (phrases.get(phrase) || 0) + 1
        phrases.set(phrase, count)
        if (count === 2) repeated.push(phrase)
      }
    }

    return repeated
  }

  private checkCapitalizationAnomaly(text: string): boolean {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)
    let anomalies = 0
    for (const sentence of sentences) {
      const trimmed = sentence.trim()
      if (trimmed.length > 0 && trimmed[0] !== trimmed[0].toUpperCase()) {
        anomalies++
      }
    }
    return sentences.length > 5 && anomalies / sentences.length > 0.2
  }

  // ── Provenance Analysis ────────────────────────────────────────────────────

  private analyzeProvenance(
    text: string,
    input: TextInput,
    _features: TextFeatures,
  ): { supporting: ModalitySignal[]; counter: ModalitySignal[]; evidence: EvidenceItem[] } {
    const supporting: ModalitySignal[] = []
    const counter: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    if (input.sourceUrl) {
      counter.push({
        name: 'Source URL Provided',
        category: 'provenance',
        value: 0.8,
        direction: 'counter',
        severity: 'medium',
        detail: 'Content has a source URL, suggesting external reference',
      })
    }

    if (input.metadata?.author) {
      counter.push({
        name: 'Author Identified',
        category: 'provenance',
        value: 0.6,
        direction: 'counter',
        severity: 'low',
        detail: 'Content has an identified author',
      })
    }

    const hasAttribution = /\b(according to|as stated by|published in|source:|reference:)\b/i.test(
      text,
    )
    if (hasAttribution) {
      counter.push({
        name: 'External Attribution',
        category: 'provenance',
        value: 0.5,
        direction: 'counter',
        severity: 'low',
        detail: 'Text contains references to external sources',
      })
    }

    if (!input.sourceUrl && !input.metadata?.author && !hasAttribution) {
      supporting.push({
        name: 'No Provenance',
        category: 'provenance',
        value: 0.3,
        direction: 'supporting',
        severity: 'low',
        detail: 'No source URL, author, or external attribution found',
      })
    }

    return { supporting, counter, evidence }
  }

  // ── Semantic Consistency ────────────────────────────────────────────────────

  private analyzeSemanticConsistency(
    text: string,
    features: TextFeatures,
  ): { supporting: ModalitySignal[]; counter: ModalitySignal[]; evidence: EvidenceItem[] } {
    const supporting: ModalitySignal[] = []
    const counter: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)

    // Check for topic drift
    if (sentences.length > 5) {
      const firstHalf = sentences.slice(0, Math.floor(sentences.length / 2)).join(' ')
      const secondHalf = sentences.slice(Math.floor(sentences.length / 2)).join(' ')
      const overlap = this.calculateWordOverlap(firstHalf, secondHalf)

      if (overlap < 0.05 && sentences.length > 10) {
        supporting.push({
          name: 'Topic Drift',
          category: 'semantic_consistency',
          value: 0.4,
          direction: 'supporting',
          severity: 'medium',
          detail: 'Significant topic shift between first and second half of text',
        })
      } else if (overlap > 0.2) {
        counter.push({
          name: 'Consistent Topic',
          category: 'semantic_consistency',
          value: 0.6,
          direction: 'counter',
          severity: 'low',
          detail: 'Text maintains consistent topic throughout',
        })
      }
    }

    // Check for repetitive content
    if (features.repeatedPhraseCount > 3) {
      supporting.push({
        name: 'Repetitive Phrasing',
        category: 'semantic_consistency',
        value: 0.5,
        direction: 'supporting',
        severity: 'medium',
        detail: `Found ${features.repeatedPhraseCount} repeated phrases, suggesting templated content`,
      })
    }

    // Check semantic cohesion
    if (features.semanticCohesionScore > 0.6) {
      counter.push({
        name: 'High Semantic Cohesion',
        category: 'semantic_consistency',
        value: features.semanticCohesionScore,
        direction: 'counter',
        severity: 'low',
        detail: 'Sentences show strong semantic connection',
      })
    } else if (features.semanticCohesionScore < 0.2) {
      supporting.push({
        name: 'Low Semantic Cohesion',
        category: 'semantic_consistency',
        value: 1 - features.semanticCohesionScore,
        direction: 'supporting',
        severity: 'medium',
        detail: 'Sentences show weak semantic connection',
      })
    }

    return { supporting, counter, evidence }
  }

  private calculateWordOverlap(text1: string, text2: string): number {
    const words1 = new Set(
      text1
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3),
    )
    const words2 = new Set(
      text2
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3),
    )
    let overlap = 0
    for (const word of words2) {
      if (words1.has(word)) overlap++
    }
    return words2.size > 0 ? overlap / words2.size : 0
  }

  // ── Generated Content Signals ──────────────────────────────────────────────

  private analyzeGeneratedContent(
    text: string,
    features: TextFeatures,
  ): { supporting: ModalitySignal[]; counter: ModalitySignal[]; evidence: EvidenceItem[] } {
    const supporting: ModalitySignal[] = []
    const counter: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    // AI hedging patterns
    let hedgingCount = 0
    for (const pattern of this.AI_HEDGING_PATTERNS) {
      const matches = text.match(pattern)
      hedgingCount += matches?.length || 0
    }

    if (hedgingCount > 3) {
      supporting.push({
        name: 'AI Hedging Patterns',
        category: 'generated_content',
        value: Math.min(0.8, hedgingCount * 0.15),
        direction: 'supporting',
        severity: 'high',
        detail: `Found ${hedgingCount} AI-typical hedging phrases`,
      })
    } else if (hedgingCount > 0) {
      supporting.push({
        name: 'Some AI Hedging',
        category: 'generated_content',
        value: hedgingCount * 0.1,
        direction: 'supporting',
        severity: 'low',
        detail: `Found ${hedgingCount} hedging phrases`,
      })
    }

    // Human writing markers
    let humanMarkerCount = 0
    for (const pattern of this.HUMAN_WRITING_MARKERS) {
      const matches = text.match(pattern)
      humanMarkerCount += matches?.length || 0
    }

    if (humanMarkerCount > 2) {
      counter.push({
        name: 'Human Writing Markers',
        category: 'generated_content',
        value: Math.min(0.7, humanMarkerCount * 0.15),
        direction: 'counter',
        severity: 'medium',
        detail: `Found ${humanMarkerCount} human-typical expressions`,
      })
    }

    // Sentence length uniformity (AI tends to produce uniform sentence lengths)
    const cv =
      features.avgSentenceLength > 0
        ? Math.sqrt(features.sentenceLengthVariance) / features.avgSentenceLength
        : 0

    if (cv < 0.3 && features.sentenceCount > 10) {
      supporting.push({
        name: 'Uniform Sentence Length',
        category: 'generated_content',
        value: 0.5,
        direction: 'supporting',
        severity: 'medium',
        detail: 'Sentence lengths are unusually uniform, a common AI pattern',
      })
    } else if (cv > 0.6) {
      counter.push({
        name: 'Natural Sentence Variation',
        category: 'generated_content',
        value: 0.6,
        direction: 'counter',
        severity: 'medium',
        detail: 'Sentence lengths show natural variation',
      })
    }

    // Vocabulary diversity
    if (features.vocabularyDiversity < 0.4 && features.wordCount > 100) {
      supporting.push({
        name: 'Low Vocabulary Diversity',
        category: 'generated_content',
        value: 0.5,
        direction: 'supporting',
        severity: 'medium',
        detail: 'Limited vocabulary range detected',
      })
    } else if (features.vocabularyDiversity > 0.7) {
      counter.push({
        name: 'High Vocabulary Diversity',
        category: 'generated_content',
        value: 0.6,
        direction: 'counter',
        severity: 'medium',
        detail: 'Rich vocabulary usage detected',
      })
    }

    // Perplexity estimate
    if (features.perplexityEstimate < 0.3) {
      supporting.push({
        name: 'Low Perplexity',
        category: 'generated_content',
        value: 0.6,
        direction: 'supporting',
        severity: 'high',
        detail: 'Text shows low perplexity, suggesting predictable word patterns',
      })
    } else if (features.perplexityEstimate > 0.6) {
      counter.push({
        name: 'High Perplexity',
        category: 'generated_content',
        value: 0.5,
        direction: 'counter',
        severity: 'medium',
        detail: 'Text shows natural perplexity levels',
      })
    }

    // Burstiness
    if (features.burstinessScore < 0.2 && features.sentenceCount > 10) {
      supporting.push({
        name: 'Low Burstiness',
        category: 'generated_content',
        value: 0.5,
        direction: 'supporting',
        severity: 'medium',
        detail: 'Writing lacks natural burstiness patterns',
      })
    } else if (features.burstinessScore > 0.4) {
      counter.push({
        name: 'Natural Burstiness',
        category: 'generated_content',
        value: 0.5,
        direction: 'counter',
        severity: 'medium',
        detail: 'Writing shows natural burstiness patterns',
      })
    }

    // Personal pronoun density
    if (features.personalPronounDensity < 0.01 && features.wordCount > 200) {
      supporting.push({
        name: 'Low Personal Voice',
        category: 'generated_content',
        value: 0.4,
        direction: 'supporting',
        severity: 'low',
        detail: 'Text lacks personal pronouns, suggesting impersonal content',
      })
    } else if (features.personalPronounDensity > 0.03) {
      counter.push({
        name: 'Personal Voice Present',
        category: 'generated_content',
        value: 0.5,
        direction: 'counter',
        severity: 'medium',
        detail: 'Text contains personal pronouns suggesting human authorship',
      })
    }

    return { supporting, counter, evidence }
  }

  // ── Contradiction Analysis ──────────────────────────────────────────────────

  private analyzeContradictions(
    text: string,
    _features: TextFeatures,
  ): { supporting: ModalitySignal[]; counter: ModalitySignal[]; evidence: EvidenceItem[] } {
    const supporting: ModalitySignal[] = []
    const counter: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    // Check for internal contradictions
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)
    const contradictions: Array<{ s1: string; s2: string; reason: string }> = []

    const negationPatterns = [
      /\b(is|are|was|were)\s+not\b/i,
      /\b(don't|doesn't|didn't|won't|wouldn't|can't|couldn't|shouldn't)\b/i,
      /\b(no|never|neither|nor|nobody|nothing|nowhere|never)\b/i,
    ]

    const positivePatterns = [
      /\b(is|are|was|were)\s+(definitely|certainly|absolutely|always|every)\b/i,
      /\b(always|every|all|must|shall|will)\b/i,
    ]

    for (let i = 0; i < sentences.length; i++) {
      for (let j = i + 1; j < sentences.length; j++) {
        const s1 = sentences[i].trim()
        const s2 = sentences[j].trim()

        if (s1.length < 10 || s2.length < 10) continue

        const s1HasNegation = negationPatterns.some((p) => p.test(s1))
        const s2HasNegation = negationPatterns.some((p) => p.test(s2))
        const s1HasPositive = positivePatterns.some((p) => p.test(s1))
        const s2HasPositive = positivePatterns.some((p) => p.test(s2))

        if ((s1HasNegation && s2HasPositive) || (s1HasPositive && s2HasNegation)) {
          const overlap = this.calculateWordOverlap(s1, s2)
          if (overlap > 0.15) {
            contradictions.push({
              s1: s1.substring(0, 100),
              s2: s2.substring(0, 100),
              reason: 'Contradictory stance detected',
            })
          }
        }
      }
    }

    if (contradictions.length > 0) {
      supporting.push({
        name: 'Internal Contradictions',
        category: 'contradiction',
        value: Math.min(0.7, contradictions.length * 0.2),
        direction: 'supporting',
        severity: 'high',
        detail: `Found ${contradictions.length} potential internal contradictions`,
      })
    } else {
      counter.push({
        name: 'No Contradictions',
        category: 'contradiction',
        value: 0.4,
        direction: 'counter',
        severity: 'low',
        detail: 'No internal contradictions detected',
      })
    }

    return { supporting, counter, evidence }
  }

  // ── Source Evidence ─────────────────────────────────────────────────────────

  private analyzeSourceEvidence(
    text: string,
    _input: TextInput,
  ): { supporting: ModalitySignal[]; counter: ModalitySignal[]; evidence: EvidenceItem[] } {
    const supporting: ModalitySignal[] = []
    const counter: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    // Check for URL patterns
    const urlPattern = /https?:\/\/[^\s]+/gi
    const urls = text.match(urlPattern) || []
    if (urls.length > 0) {
      counter.push({
        name: 'Contains URLs',
        category: 'source_evidence',
        value: 0.4,
        direction: 'counter',
        severity: 'low',
        detail: `Text contains ${urls.length} URL(s), suggesting sourced content`,
      })
    }

    // Check for citation patterns
    const citationPatterns = [
      /\[\d+\]/g,
      /\([A-Z][a-z]+,?\s*\d{4}\)/g,
      /\b(et al\.|ibid\.|op\. cit\.)\b/gi,
    ]
    let citationCount = 0
    for (const pattern of citationPatterns) {
      citationCount += (text.match(pattern) || []).length
    }
    if (citationCount > 2) {
      counter.push({
        name: 'Academic Citations',
        category: 'source_evidence',
        value: 0.6,
        direction: 'counter',
        severity: 'medium',
        detail: `Found ${citationCount} citation patterns, suggesting researched content`,
      })
    }

    return { supporting, counter, evidence }
  }

  // ── Linguistic Signal Analysis ──────────────────────────────────────────────

  private analyzeLinguisticSignals(
    text: string,
    features: TextFeatures,
    anomalies: LinguisticAnomaly[],
  ): {
    supporting: ModalitySignal[]
    counter: ModalitySignal[]
    evidence: EvidenceItem[]
    regions: AffectedRegion[]
  } {
    const supporting: ModalitySignal[] = []
    const counter: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const regions: AffectedRegion[] = []

    // Transition phrase density
    if (features.transitionPhraseDensity > 0.03) {
      supporting.push({
        name: 'High Transition Density',
        category: 'linguistic',
        value: Math.min(0.7, features.transitionPhraseDensity * 10),
        direction: 'supporting',
        severity: 'medium',
        detail: 'Unusually high density of transition phrases',
      })
    }

    // Filler word usage
    if (features.fillerWordDensity > 0.02) {
      counter.push({
        name: 'Filler Words Present',
        category: 'linguistic',
        value: Math.min(0.6, features.fillerWordDensity * 20),
        direction: 'counter',
        severity: 'low',
        detail: 'Natural filler words detected, suggesting human authorship',
      })
    }

    // Punctuation entropy
    if (features.punctuationEntropy < 1.5 && text.length > 500) {
      supporting.push({
        name: 'Low Punctuation Entropy',
        category: 'linguistic',
        value: 0.4,
        direction: 'supporting',
        severity: 'low',
        detail: 'Punctuation usage is unusually uniform',
      })
    }

    // Capitalization anomalies
    if (features.capitalizationAnomaly) {
      supporting.push({
        name: 'Capitalization Anomaly',
        category: 'linguistic',
        value: 0.3,
        direction: 'supporting',
        severity: 'low',
        detail: 'Unusual capitalization patterns detected',
      })
    }

    // Map anomalies to evidence
    for (const anomaly of anomalies) {
      evidence.push({
        id: `anomaly-${anomaly.type}-${Math.random().toString(36).slice(2, 8)}`,
        category: 'linguistic_signal',
        description: anomaly.description,
        confidence: anomaly.severity === 'high' ? 0.8 : anomaly.severity === 'medium' ? 0.5 : 0.3,
        location:
          anomaly.startIndex !== undefined
            ? {
                type: 'span',
                startIndex: anomaly.startIndex,
                endIndex: anomaly.endIndex || anomaly.startIndex + 20,
              }
            : undefined,
      })

      if (anomaly.startIndex !== undefined) {
        regions.push({
          id: `region-${anomaly.type}-${Math.random().toString(36).slice(2, 8)}`,
          label: anomaly.type,
          type: 'textual',
          location: {
            type: 'span',
            startIndex: anomaly.startIndex,
            endIndex: anomaly.endIndex || anomaly.startIndex + 20,
          },
          severity: anomaly.severity,
          description: anomaly.description,
        })
      }
    }

    return { supporting, counter, evidence, regions }
  }

  private detectAnomalies(text: string, features: TextFeatures): LinguisticAnomaly[] {
    const anomalies: LinguisticAnomaly[] = []

    // Check for extremely uniform paragraph lengths
    if (features.paragraphCount > 3) {
      const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
      const lengths = paragraphs.map((p) => p.split(/\s+/).length)
      const cv = this.calculateVariance(lengths) / (Math.max(...lengths) || 1)
      if (cv < 0.1) {
        anomalies.push({
          type: 'uniform_paragraphs',
          severity: 'medium',
          description: 'Paragraph lengths are unusually uniform',
        })
      }
    }

    // Check for missing natural errors
    if (features.errorNaturalness < 0.01 && features.wordCount > 500) {
      anomalies.push({
        type: 'no_errors',
        severity: 'low',
        description: 'Text has no natural errors, suggesting heavy editing or generation',
      })
    }

    return anomalies
  }
}
