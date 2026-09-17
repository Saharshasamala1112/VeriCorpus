import type {
  ModalityAnalyzer,
  DocumentInput,
  ModalityAnalysisResult,
  ModalitySignal,
  EvidenceItem,
  AffectedRegion,
} from '../types'

// ─── Document Feature Types ──────────────────────────────────────────────────

interface DocumentAnalysisData {
  text: string
  metadata: DocumentMetadata
  structure: DocumentStructure
  pageCount?: number
}

interface DocumentMetadata {
  author?: string
  creator?: string
  producer?: string
  created?: string
  modified?: string
  title?: string
  subject?: string
  keywords?: string[]
  encryption?: string
  hasFormFields?: boolean
  fileSize?: number
  format?: string
}

interface DocumentStructure {
  paragraphs: ParagraphInfo[]
  sections: SectionInfo[]
  headings: HeadingInfo[]
  lists: ListInfo[]
  tables: TableInfo[]
  images: ImageInfo[]
  links: LinkInfo[]
  totalWords: number
  totalSentences: number
  totalPages: number
}

interface ParagraphInfo {
  index: number
  text: string
  wordCount: number
  startIndex: number
  endIndex: number
}

interface SectionInfo {
  index: number
  title: string
  startIndex: number
  endIndex: number
}

interface HeadingInfo {
  level: number
  text: string
  startIndex: number
}

interface ListInfo {
  type: 'bullet' | 'numbered'
  itemCount: number
  startIndex: number
}

interface TableInfo {
  rows: number
  cols: number
  startIndex: number
}

interface ImageInfo {
  index: number
  hasAltText: boolean
  startIndex: number
}

interface LinkInfo {
  url: string
  text: string
  startIndex: number
}

// ─── Document Analyzer ───────────────────────────────────────────────────────

export class DocumentAnalyzer implements ModalityAnalyzer<DocumentInput> {
  modality = 'document' as const

  private readonly AI_WRITING_MARKERS = [
    'as an AI',
    'as a language model',
    'I cannot',
    'I am unable',
    'it is important to note',
    "it's important to note",
    'in conclusion',
    'to summarize',
    'in summary',
  ]

