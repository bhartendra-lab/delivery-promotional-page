/**
 * The words of the two share messages (the gallery invite and the family
 * passcode) in the languages a studio's guests read. A static table: no
 * runtime translation, so what a studio previews is exactly what is sent.
 *
 * English is NOT in this table. It stays in lib/share-message.ts, byte for byte
 * as it has always been sent (a test pins it), so nothing here can change it.
 *
 * Each language has the same four pieces, matching the English meaning:
 *  - `ready(event)`: the opening line, with the event's name where English has it;
 *  - `inviteSelfie`: the line before the link when selfie search is on;
 *  - `inviteSignIn`: the line before the link when it is off;
 *  - `passcode(code, event)`: "use this passcode to see all photos"; `event` is
 *    null when the event has no name, and the sentence then drops it.
 * The event name and the link are only ever interpolated, never altered.
 *
 * TODO(abhishek): native-speaker review for every language here except Hindi
 * (Hinglish, Marathi, Gujarati, Bengali, Punjabi, Odia, Tamil, Telugu, Kannada,
 * Malayalam). They are written to be warm, short and natural, but none has been
 * read by a native speaker yet. Hindi was written to the same bar and is the
 * one the studio's team can check in house.
 */

export type ShareLang =
  | "en"
  | "hi"
  | "hinglish"
  | "mr"
  | "gu"
  | "bn"
  | "pa"
  | "or"
  | "ta"
  | "te"
  | "kn"
  | "ml";

export const DEFAULT_SHARE_LANG: ShareLang = "en";

/** In the order the dropdown shows them. */
export const SHARE_LANGUAGES: ReadonlyArray<{ code: ShareLang; label: string }> = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi (हिन्दी)" },
  { code: "hinglish", label: "Hinglish (Roman script)" },
  { code: "mr", label: "Marathi (मराठी)" },
  { code: "gu", label: "Gujarati (ગુજરાતી)" },
  { code: "bn", label: "Bengali (বাংলা)" },
  { code: "pa", label: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "or", label: "Odia (ଓଡ଼ିଆ)" },
  { code: "ta", label: "Tamil (தமிழ்)" },
  { code: "te", label: "Telugu (తెలుగు)" },
  { code: "kn", label: "Kannada (ಕನ್ನಡ)" },
  { code: "ml", label: "Malayalam (മലയാളം)" },
];

export function isShareLang(value: unknown): value is ShareLang {
  return typeof value === "string" && SHARE_LANGUAGES.some((l) => l.code === value);
}

export type ShareStrings = {
  ready: (event: string) => string;
  inviteSelfie: string;
  inviteSignIn: string;
  passcode: (code: string, event: string | null) => string;
  /** What ends the passcode message when there is no link after it. */
  stop: string;
};

