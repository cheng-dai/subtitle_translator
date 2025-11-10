interface Language {
  code: string;
  name: string;
  flag: string;
}

const LANGUAGES: Language[] = [
  { code: "ar", name: "Arabic", flag: "🇸🇦" },
  { code: "bn", name: "Bengali", flag: "🇧🇩" },
  { code: "bg", name: "Bulgarian", flag: "🇧🇬" },
  { code: "zh-cn", name: "Chinese (Simplified)", flag: "🇨🇳" },
  { code: "hr", name: "Croatian", flag: "🇭🇷" },
  { code: "cs", name: "Czech", flag: "🇨🇿" },
  { code: "da", name: "Danish", flag: "🇩🇰" },
  { code: "nl", name: "Dutch", flag: "🇳🇱" },
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "fi", name: "Finnish", flag: "🇫🇮" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "el", name: "Greek", flag: "🇬🇷" },
  { code: "he", name: "Hebrew", flag: "🇮🇱" },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "hu", name: "Hungarian", flag: "🇭🇺" },
  { code: "id", name: "Indonesian", flag: "🇮🇩" },
  { code: "it", name: "Italian", flag: "🇮🇹" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "kn", name: "Kannada", flag: "🇮🇳" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "lt", name: "Lithuanian", flag: "🇱🇹" },
  { code: "mr", name: "Marathi", flag: "🇮🇳" },
  { code: "no", name: "Norwegian", flag: "🇳🇴" },
  { code: "pl", name: "Polish", flag: "🇵🇱" },
  { code: "pt", name: "Portuguese", flag: "🇵🇹" },
  { code: "ro", name: "Romanian", flag: "🇷🇴" },
  { code: "ru", name: "Russian", flag: "🇷🇺" },
  { code: "sk", name: "Slovak", flag: "🇸🇰" },
  { code: "sl", name: "Slovenian", flag: "🇸🇮" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "ta", name: "Tamil", flag: "🇮🇳" },
  { code: "te", name: "Telugu", flag: "🇮🇳" },
  { code: "th", name: "Thai", flag: "🇹🇭" },
  { code: "tr", name: "Turkish", flag: "🇹🇷" },
  { code: "uk", name: "Ukrainian", flag: "🇺🇦" },
  { code: "vi", name: "Vietnamese", flag: "🇻🇳" },
];
const LanguageSeletor = ({
  selectedLanguage,
  recentTargetLanguages,
  handleLanguageChange,
  isLanguageLoading,
}: {
  selectedLanguage: string;
  recentTargetLanguages: string[];
  handleLanguageChange: (langCode: string) => void;
  isLanguageLoading: boolean;
}) => {
  return (
    <div className="language-selector">
      <label htmlFor="languageSelect" className="section-label">
        Translation Language
      </label>
      <div className="select-wrapper">
        <select
          id="languageSelect"
          className="language-select"
          value={selectedLanguage}
          onChange={(e) => handleLanguageChange(e.target.value)}
          disabled={isLanguageLoading}
        >
          {recentTargetLanguages.length > 0 && (
            <optgroup label="Recent Languages">
              {LANGUAGES.filter((lang) =>
                recentTargetLanguages.includes(lang.code)
              ).map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="All Languages">
            {LANGUAGES.filter(
              (lang) => !recentTargetLanguages.includes(lang.code)
            ).map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.flag} {lang.name}
              </option>
            ))}
          </optgroup>
        </select>
        {isLanguageLoading && (
          <div className="loading-spinner">
            <div className="spinner"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LanguageSeletor;