  async analyze(input: DocumentInput): Promise<ModalityAnalysisResult> {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const affectedRegions: AffectedRegion[] = []
    const affectedSegments: AffectedRegion[] = []
    const limitations: string[] = []

    try {
      const docData = await this.extractDocumentData(input)

      // ── Metadata Analysis ──────────────────────────────────────────────────
      const metadataSignals = this.analyzeMetadata(docData.metadata, input)
      signals.push(...metadataSignals.signals)
      counterSignals.push(...metadataSignals.counterSignals)
      evidence.push(...metadataSignals.evidence)

      // ── Structural Anomalies ───────────────────────────────────────────────
      const structuralSignals = this.analyzeStructuralAnomalies(docData.structure)
      signals.push(...structuralSignals.signals)
      counterSignals.push(...structuralSignals.counterSignals)
      evidence.push(...structuralSignals.evidence)
      affectedRegions.push(...structuralSignals.regions)

      // ── OCR/Text Consistency ───────────────────────────────────────────────
      const ocrSignals = this.analyzeTextConsistency(docData)
      signals.push(...ocrSignals.signals)
      counterSignals.push(...ocrSignals.counterSignals)
      evidence.push(...ocrSignals.evidence)

      // ── Visual/Text Mismatch ───────────────────────────────────────────────
      const mismatchSignals = this.analyzeVisualTextMismatch(docData)
      signals.push(...mismatchSignals.signals)
      counterSignals.push(...mismatchSignals.counterSignals)
      evidence.push(...mismatchSignals.evidence)

      // ── Source Comparison ──────────────────────────────────────────────────
      const sourceSignals = this.analyzeSourceComparison(docData, input)
      signals.push(...sourceSignals.signals)
      counterSignals.push(...sourceSignals.counterSignals)
      evidence.push(...sourceSignals.evidence)

      const resultMetadata: Record<string, unknown> = {
        format: docData.metadata.format,
        wordCount: docData.structure.totalWords,
        paragraphCount: docData.structure.paragraphs.length,
        pageCount: docData.structure.totalPages,
        hasAuthor: !!docData.metadata.author,
        hasFormFields: docData.metadata.hasFormFields,
        imageCount: docData.structure.images.length,
        linkCount: docData.structure.links.length,
      }

      return {
        signals,
        counterSignals,
        evidence,
        affectedRegions,
        affectedSegments,
        limitations,
        metadata: resultMetadata,
      }
    } catch (error) {
      limitations.push(
        `Document analysis failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
      return {
        signals: [],
        counterSignals: [],
        evidence: [],
        affectedRegions: [],
        affectedSegments: [],
        limitations,
        metadata: { error: true },
      }
    }
  }

  // ── Document Data Extraction ────────────────────────────────────────────────

  private async extractDocumentData(input: DocumentInput): Promise<DocumentAnalysisData> {
    const text = input.textContent || (await this.extractText(input))
    const metadata = this.extractMetadata(input)
    const structure = this.analyzeStructure(text)

    return {
      text,
      metadata,
      structure,
    }
  }

  private async extractText(input: DocumentInput): Promise<string> {
    if (!input.file) return ''

    const extension = input.filename.split('.').pop()?.toLowerCase()

    switch (extension) {
      case 'txt':
      case 'md':
        return input.file.text()

      case 'pdf':
        return this.extractPDFText(input.file)

      case 'docx':
        return this.extractDOCXText(input.file)

      default:
        return input.file.text()
    }
  }

  private async extractPDFText(file: File | Blob): Promise<string> {
    // Simplified PDF text extraction
    // In production, use pdf.js or similar library
    try {
      const buffer = await file.arrayBuffer()
      const text = new TextDecoder().decode(buffer)

      // Extract text between stream objects
      const streamMatches = text.match(/stream\s*([\s\S]*?)\s*endstream/g)
      if (streamMatches) {
        return streamMatches
          .map((m) => m.replace(/stream|endstream/g, ''))
          .join(' ')
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }

      return text
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    } catch {
      return ''
    }
  }

  private async extractDOCXText(file: File | Blob): Promise<string> {
    // Simplified DOCX text extraction
    // In production, use mammoth.js or similar library
    try {
      const buffer = await file.arrayBuffer()
      const text = new TextDecoder().decode(buffer)

      // Extract text from XML content
      const xmlMatch = text.match(/<w:t[^>]*>([^<]+)<\/w:t>/g)
      if (xmlMatch) {
        return xmlMatch
          .map((m) => m.replace(/<[^>]+>/g, ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      }

      return text
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    } catch {
      return ''
    }
  }

  private extractMetadata(input: DocumentInput): DocumentMetadata {
    const baseMetadata: DocumentMetadata = {
      format: input.filename.split('.').pop()?.toLowerCase(),
      fileSize: input.sizeBytes,
    }

    if (input.metadata) {
      Object.assign(baseMetadata, input.metadata)
    }

    return baseMetadata
  }

  private analyzeStructure(text: string): DocumentStructure {
    const paragraphs = this.extractParagraphs(text)
    const sections = this.extractSections(text)
    const headings = this.extractHeadings(text)
    const lists = this.extractLists(text)
    const tables = this.extractTables(text)
    const images = this.extractImages(text)
    const links = this.extractLinks(text)

    const words = text.split(/\s+/).filter((w) => w.length > 0)
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)

    return {
      paragraphs,
      sections,
      headings,
      lists,
      tables,
      images,
      links,
      totalWords: words.length,
      totalSentences: sentences.length,
      totalPages: Math.max(1, Math.ceil(text.length / 3000)),
    }
  }

  private extractParagraphs(text: string): ParagraphInfo[] {
    const paragraphs: ParagraphInfo[] = []
    const parts = text.split(/\n\s*\n/)
    let currentIndex = 0

    for (let i = 0; i < parts.length; i++) {
      const para = parts[i].trim()
      if (para.length > 0) {
        paragraphs.push({
          index: i,
          text: para,
          wordCount: para.split(/\s+/).length,
          startIndex: currentIndex,
          endIndex: currentIndex + para.length,
        })
      }
      currentIndex += para.length + 2
    }

    return paragraphs
  }

  private extractSections(text: string): SectionInfo[] {
    const sections: SectionInfo[] = []
    const sectionPatterns = [
      /\n\s*(#{1,6})\s+(.+)/g,
      /\n\s*(\d+\.)\s+(.+)/g,
      /\n\s*([A-Z][A-Z\s]+)\n/g,
    ]

    for (const pattern of sectionPatterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        sections.push({
          index: sections.length,
          title: match[2]?.trim() || match[1]?.trim(),
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        })
      }
    }

    return sections
  }

  private extractHeadings(text: string): HeadingInfo[] {
    const headings: HeadingInfo[] = []
    const headingPattern = /(?:^|\n)\s*(#{1,6})\s+(.+)/g
    let match

    while ((match = headingPattern.exec(text)) !== null) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        startIndex: match.index,
      })
    }

    return headings
  }

  private extractLists(text: string): ListInfo[] {
    const lists: ListInfo[] = []
    const bulletPattern = /(?:^|\n)\s*[-*•]\s+/g
    const numberedPattern = /(?:^|\n)\s*\d+\.\s+/g

    const bulletMatches = text.match(bulletPattern) || []
    const numberedMatches = text.match(numberedPattern) || []

    if (bulletMatches.length > 0) {
      const firstBullet = bulletMatches[0] ?? ''
      lists.push({
        type: 'bullet',
        itemCount: bulletMatches.length,
        startIndex: text.indexOf(firstBullet),
      })
    }

    if (numberedMatches.length > 0) {
      const firstNumbered = numberedMatches[0] ?? ''
      lists.push({
        type: 'numbered',
        itemCount: numberedMatches.length,
        startIndex: text.indexOf(firstNumbered),
      })
    }

    return lists
  }

  private extractTables(text: string): TableInfo[] {
    const tables: TableInfo[] = []
    const tablePattern = /\|[^|]+\|/g
    let match

    while ((match = tablePattern.exec(text)) !== null) {
      const row = match[0].split('|').filter((c) => c.trim().length > 0)
      if (row.length > 1) {
        tables.push({
          rows: 1,
          cols: row.length,
          startIndex: match.index,
        })
      }
    }

    return tables
  }

  private extractImages(text: string): ImageInfo[] {
    const images: ImageInfo[] = []
    const imgPattern = /!\[([^\]]*)\]\([^)]+\)/g
    let match

    while ((match = imgPattern.exec(text)) !== null) {
      images.push({
        index: images.length,
        hasAltText: match[1].trim().length > 0,
        startIndex: match.index,
      })
    }

    return images
  }

  private extractLinks(text: string): LinkInfo[] {
    const links: LinkInfo[] = []
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g
    let match

    while ((match = linkPattern.exec(text)) !== null) {
      links.push({
        text: match[1],
        url: match[2],
        startIndex: match.index,
      })
    }

    return links
  }

  // ── Metadata Analysis ──────────────────────────────────────────────────────

  private analyzeMetadata(
    metadata: DocumentMetadata,
    _input: DocumentInput,
  ): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    // Check for author information
    if (metadata.author) {
      counterSignals.push({
        name: 'Author Identified',
        category: 'metadata',
        value: 0.5,
        direction: 'counter',
        severity: 'medium',
        detail: `Document author: ${metadata.author}`,
      })
    } else {
      signals.push({
        name: 'No Author',
        category: 'metadata',
        value: 0.3,
        direction: 'supporting',
        severity: 'low',
        detail: 'No author information found',
      })
    }

    // Check for creation software
    if (metadata.creator || metadata.producer) {
      const software = metadata.creator || metadata.producer
      counterSignals.push({
        name: 'Creation Software Identified',
        category: 'metadata',
        value: 0.4,
        direction: 'counter',
        severity: 'low',
        detail: `Created with: ${software}`,
      })
    }

    // Check for timestamps
    if (metadata.created) {
      counterSignals.push({
        name: 'Creation Timestamp',
        category: 'metadata',
        value: 0.3,
        direction: 'counter',
        severity: 'low',
        detail: `Created: ${metadata.created}`,
      })
    }

    if (metadata.modified && metadata.created && metadata.modified !== metadata.created) {
      evidence.push({
        id: `metadata-timestamp-${Date.now()}`,
        category: 'metadata_anomaly',
        description: `Document modified after creation (${metadata.created} -> ${metadata.modified})`,
        confidence: 0.3,
      })
    }

    // Check for encryption
    if (metadata.encryption) {
      signals.push({
        name: 'Encrypted Document',
        category: 'metadata',
        value: 0.4,
        direction: 'supporting',
        severity: 'low',
        detail: 'Document has encryption, which may indicate sensitive content',
      })
    }

    // Check for form fields
    if (metadata.hasFormFields) {
      evidence.push({
        id: `metadata-forms-${Date.now()}`,
        category: 'metadata_anomaly',
        description: 'Document contains form fields',
        confidence: 0.3,
      })
    }

    // Check for AI-related keywords in metadata
    const aiKeywords = ['chatgpt', 'openai', 'ai generated', 'copilot', 'bard', 'claude']
    const metadataStr = JSON.stringify(metadata).toLowerCase()

    for (const keyword of aiKeywords) {
      if (metadataStr.includes(keyword)) {
        signals.push({
          name: 'AI Keyword in Metadata',
          category: 'metadata',
          value: 0.8,
          direction: 'supporting',
          severity: 'high',
          detail: `AI-related keyword "${keyword}" found in metadata`,
        })
        break
      }
    }

    return { signals, counterSignals, evidence }
  }

  // ── Structural Anomalies ────────────────────────────────────────────────────

  private analyzeStructuralAnomalies(structure: DocumentStructure): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
    regions: AffectedRegion[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const regions: AffectedRegion[] = []

    // Check paragraph length consistency
    if (structure.paragraphs.length > 3) {
      const paraLengths = structure.paragraphs.map((p) => p.wordCount)
      const mean = paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length
      const variance =
        paraLengths.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / paraLengths.length
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0

      if (cv < 0.2) {
        signals.push({
          name: 'Uniform Paragraph Lengths',
          category: 'structural',
          value: 0.5,
          direction: 'supporting',
          severity: 'medium',
          detail: 'Paragraph lengths are unusually uniform',
        })
      } else if (cv > 0.5) {
        counterSignals.push({
          name: 'Natural Paragraph Variation',
          category: 'structural',
          value: 0.5,
          direction: 'counter',
          severity: 'medium',
          detail: 'Paragraph lengths show natural variation',
        })
      }
    }

    // Check heading hierarchy
    if (structure.headings.length > 2) {
      const levels = structure.headings.map((h) => h.level)
      let validHierarchy = true

      for (let i = 1; i < levels.length; i++) {
        if (levels[i] > levels[i - 1] + 1) {
          validHierarchy = false
          break
        }
      }

      if (!validHierarchy) {
        signals.push({
          name: 'Invalid Heading Hierarchy',
          category: 'structural',
          value: 0.4,
          direction: 'supporting',
          severity: 'medium',
          detail: 'Heading levels skip numbers (e.g., H1 followed by H3)',
        })
      } else {
        counterSignals.push({
          name: 'Valid Heading Hierarchy',
          category: 'structural',
          value: 0.4,
          direction: 'counter',
          severity: 'low',
          detail: 'Heading hierarchy is valid',
        })
      }
    }

    // Check for missing images alt text
    const imagesWithoutAlt = structure.images.filter((img) => !img.hasAltText)
    if (imagesWithoutAlt.length > 0) {
      for (const img of imagesWithoutAlt) {
        regions.push({
          id: `img-alt-${img.index}`,
          label: `Image without alt text`,
          type: 'textual',
          location: {
            type: 'span',
            startIndex: img.startIndex,
            endIndex: img.startIndex + 50,
          },
          severity: 'low',
          description: 'Image is missing alternative text',
        })
      }

      signals.push({
        name: 'Missing Alt Text',
        category: 'structural',
        value: Math.min(0.5, imagesWithoutAlt.length * 0.15),
        direction: 'supporting',
        severity: 'low',
        detail: `${imagesWithoutAlt.length} image(s) missing alt text`,
      })
    }

    // Check for consistent list formatting
    if (structure.lists.length > 1) {
      const types = structure.lists.map((l) => l.type)
      const hasMixed = types.includes('bullet') && types.includes('numbered')

      if (hasMixed) {
        evidence.push({
          id: `structural-lists-${Date.now()}`,
          category: 'structural_anomaly',
          description: 'Document contains both bulleted and numbered lists',
          confidence: 0.3,
        })
      }
    }

    // Check document length vs structure ratio
    const avgParaLength = structure.totalWords / Math.max(1, structure.paragraphs.length)
    if (structure.paragraphs.length > 5 && avgParaLength > 200) {
      signals.push({
        name: 'Long Paragraphs',
        category: 'structural',
        value: 0.4,
        direction: 'supporting',
        severity: 'low',
        detail: 'Average paragraph length is unusually long',
      })
    }

    return { signals, counterSignals, evidence, regions }
  }

  // ── OCR/Text Consistency ────────────────────────────────────────────────────

  private analyzeTextConsistency(docData: DocumentAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    const text = docData.text
    if (text.length < 100) {
      return { signals, counterSignals, evidence }
    }

    // Check for OCR artifacts
    const ocrArtifacts = this.detectOCRArtifacts(text)
    if (ocrArtifacts.length > 0) {
      for (const artifact of ocrArtifacts) {
        evidence.push({
          id: `ocr-artifact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          category: 'ocr_mismatch',
          description: artifact.description,
          confidence: artifact.confidence,
          location:
            artifact.startIndex !== undefined
              ? {
                  type: 'span',
                  startIndex: artifact.startIndex,
                  endIndex: artifact.endIndex || artifact.startIndex + 20,
                }
              : undefined,
        })
      }

