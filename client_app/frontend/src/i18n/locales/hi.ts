/**
 * Hindi UI strings for the VeriCorpus AI platform.
 */

import type { UIStrings } from './en'

const hi: UIStrings = {
  nav: {
    home: 'होम',
    upload: 'अपलोड',
    results: 'परिणाम',
    settings: 'सेटिंग्स',
    history: 'इतिहास',
    admin: 'एडमिन',
  },
  upload: {
    title: 'विश्लेषण के लिए मीडिया अपलोड करें',
    dragDrop: 'फ़ाइलें यहाँ खींचें और छोड़ें, या ब्राउज़ करने के लिए क्लिक करें',
    supportedFormats: 'समर्थित प्रारूप',
    analyze: 'विश्लेषण करें',
    analyzing: 'विश्लेषण हो रहा है...',
    uploadSuccess: 'फ़ाइल सफलतापूर्वक अपलोड हो गई',
    uploadError: 'अपलोड विफल। कृपया पुनः प्रयास करें।',
    fileTooLarge: 'फ़ाइल का आकार अधिकतम सीमा से अधिक है',
    unsupportedFormat: 'फ़ाइल प्रारूप समर्थित नहीं है',
    noFileSelected: 'कोई फ़ाइल चयनित नहीं है',
  },
  results: {
    title: 'विश्लेषण परिणाम',
    verdict: 'निर्णय',
    confidence: 'विश्वास',
    aiProbability: 'AI-जनित संभावना',
    humanCreated: 'मानव-निर्मित',
    aiGenerated: 'AI-जनित',
    inconclusive: 'निर्णायक नहीं',
    loading: 'परिणाम लोड हो रहे हैं...',
    noResults: 'कोई परिणाम उपलब्ध नहीं',
    exportResults: 'परिणाम निर्यात करें',
    shareResults: 'परिणाम साझा करें',
    viewExplanation: 'व्याख्या देखें',
    hideExplanation: 'व्याख्या छुपाएं',
  },
  verdict: {
    likelyManipulated: 'AI-जनित / हेरफेर किया गया',
    likelyAuthentic: 'मानव-निर्मित',
    inconclusive: 'निर्णायक नहीं',
  },
  confidence: {
    veryHigh: 'बहुत उच्च',
    high: 'उच्च',
    moderate: 'मध्यम',
    low: 'कम',
    veryLow: 'बहुत कम',
  },
  settings: {
    title: 'सेटिंग्स',
    language: 'भाषा',
    analysisLanguage: 'विश्लेषण भाषा',
    explanationLanguage: 'व्याख्या भाषा',
    analysisLanguageDescription:
      'पाठ विश्लेषण के लिए उपयोग की जाने वाली भाषा (पहचान सटीकता को प्रभावित करती है)',
    explanationLanguageDescription: 'UI लेबल और परिणाम व्याख्या के लिए भाषा',
    theme: 'थीम',
    darkMode: 'डार्क मोड',
    lightMode: 'लाइट मोड',
    save: 'सेटिंग्स सहेजें',
    saved: 'सेटिंग्स सहेजी गईं',
  },
  common: {
    loading: 'लोड हो रहा है...',
    error: 'त्रुटि',
    retry: 'पुनः प्रयास करें',
    cancel: 'रद्द करें',
    confirm: 'पुष्टि करें',
    delete: 'हटाएं',
    edit: 'संपादित करें',
    save: 'सहेजें',
    close: 'बंद करें',
    back: 'वापस',
    next: 'अगला',
    search: 'खोजें',
    noData: 'कोई डेटा उपलब्ध नहीं',
    success: 'सफल',
    warning: 'चेतावनी',
    info: 'जानकारी',
  },
  mediaType: {
    text: 'पाठ',
    image: 'चित्र',
    audio: 'ऑडियो',
    video: 'वीडियो',
    document: 'दस्तावेज़',
  },
  errors: {
    networkError: 'नेटवर्क त्रुटि। कृपया अपना कनेक्शन जांचें।',
    serverError: 'सर्वर त्रुटि। कृपया बाद में पुनः प्रयास करें।',
    notFound: 'संसाधन नहीं मिला।',
    unauthorized: 'अनधिकृत। कृपया लॉग इन करें।',
    forbidden: 'पहुँच अस्वीकृत।',
    validationError: 'सत्यापन त्रुटि।',
    unknownError: 'एक अप्रत्याशित त्रुटि हुई।',
  },
  languageCapability: {
    reducedAccuracy: 'इस भाषा के लिए पहचान सटीकता कम है।',
    modelNotTrained: 'AI पहचान मॉडल इस भाषा के लिए पूर्णतः प्रशिक्षित नहीं है।',
    usingStylometricOnly: 'केवल स्टाइलोमेट्रिक सुविधाएँ उपयोग हो रही हैं।',
  },
  footer: {
    copyright: 'VeriCorpus AI',
    tagline: 'भाषाओं में डिजिटल प्रामाणिकता सुनिश्चित करना',
  },
}

export default hi
