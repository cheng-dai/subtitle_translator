// Type definitions for Google Translate API
declare global {
  interface Translator {
    availability(options: {
      sourceLanguage: string;
      targetLanguage: string;
    }): Promise<"available" | "downloadable" | "unavailable">;
  }

  const Translator: Translator;
}

export {};
