export async function getAvailableTargetsFor(sourceLanguage: string) {
  if (typeof Translator === "undefined") {
    console.error("Translator API is not available in this environment.");
    return [];
  }

  // A known set of possible target language codes (you may adjust this list)
  const langs = [
    "af",
    "sq",
    "am",
    "ar",
    "hy",
    "az",
    "eu",
    "be",
    "bn",
    "bs",
    "bg",
    "ca",
    "ceb",
    "ny",
    "zh",
    "zh-CN",
    "zh-TW",
    "co",
    "hr",
    "cs",
    "da",
    "nl",
    "en",
    "eo",
    "et",
    "tl",
    "fi",
    "fr",
    "fy",
    "gl",
    "ka",
    "de",
    "el",
    "gu",
    "ht",
    "ha",
    "haw",
    "he",
    "hi",
    "hmn",
    "hu",
    "is",
    "ig",
    "id",
    "ga",
    "it",
    "ja",
    "jw",
    "kn",
    "kk",
    "km",
    "ko",
    "ku",
    "ky",
    "lo",
    "la",
    "lv",
    "lt",
    "lb",
    "mk",
    "mg",
    "ms",
    "ml",
    "mt",
    "mi",
    "mr",
    "mn",
    "my",
    "ne",
    "no",
    "ps",
    "fa",
    "pl",
    "pt",
    "pa",
    "ro",
    "ru",
    "sm",
    "gd",
    "sr",
    "st",
    "sn",
    "sd",
    "si",
    "sk",
    "sl",
    "so",
    "es",
    "su",
    "sw",
    "sv",
    "tg",
    "ta",
    "te",
    "th",
    "tr",
    "uk",
    "ur",
    "uz",
    "vi",
    "cy",
    "xh",
    "yi",
    "yo",
    "zu",
    // ... add more codes as needed
  ];

  console.log("in function", langs.length);
  const checks = langs
    .filter((t) => t !== sourceLanguage)
    .map(async (targetLanguage) => {
      try {
        const availability = await Translator.availability({
          sourceLanguage,
          targetLanguage,
        });
        // We treat 'available' as success. You might also consider 'downloadable'
        if (availability === "downloadable") {
          console.log(targetLanguage, "works");
          return targetLanguage;
        } else {
          return null;
        }
      } catch (err) {
        console.warn(
          `Error checking pair ${sourceLanguage} → ${targetLanguage}:`,
          err
        );
        return null;
      }
    });

  const results = await Promise.all(checks);
  const available = results.filter((t) => t);
  console.log(`Available targets for "${sourceLanguage}":`, available);
  return available;
}
