/**
 * Malayalam UI strings for the VeriCorpus AI platform.
 */

import type { UIStrings } from './en'

const ml: UIStrings = {
  nav: {
    home: 'ഹോം',
    upload: 'അപ്‌ലോഡ്',
    results: 'ഫലങ്ങൾ',
    settings: 'സെറ്റിംഗ്സ്',
    history: 'ചരിത്രം',
    admin: 'അഡ്മിൻ',
  },
  upload: {
    title: 'വിശകലനത്തിനായി മീഡിയ അപ്‌ലോഡ് ചെയ്യുക',
    dragDrop: 'ഫയലുകൾ ഇവിടെ വലിച്ചിടുക, അല്ലെങ്കിൽ ബ്രൗസ് ചെയ്യാൻ ക്ലിക്ക് ചെയ്യുക',
    supportedFormats: 'പിന്തുണയ്ക്കുന്ന ഫോർമാറ്റുകൾ',
    analyze: 'വിശകലനം ചെയ്യുക',
    analyzing: 'വിശകലനം നടക്കുന്നു...',
    uploadSuccess: 'ഫയൽ വിജയകരമായി അപ്‌ലോഡ് ചെയ്തു',
    uploadError: 'അപ്‌ലോഡ് പരാജയപ്പെട്ടു. ദയവായി വീണ്ടും ശ്രമിക്കുക.',
    fileTooLarge: 'ഫയലിന്റെ വലുപ്പം പരമാവധി പരിധി കവിഞ്ഞു',
    unsupportedFormat: 'ഫയൽ ഫോർമാറ്റ് പിന്തുണയ്ക്കുന്നില്ല',
    noFileSelected: 'ഫയൽ തിരഞ്ഞെടുക്കാതെ',
  },
  results: {
    title: 'വിശകലന ഫലങ്ങൾ',
    verdict: 'വിധി',
    confidence: 'ആത്മവിശ്വാസം',
    aiProbability: 'AI-ജനിത സാധ്യത',
    humanCreated: 'മനുഷ്യസൃഷ്ടിച്ചത്',
    aiGenerated: 'AI-ജനിത',
    inconclusive: 'നിർണായകമല്ല',
    loading: 'ഫലങ്ങൾ ലോഡ് ചെയ്യുന്നു...',
    noResults: 'ഫലങ്ങൾ ലഭ്യമല്ല',
    exportResults: 'ഫലങ്ങൾ എക്സ്പോർട്ട് ചെയ്യുക',
    shareResults: 'ഫലങ്ങൾ പങ്കിടുക',
    viewExplanation: 'വിശദീകരണം കാണുക',
    hideExplanation: 'വിശദീകരണം മറയ്ക്കുക',
  },
  verdict: {
    likelyManipulated: 'AI-ജനിത / കൈകാര്യം ചെയ്തത്',
    likelyAuthentic: 'മനുഷ്യസൃഷ്ടിച്ചത്',
    inconclusive: 'നിർണായകമല്ല',
  },
  confidence: {
    veryHigh: 'വളരെ ഉയർന്ന',
    high: 'ഉയർന്ന',
    moderate: 'മധ്യമ',
    low: 'കുറഞ്ഞ',
    veryLow: 'വളരെ കുറഞ്ഞ',
  },
  settings: {
    title: 'സെറ്റിംഗ്സ്',
    language: 'ഭാഷ',
    analysisLanguage: 'വിശകലന ഭാഷ',
    explanationLanguage: 'വിശദീകരണ ഭാഷ',
    analysisLanguageDescription:
      'വാചക വിശകലനത്തിന് ഉപയോഗിക്കുന്ന ഭാഷ (തിരിച്ചറിയൽ കൃത്യത ബാധിക്കുന്നു)',
    explanationLanguageDescription: 'UI ലേബലുകൾക്കും ഫല വിശദീകരണങ്ങൾക്കും ഭാഷ',
    theme: 'തീം',
    darkMode: 'ഡാർക്ക് മോഡ്',
    lightMode: 'ലൈറ്റ് മോഡ്',
    save: 'സെറ്റിംഗ്സ് സേവ് ചെയ്യുക',
    saved: 'സെറ്റിംഗ്സ് സേവ് ചെയ്തു',
  },
  common: {
    loading: 'ലോഡ് ചെയ്യുന്നു...',
    error: 'പിശക്',
    retry: 'വീണ്ടും ശ്രമിക്കുക',
    cancel: 'റദ്ദാക്കുക',
    confirm: 'സ്ഥിരീകരിക്കുക',
    delete: 'ഇല്ലാതാക്കുക',
    edit: 'എഡിറ്റ് ചെയ്യുക',
    save: 'സേവ് ചെയ്യുക',
    close: 'അടയ്ക്കുക',
    back: 'പിന്നിലേക്ക്',
    next: 'അടുത്തത്',
    search: 'തിരയുക',
    noData: 'ഡാറ്റ ലഭ്യമല്ല',
    success: 'വിജയം',
    warning: 'മുന്നറിയിപ്പ്',
    info: 'വിവരം',
  },
  mediaType: {
    text: 'വാചകം',
    image: 'ചിത്രം',
    audio: 'ഓഡിയോ',
    video: 'വീഡിയോ',
    document: 'ഡോക്യുമെന്റ്',
  },
  errors: {
    networkError: 'നെറ്റ്‌വർക്ക് പിശക്. ദയവായി നിങ്ങളുടെ കണക്ഷൻ പരിശോധിക്കുക.',
    serverError: 'സെർവർ പിശക്. ദയവായി പിന്നീട് വീണ്ടും ശ്രമിക്കുക.',
    notFound: 'വിഭവം കണ്ടെത്തിയില്ല.',
    unauthorized: 'അനധികൃതം. ദയവായി ലോഗ് ഇൻ ചെയ്യുക.',
    forbidden: 'ആക്സസ്സ് നിഷേധിച്ചു.',
    validationError: 'സാധൂകരണ പിശക്.',
    unknownError: 'അപ്രതീക്ഷിത പിശക് സംഭവിച്ചു.',
  },
  languageCapability: {
    reducedAccuracy: 'ഈ ഭാഷയ്ക്കുള്ള തിരിച്ചറിയൽ കൃത്യത കുറച്ചിരിക്കുന്നു.',
    modelNotTrained: 'AI തിരിച്ചറിയൽ മോഡൽ ഈ ഭാഷയ്ക്ക് പൂർണ്ണമായി പരിശീലിപ്പിച്ചിട്ടില്ല.',
    usingStylometricOnly: 'സ്റ്റൈലോമെട്രിക് സവിശേഷതകൾ മാത്രമേ ഉപയോഗിക്കുന്നുള്ളൂ.',
  },
  footer: {
    copyright: 'VeriCorpus AI',
    tagline: 'ഭാഷകളിലുടനീളം ഡിജിറ്റൽ ആധികാരികത ഉറപ്പാക്കുന്നു',
  },
}

export default ml
