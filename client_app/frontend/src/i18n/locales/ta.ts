/**
 * Tamil UI strings for the VeriCorpus AI platform.
 */

import type { UIStrings } from './en'

const ta: UIStrings = {
  nav: {
    home: 'முகப்பு',
    upload: 'பதிவேற்றம்',
    results: 'முடிவுகள்',
    settings: 'அமைப்புகள்',
    history: 'வரலாறு',
    admin: 'நிர்வாகம்',
  },
  upload: {
    title: 'ஆய்வுக்காக ஊடகத்தை பதிவேற்றவும்',
    dragDrop: 'கோப்புகளை இங்கே இழுக்கவும் மற்றும் விடவும், அல்லது உலாவ கிளிக் செய்யவும்',
    supportedFormats: 'ஆதரிக்கப்படும் வடிவங்கள்',
    analyze: 'ஆய்வு செய்யுங்கள்',
    analyzing: 'ஆய்வு நடைபெறுகிறது...',
    uploadSuccess: 'கோப்பு வெற்றிகரமாக பதிவேற்றப்பட்டது',
    uploadError: 'பதிவேற்றம் தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்.',
    fileTooLarge: 'கோப்பு அளவு அதிகபட்ச வரம்பை மீறியது',
    unsupportedFormat: 'கோப்பு வடிவம் ஆதரிக்கப்படவில்லை',
    noFileSelected: 'கோப்பு தேர்ந்தெடுக்கப்படவில்லை',
  },
  results: {
    title: 'ஆய்வு முடிவுகள்',
    verdict: 'தீர்ப்பு',
    confidence: 'நம்பிக்கை',
    aiProbability: 'AI-உருவாக்கிய நிகழ்தகவு',
    humanCreated: 'மனித உருவாக்கியது',
    aiGenerated: 'AI-உருவாக்கியது',
    inconclusive: 'தீர்மானமற்றது',
    loading: 'முடிவுகள் ஏற்றப்படுகின்றன...',
    noResults: 'முடிவுகள் கிடைக்கவில்லை',
    exportResults: 'முடிவுகளை ஏற்றுமதி செய்யுங்கள்',
    shareResults: 'முடிவுகளைப் பகிருங்கள்',
    viewExplanation: 'விளக்கத்தைக் காண',
    hideExplanation: 'விளக்கத்தை மறை',
  },
  verdict: {
    likelyManipulated: 'AI-உருவாக்கியது / மாற்றியமைக்கப்பட்டது',
    likelyAuthentic: 'மனித உருவாக்கியது',
    inconclusive: 'தீர்மானமற்றது',
  },
  confidence: {
    veryHigh: 'மிக உயர்ந்த',
    high: 'உயர்ந்த',
    moderate: 'நடுத்தர',
    low: 'குறைந்த',
    veryLow: 'மிகக் குறைந்த',
  },
  settings: {
    title: 'அமைப்புகள்',
    language: 'மொழி',
    analysisLanguage: 'ஆய்வு மொழி',
    explanationLanguage: 'விளக்க மொழி',
    analysisLanguageDescription:
      'உரை ஆய்வுக்கு பயன்படுத்தப்படும் மொழி (கண்டறிதல் துல்லியத்தை பாதிக்கிறது)',
    explanationLanguageDescription: 'UI லேபிள்கள் மற்றும் முடிவு விளக்கங்களுக்கான மொழி',
    theme: 'தீம்',
    darkMode: 'இருண்ட பயன்முறை',
    lightMode: 'ஒளிர் பயன்முறை',
    save: 'அமைப்புகளைச் சேமி',
    saved: 'அமைப்புகள் சேமிக்கப்பட்டன',
  },
  common: {
    loading: 'ஏற்றுகிறது...',
    error: 'பிழை',
    retry: 'மீண்டும் முயற்சி',
    cancel: 'ரத்து',
    confirm: 'உறுதிப்படுத்து',
    delete: 'நீக்கு',
    edit: 'திருத்து',
    save: 'சேமி',
    close: 'மூடு',
    back: 'பின்',
    next: 'அடுத்து',
    search: 'தேடு',
    noData: 'தரவு கிடைக்கவில்லை',
    success: 'வெற்றி',
    warning: 'எச்சரிக்கை',
    info: 'தகவல்',
  },
  mediaType: {
    text: 'உரை',
    image: 'படம்',
    audio: 'ஆடியோ',
    video: 'வீடியோ',
    document: 'ஆவணம்',
  },
  errors: {
    networkError: 'நெட்வொர்க் பிழை. உங்கள் இணைப்பைச் சரிபார்க்கவும்.',
    serverError: 'சர்வர் பிழை. பின்னர் மீண்டும் முயற்சிக்கவும்.',
    notFound: 'வளம் கிடைக்கவில்லை.',
    unauthorized: 'அங்கீகரிக்கப்படவில்லை. உள்நுழையவும்.',
    forbidden: 'அணுகல் மறுக்கப்பட்டது.',
    validationError: 'சரிபார்ப்பு பிழை.',
    unknownError: 'எதிர்பாராத பிழை ஏற்பட்டது.',
  },
  languageCapability: {
    reducedAccuracy: 'இந்த மொழிக்கான கண்டறிதல் துல்லியம் குறைக்கப்பட்டுள்ளது.',
    modelNotTrained: 'AI கண்டறிதல் மாதிரி இந்த மொழிக்கு முழுமையாக பயிற்சி பெறவில்லை.',
    usingStylometricOnly: 'ஸ்டைலோமெட்ரிக் அம்சங்கள் மட்டுமே பயன்படுத்தப்படுகின்றன.',
  },
  footer: {
    copyright: 'VeriCorpus AI',
    tagline: 'மொழிகள் முழுவதும் டிஜிட்டல் நம்பகத்தன்மையை உறுதிப்படுத்துதல்',
  },
}

export default ta
