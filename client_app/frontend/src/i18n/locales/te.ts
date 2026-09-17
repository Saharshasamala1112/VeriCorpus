/**
 * Telugu UI strings for the VeriCorpus AI platform.
 */

import type { UIStrings } from './en'

const te: UIStrings = {
  nav: {
    home: 'హోమ్',
    upload: 'అప్‌లోడ్',
    results: 'ఫలితాలు',
    settings: 'సెట్టింగ్‌లు',
    history: 'చరిత్ర',
    admin: 'అడ్మిన్',
  },
  upload: {
    title: 'విశ్లేషణ కోసం మీడియాను అప్‌లోడ్ చేయండి',
    dragDrop: 'ఫైల్‌లను ఇక్కడ లాగండి మరియు డ్రాప్ చేయండి, లేదా బ్రౌజ్ చేయడానికి క్లిక్ చేయండి',
    supportedFormats: 'మద్దతు ఉన్న ఫార్మాట్‌లు',
    analyze: 'విశ్లేషించండి',
    analyzing: 'విశ్లేషిస్తోంది...',
    uploadSuccess: 'ఫైల్ విజయవంతంగా అప్‌లోడ్ చేయబడింది',
    uploadError: 'అప్‌లోడ్ విఫలమైంది. దయచేసి మళ్ళీ ప్రయత్నించండి.',
    fileTooLarge: 'ఫైల్ పరిమాణం గరిష్ట పరిమితిని మించింది',
    unsupportedFormat: 'ఫైల్ ఫార్మాట్ మద్దతు లేదు',
    noFileSelected: 'ఫైల్ ఎంచుకోబడలేదు',
  },
  results: {
    title: 'విశ్లేషణ ఫలితాలు',
    verdict: 'తీర్పు',
    confidence: 'నమ్మకం',
    aiProbability: 'AI-జనరేటెడ్ సంభావ్యత',
    humanCreated: 'మానవ సృష్టించినది',
    aiGenerated: 'AI-జనరేటెడ్',
    inconclusive: 'నిర్ణయాత్మకం కాదు',
    loading: 'ఫలితాలు లోడ్ అవుతున్నాయి...',
    noResults: 'ఫలితాలు అందుబాటులో లేవు',
    exportResults: 'ఫలితాలను ఎగుమతి చేయండి',
    shareResults: 'ఫలితాలను షేర్ చేయండి',
    viewExplanation: 'వివరణను చూడండి',
    hideExplanation: 'వివరణను దాచండి',
  },
  verdict: {
    likelyManipulated: 'AI-జనరేటెడ్ / మానిప్యులేట్ చేయబడినది',
    likelyAuthentic: 'మానవ సృష్టించినది',
    inconclusive: 'నిర్ణయాత్మకం కాదు',
  },
  confidence: {
    veryHigh: 'చాలా ఎక్కువ',
    high: 'ఎక్కువ',
    moderate: 'మధ్యస్థం',
    low: 'తక్కువ',
    veryLow: 'చాలా తక్కువ',
  },
  settings: {
    title: 'సెట్టింగ్‌లు',
    language: 'భాష',
    analysisLanguage: 'విశ్లేషణ భాష',
    explanationLanguage: 'వివరణ భాష',
    analysisLanguageDescription:
      'టెక్స్ట్ విశ్లేషణ కోసం ఉపయోగించే భాష (గుర్తింపు ఖచ్చితత్వాన్ని ప్రభావితం చేస్తుంది)',
    explanationLanguageDescription: 'UI లేబుల్స్ మరియు ఫలిత వివరణల కోసం భాష',
    theme: 'థీమ్',
    darkMode: 'డార్క్ మోడ్',
    lightMode: 'లైట్ మోడ్',
    save: 'సెట్టింగ్‌లు సేవ్ చేయండి',
    saved: 'సెట్టింగ్‌లు సేవ్ చేయబడ్డాయి',
  },
  common: {
    loading: 'లోడ్ అవుతోంది...',
    error: 'లోపం',
    retry: 'మళ్ళీ ప్రయత్నించండి',
    cancel: 'రద్దు',
    confirm: 'నిర్ధారించండి',
    delete: 'తొలగించండి',
    edit: 'సవరించండి',
    save: 'సేవ్ చేయండి',
    close: 'మూసివేయండి',
    back: 'వెనుకకు',
    next: 'తదుపరి',
    search: 'శోధించండి',
    noData: 'డేటా అందుబాటులో లేదు',
    success: 'విజయం',
    warning: 'హెచ్చరిక',
    info: 'సమాచారం',
  },
  mediaType: {
    text: 'టెక్స్ట్',
    image: 'చిత్రం',
    audio: 'ఆడియో',
    video: 'వీడియో',
    document: 'పత్రం',
  },
  errors: {
    networkError: 'నెట్‌వర్క్ లోపం. దయచేసి మీ కనెక్షన్ తనిఖీ చేయండి.',
    serverError: 'సర్వర్ లోపం. దయచేసి తర్వాత మళ్ళీ ప్రయత్నించండి.',
    notFound: 'వనరు కనుగొనబడలేదు.',
    unauthorized: 'అనధికృత. దయచేసి లాగిన్ అవ్వండి.',
    forbidden: 'యాక్సెస్ నిరాకరించబడింది.',
    validationError: 'వాలిడేషన్ లోపం.',
    unknownError: 'అనుకోని లోపం సంభవించింది.',
  },
  languageCapability: {
    reducedAccuracy: 'ఈ భాష కోసం గుర్తింపు ఖచ్చితత్వం తగ్గించబడింది.',
    modelNotTrained: 'AI గుర్తింపు మోడల్ ఈ భాష కోసం పూర్తిగా శిక్షణ పొందలేదు.',
    usingStylometricOnly: 'స్టైలోమెట్రిక్ ఫీచర్లు మాత్రమే ఉపయోగిస్తోంది.',
  },
  footer: {
    copyright: 'VeriCorpus AI',
    tagline: 'భాషల అంతటా డిజిటల్ ప్రామాణికతను నిర్ధారించడం',
  },
}

export default te
