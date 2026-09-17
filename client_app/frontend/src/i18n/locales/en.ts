/**
 * English UI strings for the VeriCorpus AI platform.
 * Used for analysis language-independent labels and messages.
 */

type UIStrings = {
  nav: {
    home: string
    upload: string
    results: string
    settings: string
    history: string
    admin: string
  }
  upload: {
    title: string
    dragDrop: string
    supportedFormats: string
    analyze: string
    analyzing: string
    uploadSuccess: string
    uploadError: string
    fileTooLarge: string
    unsupportedFormat: string
    noFileSelected: string
  }
  results: {
    title: string
    verdict: string
    confidence: string
    aiProbability: string
    humanCreated: string
    aiGenerated: string
    inconclusive: string
    loading: string
    noResults: string
    exportResults: string
    shareResults: string
    viewExplanation: string
    hideExplanation: string
  }
  verdict: {
    likelyManipulated: string
    likelyAuthentic: string
    inconclusive: string
  }
  confidence: {
    veryHigh: string
    high: string
    moderate: string
    low: string
    veryLow: string
  }
  settings: {
    title: string
    language: string
    analysisLanguage: string
    explanationLanguage: string
    analysisLanguageDescription: string
    explanationLanguageDescription: string
    theme: string
    darkMode: string
    lightMode: string
    save: string
    saved: string
  }
  common: {
    loading: string
    error: string
    retry: string
    cancel: string
    confirm: string
    delete: string
    edit: string
    save: string
    close: string
    back: string
    next: string
    search: string
    noData: string
    success: string
    warning: string
    info: string
  }
  mediaType: {
    text: string
    image: string
    audio: string
    video: string
    document: string
  }
  errors: {
    networkError: string
    serverError: string
    notFound: string
    unauthorized: string
    forbidden: string
    validationError: string
    unknownError: string
  }
  languageCapability: {
    reducedAccuracy: string
    modelNotTrained: string
    usingStylometricOnly: string
  }
  footer: {
    copyright: string
    tagline: string
  }
}

const en: UIStrings = {
  // Navigation
  nav: {
    home: 'Home',
    upload: 'Upload',
    results: 'Results',
    settings: 'Settings',
    history: 'History',
    admin: 'Admin',
  },

  // Upload
  upload: {
    title: 'Upload Media for Analysis',
    dragDrop: 'Drag and drop files here, or click to browse',
    supportedFormats: 'Supported formats',
    analyze: 'Analyze',
    analyzing: 'Analyzing...',
    uploadSuccess: 'File uploaded successfully',
    uploadError: 'Upload failed. Please try again.',
    fileTooLarge: 'File size exceeds maximum limit',
    unsupportedFormat: 'File format not supported',
    noFileSelected: 'No file selected',
  },

  // Results
  results: {
    title: 'Analysis Results',
    verdict: 'Verdict',
    confidence: 'Confidence',
    aiProbability: 'AI-Generated Probability',
    humanCreated: 'Likely Human-Created',
    aiGenerated: 'Likely AI-Generated',
    inconclusive: 'Inconclusive',
    loading: 'Loading results...',
    noResults: 'No results available',
    exportResults: 'Export Results',
    shareResults: 'Share Results',
    viewExplanation: 'View Explanation',
    hideExplanation: 'Hide Explanation',
  },

  // Verdict badges
  verdict: {
    likelyManipulated: 'Likely AI-Generated / Manipulated',
    likelyAuthentic: 'Likely Human-Created',
    inconclusive: 'Inconclusive',
  },

  // Confidence levels
  confidence: {
    veryHigh: 'Very High',
    high: 'High',
    moderate: 'Moderate',
    low: 'Low',
    veryLow: 'Very Low',
  },

  // Settings
  settings: {
    title: 'Settings',
    language: 'Language',
    analysisLanguage: 'Analysis Language',
    explanationLanguage: 'Explanation Language',
    analysisLanguageDescription: 'Language used for text analysis (affects detection accuracy)',
    explanationLanguageDescription: 'Language for UI labels and result explanations',
    theme: 'Theme',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    save: 'Save Settings',
    saved: 'Settings saved',
  },

  // Common
  common: {
    loading: 'Loading...',
    error: 'Error',
    retry: 'Retry',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    save: 'Save',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    search: 'Search',
    noData: 'No data available',
    success: 'Success',
    warning: 'Warning',
    info: 'Info',
  },

  // Media types
  mediaType: {
    text: 'Text',
    image: 'Image',
    audio: 'Audio',
    video: 'Video',
    document: 'Document',
  },

  // Errors
  errors: {
    networkError: 'Network error. Please check your connection.',
    serverError: 'Server error. Please try again later.',
    notFound: 'Resource not found.',
    unauthorized: 'Unauthorized. Please log in.',
    forbidden: 'Access denied.',
    validationError: 'Validation error.',
    unknownError: 'An unexpected error occurred.',
  },

  // Language capability warnings
  languageCapability: {
    reducedAccuracy: 'Detection accuracy is reduced for this language.',
    modelNotTrained: 'AI detection model not fully trained for this language.',
    usingStylometricOnly: 'Using stylometric features only.',
  },

  // Footer
  footer: {
    copyright: 'VeriCorpus AI',
    tagline: 'Ensuring digital authenticity across languages',
  },
} as const

export default en