export const SHARE_STRINGS: Record<Exclude<ShareLang, "en">, ShareStrings> = {
  hi: {
    ready: (e) => `नमस्ते! ${e} की तस्वीरें तैयार हैं। 🎉`,
    inviteSelfie: "गैलरी खोलें और साइन इन करें। एक छोटी सी सेल्फ़ी लें और अपनी सभी फ़ोटो देखें:",
    inviteSignIn: "गैलरी खोलें और साइन इन करके सारी फ़ोटो देखें:",
    passcode: (c, e) => (e ? `${e} की सभी फ़ोटो देखने के लिए पासकोड ${c} का उपयोग करें` : `सभी फ़ोटो देखने के लिए पासकोड ${c} का उपयोग करें`),
    stop: "।",
  },
  hinglish: {
    ready: (e) => `Namaste! ${e} ki photos taiyaar hain. 🎉`,
    inviteSelfie: "Gallery kholein aur sign in karein. Ek chhoti si selfie lein aur apni saari photos dekhein:",
    inviteSignIn: "Gallery kholein aur sign in karke saari photos dekhein:",
    passcode: (c, e) => (e ? `${e} ki saari photos dekhne ke liye passcode ${c} use karein` : `Saari photos dekhne ke liye passcode ${c} use karein`),
    stop: ".",
  },
  mr: {
    ready: (e) => `नमस्कार! ${e} चे फोटो तयार आहेत. 🎉`,
    inviteSelfie: "गॅलरी उघडा आणि साइन इन करा. एक छोटासा सेल्फी घ्या आणि तुमचे सर्व फोटो पहा:",
    inviteSignIn: "गॅलरी उघडा आणि साइन इन करून फोटो पहा:",
    passcode: (c, e) => (e ? `${e} चे सर्व फोटो पाहण्यासाठी पासकोड ${c} वापरा` : `सर्व फोटो पाहण्यासाठी पासकोड ${c} वापरा`),
    stop: ".",
  },
  gu: {
    ready: (e) => `નમસ્તે! ${e} ના ફોટા તૈયાર છે. 🎉`,
    inviteSelfie: "ગેલેરી ખોલો અને સાઇન ઇન કરો. એક નાની સેલ્ફી લો અને તમારા બધા ફોટા જુઓ:",
    inviteSignIn: "ગેલેરી ખોલો અને સાઇન ઇન કરીને ફોટા જુઓ:",
    passcode: (c, e) => (e ? `${e} ના બધા ફોટા જોવા માટે પાસકોડ ${c} વાપરો` : `બધા ફોટા જોવા માટે પાસકોડ ${c} વાપરો`),
    stop: ".",
  },
  bn: {
    ready: (e) => `নমস্কার! ${e} এর ছবিগুলো তৈরি হয়ে গেছে। 🎉`,
    inviteSelfie: "গ্যালারি খুলুন এবং সাইন ইন করুন। একটি ছোট সেলফি তুলুন আর আপনার সব ছবি দেখুন:",
    inviteSignIn: "গ্যালারি খুলুন এবং সাইন ইন করে ছবিগুলো দেখুন:",
    passcode: (c, e) => (e ? `${e} এর সব ছবি দেখতে পাসকোড ${c} ব্যবহার করুন` : `সব ছবি দেখতে পাসকোড ${c} ব্যবহার করুন`),
    stop: "।",
  },
  pa: {
    ready: (e) => `ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ${e} ਦੀਆਂ ਫ਼ੋਟੋਆਂ ਤਿਆਰ ਹਨ। 🎉`,
    inviteSelfie: "ਗੈਲਰੀ ਖੋਲ੍ਹੋ ਅਤੇ ਸਾਈਨ ਇਨ ਕਰੋ। ਇੱਕ ਛੋਟੀ ਜਿਹੀ ਸੈਲਫ਼ੀ ਲਓ ਅਤੇ ਆਪਣੀਆਂ ਸਾਰੀਆਂ ਫ਼ੋਟੋਆਂ ਦੇਖੋ:",
    inviteSignIn: "ਗੈਲਰੀ ਖੋਲ੍ਹੋ ਅਤੇ ਸਾਈਨ ਇਨ ਕਰਕੇ ਫ਼ੋਟੋਆਂ ਦੇਖੋ:",
    passcode: (c, e) => (e ? `${e} ਦੀਆਂ ਸਾਰੀਆਂ ਫ਼ੋਟੋਆਂ ਦੇਖਣ ਲਈ ਪਾਸਕੋਡ ${c} ਵਰਤੋ` : `ਸਾਰੀਆਂ ਫ਼ੋਟੋਆਂ ਦੇਖਣ ਲਈ ਪਾਸਕੋਡ ${c} ਵਰਤੋ`),
    stop: "।",
  },
  or: {
    ready: (e) => `ନମସ୍କାର! ${e} ର ଫଟୋଗୁଡ଼ିକ ପ୍ରସ୍ତୁତ। 🎉`,
    inviteSelfie: "ଗ୍ୟାଲେରୀ ଖୋଲନ୍ତୁ ଏବଂ ସାଇନ ଇନ୍ କରନ୍ତୁ। ଗୋଟିଏ ଛୋଟ ସେଲଫି ନିଅନ୍ତୁ ଏବଂ ଆପଣଙ୍କ ସମସ୍ତ ଫଟୋ ଦେଖନ୍ତୁ:",
    inviteSignIn: "ଗ୍ୟାଲେରୀ ଖୋଲନ୍ତୁ ଏବଂ ସାଇନ ଇନ୍ କରି ଫଟୋ ଦେଖନ୍ତୁ:",
    passcode: (c, e) => (e ? `${e} ର ସମସ୍ତ ଫଟୋ ଦେଖିବା ପାଇଁ ପାସକୋଡ୍ ${c} ବ୍ୟବହାର କରନ୍ତୁ` : `ସମସ୍ତ ଫଟୋ ଦେଖିବା ପାଇଁ ପାସକୋଡ୍ ${c} ବ୍ୟବହାର କରନ୍ତୁ`),
    stop: "।",
  },
  ta: {
    ready: (e) => `வணக்கம்! ${e} புகைப்படங்கள் தயார். 🎉`,
    inviteSelfie: "கேலரியைத் திறந்து உள்நுழையுங்கள். ஒரு சிறிய செல்ஃபி எடுத்து நீங்கள் இருக்கும் எல்லாப் படங்களையும் பாருங்கள்:",
    inviteSignIn: "கேலரியைத் திறந்து உள்நுழைந்து படங்களைப் பாருங்கள்:",
    passcode: (c, e) => (e ? `${e} இன் எல்லாப் புகைப்படங்களையும் பார்க்க கடவுக்குறியீடு ${c} ஐப் பயன்படுத்துங்கள்` : `எல்லாப் புகைப்படங்களையும் பார்க்க கடவுக்குறியீடு ${c} ஐப் பயன்படுத்துங்கள்`),
    stop: ".",
  },
  te: {
    ready: (e) => `నమస్కారం! ${e} ఫోటోలు సిద్ధంగా ఉన్నాయి. 🎉`,
    inviteSelfie: "గ్యాలరీని తెరిచి సైన్ ఇన్ చేయండి. ఒక చిన్న సెల్ఫీ తీసుకుని మీరు ఉన్న అన్ని ఫోటోలను చూడండి:",
    inviteSignIn: "గ్యాలరీని తెరిచి సైన్ ఇన్ చేసి ఫోటోలను చూడండి:",
    passcode: (c, e) => (e ? `${e} యొక్క అన్ని ఫోటోలను చూడటానికి పాస్‌కోడ్ ${c} ఉపయోగించండి` : `అన్ని ఫోటోలను చూడటానికి పాస్‌కోడ్ ${c} ఉపయోగించండి`),
    stop: ".",
  },
  kn: {
    ready: (e) => `ನಮಸ್ಕಾರ! ${e} ಫೋಟೋಗಳು ಸಿದ್ಧವಾಗಿವೆ. 🎉`,
    inviteSelfie: "ಗ್ಯಾಲರಿ ತೆರೆದು ಸೈನ್ ಇನ್ ಮಾಡಿ. ಒಂದು ಚಿಕ್ಕ ಸೆಲ್ಫಿ ತೆಗೆದುಕೊಂಡು ನೀವು ಇರುವ ಎಲ್ಲಾ ಫೋಟೋಗಳನ್ನು ನೋಡಿ:",
    inviteSignIn: "ಗ್ಯಾಲರಿ ತೆರೆದು ಸೈನ್ ಇನ್ ಮಾಡಿ ಫೋಟೋಗಳನ್ನು ನೋಡಿ:",
    passcode: (c, e) => (e ? `${e} ನ ಎಲ್ಲಾ ಫೋಟೋಗಳನ್ನು ನೋಡಲು ಪಾಸ್‌ಕೋಡ್ ${c} ಬಳಸಿ` : `ಎಲ್ಲಾ ಫೋಟೋಗಳನ್ನು ನೋಡಲು ಪಾಸ್‌ಕೋಡ್ ${c} ಬಳಸಿ`),
    stop: ".",
  },
  ml: {
    ready: (e) => `നമസ്കാരം! ${e} ഫോട്ടോകൾ തയ്യാറാണ്. 🎉`,
    inviteSelfie: "ഗാലറി തുറന്ന് സൈൻ ഇൻ ചെയ്യൂ. ഒരു ചെറിയ സെൽഫി എടുത്ത് നിങ്ങളുള്ള എല്ലാ ഫോട്ടോകളും കാണൂ:",
    inviteSignIn: "ഗാലറി തുറന്ന് സൈൻ ഇൻ ചെയ്ത് ഫോട്ടോകൾ കാണൂ:",
    passcode: (c, e) => (e ? `${e} ന്റെ എല്ലാ ഫോട്ടോകളും കാണാൻ പാസ്കോഡ് ${c} ഉപയോഗിക്കൂ` : `എല്ലാ ഫോട്ടോകളും കാണാൻ പാസ്കോഡ് ${c} ഉപയോഗിക്കൂ`),
    stop: ".",
  },
};