      signals.push({
        name: 'OCR Artifacts',
        category: 'text_consistency',
        value: Math.min(0.7, ocrArtifacts.length * 0.15),
        direction: 'supporting',
        severity: ocrArtifacts.length > 5 ? 'high' : 'medium',
        detail: `Found ${ocrArtifacts.length} potential OCR artifacts`,
      })
    }

    // Check for character encoding issues
    const encodingIssues = this.detectEncodingIssues(text)
    if (encodingIssues > 0) {
      signals.push({
        name: 'Encoding Issues',
        category: 'text_consistency',
        value: Math.min(0.5, encodingIssues * 0.1),
        direction: 'supporting',
        severity: 'low',
        detail: `Found ${encodingIssues} character encoding anomalies`,
      })
    }

    // Check for natural language patterns
    const naturalScore = this.assessNaturalLanguage(text)
    if (naturalScore > 0.6) {
      counterSignals.push({
        name: 'Natural Language',
        category: 'text_consistency',
        value: naturalScore,
        direction: 'counter',
        severity: 'medium',
        detail: 'Text shows natural language patterns',
      })
    }

    return { signals, counterSignals, evidence }
  }

  private detectOCRArtifacts(text: string): Array<{
    type: string
    description: string
    confidence: number
    startIndex?: number
    endIndex?: number
  }> {
    const artifacts: Array<{
      type: string
      description: string
      confidence: number
      startIndex?: number
      endIndex?: number
    }> = []

    // Common OCR substitutions
    const ocrPatterns = [
      { pattern: /\b[0O][0O]\b/g, type: 'substitution', desc: 'OO instead of 00' },
      { pattern: /\b[1lI]\b(?=[a-z])/g, type: 'substitution', desc: 'l or I instead of 1' },
      { pattern: /\b rn\b/g, type: 'substitution', desc: 'rn instead of m' },
      { pattern: /\b cl\b/g, type: 'substitution', desc: 'cl instead of d' },
      { pattern: /\b vv\b/g, type: 'substitution', desc: 'vv instead of w' },
    ]

    for (const { pattern, type, desc } of ocrPatterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        artifacts.push({
          type,
          description: desc,
          confidence: 0.6,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        })
      }
    }

    // Check for garbled characters
    const garbledPattern = /[^\w\s.,;:!?'"()[\]{}\-–—/\\@#$%^&*+=<>~`|]/g
    let garbledMatch
    while ((garbledMatch = garbledPattern.exec(text)) !== null) {
      artifacts.push({
        type: 'garbled',
        description: `Garbled character: "${garbledMatch[0]}"`,
        confidence: 0.7,
        startIndex: garbledMatch.index,
        endIndex: garbledMatch.index + 1,
      })
    }

    return artifacts
  }

  private detectEncodingIssues(text: string): number {
    let issues = 0

    // Check for replacement characters
    if (text.includes('\uFFFD')) issues++

    // Check for unusual control characters
    const controlPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F]/gu
    const controlMatches = text.match(controlPattern)
    issues += controlMatches?.length || 0

    return issues
  }

  private assessNaturalLanguage(text: string): number {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)
    if (sentences.length < 5) return 0.5

    let score = 0

    // Check for natural sentence length variation
    const sentenceLengths = sentences.map((s) => s.split(/\s+/).length)
    const mean = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
    const variance =
      sentenceLengths.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / sentenceLengths.length
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0

    if (cv > 0.3 && cv < 0.8) score += 0.3

    // Check for transition words
    const transitionWords = ['however', 'moreover', 'furthermore', 'consequently', 'therefore']
    const transitionCount = transitionWords.filter((w) => text.toLowerCase().includes(w)).length
    if (transitionCount > 0 && transitionCount < 5) score += 0.2

    // Check for pronoun usage
    const pronouns = ['I', 'we', 'you', 'they', 'he', 'she']
    const pronounCount = pronouns.filter((p) => text.includes(p)).length
    if (pronounCount > 0) score += 0.2

    // Check for natural punctuation
    const questionMarks = (text.match(/\?/g) || []).length
    const exclamationMarks = (text.match(/!/g) || []).length
    if (questionMarks > 0 || exclamationMarks > 0) score += 0.1

    return Math.min(1, score)
  }

  // ── Visual/Text Mismatch ────────────────────────────────────────────────────

  private analyzeVisualTextMismatch(docData: DocumentAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    // Check if images have matching text
    if (docData.structure.images.length > 0) {
      const imagesWithoutContext = docData.structure.images.filter((img) => {
        const surroundingText = docData.text.substring(
          Math.max(0, img.startIndex - 100),
          Math.min(docData.text.length, img.startIndex + 100),
        )
        return surroundingText.trim().length < 20
      })

      if (imagesWithoutContext.length > 0) {
        signals.push({
          name: 'Images Without Context',
          category: 'visual_text_mismatch',
          value: Math.min(0.5, imagesWithoutContext.length * 0.15),
          direction: 'supporting',
          severity: 'low',
          detail: `${imagesWithoutContext.length} image(s) lack surrounding text context`,
        })
      }
    }

    // Check for link consistency
    if (docData.structure.links.length > 0) {
      const brokenLinkPatterns = [/example\.com/gi, /lorem ipsum/gi, /placeholder/gi]

      for (const link of docData.structure.links) {
        for (const pattern of brokenLinkPatterns) {
          if (pattern.test(link.url)) {
            signals.push({
              name: 'Placeholder Links',
              category: 'visual_text_mismatch',
              value: 0.4,
              direction: 'supporting',
              severity: 'low',
              detail: 'Document contains placeholder links',
            })
            break
          }
        }
      }
    }

    // Check for table consistency
    if (docData.structure.tables.length > 0) {
      counterSignals.push({
        name: 'Structured Data Present',
        category: 'visual_text_mismatch',
        value: 0.4,
        direction: 'counter',
        severity: 'low',
        detail: 'Document contains structured table data',
      })
    }

    return { signals, counterSignals, evidence }
  }

  // ── Source Comparison ───────────────────────────────────────────────────────

  private analyzeSourceComparison(
    docData: DocumentAnalysisData,
    _input: DocumentInput,
  ): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    // Check for source URL
    if (_input.sourceUrl) {
      counterSignals.push({
        name: 'Source URL Provided',
        category: 'source_comparison',
        value: 0.6,
        direction: 'counter',
        severity: 'medium',
        detail: 'Document has a source URL',
      })
    }

    // Check for citations/references
    const citationPatterns = [
      /\[\d+\]/g,
      /\([A-Z][a-z]+,?\s*\d{4}\)/g,
      /\b(et al\.|ibid\.|op\. cit\.)\b/gi,
    ]
    let citationCount = 0
    for (const pattern of citationPatterns) {
      citationCount += (docData.text.match(pattern) || []).length
    }

    if (citationCount > 2) {
      counterSignals.push({
        name: 'Citations Present',
        category: 'source_comparison',
        value: 0.5,
        direction: 'counter',
        severity: 'medium',
        detail: `Found ${citationCount} citation patterns`,
      })
    }

    // Check for AI-generated content markers
    for (const marker of this.AI_WRITING_MARKERS) {
      if (docData.text.toLowerCase().includes(marker.toLowerCase())) {
        signals.push({
          name: 'AI Writing Marker',
          category: 'source_comparison',
          value: 0.7,
          direction: 'supporting',
          severity: 'high',
          detail: `AI writing marker found: "${marker}"`,
        })
        break
      }
    }

    // Check for bibliography section
    const hasBibliography = /\b(bibliography|references|works cited)\b/i.test(docData.text)
    if (hasBibliography) {
      counterSignals.push({
        name: 'Bibliography Present',
        category: 'source_comparison',
        value: 0.4,
        direction: 'counter',
        severity: 'medium',
        detail: 'Document contains a bibliography/references section',
      })
    }

    return { signals, counterSignals, evidence }
  }
}
