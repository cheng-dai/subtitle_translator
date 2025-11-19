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
const LanguageSelector = ({
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
    <div className="flex flex-col gap-2">
      <label htmlFor="languageSelect" className="text-gray-800 text-xs font-semibold">
        Translation Language
      </label>
      <div className="relative">
        <select
          id="languageSelect"
          className="text-gray-800 cursor-pointer appearance-none bg-white bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27currentColor%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3e%3cpolyline%20points=%276,9%2012,15%2018,9%27%3e%3c/polyline%3e%3c/svg%3e')] bg-[right_10px_center] bg-[length:14px] bg-no-repeat border border-gray-200 rounded-md w-full py-2 pl-3 pr-8 text-xs transition-all hover:bg-blue-50 hover:border-blue-500 focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(33,150,243,0.1)] disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-100"
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
          <div className="absolute top-1/2 right-3 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LanguageSelector;
