import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import LanguageSeletor from "./components/LanguageSeletor";
import "./popup.css";

interface SubtitleOption {
  url: string;
  label: string;
}

interface VideoStatus {
  text: string;
}

const Popup = () => {
  const [recentTargetLanguages, setRecentTargetLanguages] = useState<string[]>(
    []
  );
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [subtitleOptions, setSubtitleOptions] = useState<SubtitleOption[]>([]);
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [isLanguageLoading, setIsLanguageLoading] = useState(false);
  const [videoStatus, setVideoStatus] = useState<VideoStatus>({
    text: "",
  });
  const [showSubtitleSelect, setShowSubtitleSelect] = useState(false);
  const [fontScale, setFontScale] = useState(1);

  // Load saved state on component mount
  useEffect(() => {
    // First load the global settings
    chrome.storage.local.get(
      ["subtitlesEnabled", "recentTargetLanguages", "selectedSubtitleIndex"],
      (result) => {
        const enabled = result.subtitlesEnabled || false;
        setSubtitlesEnabled(enabled);
        setRecentTargetLanguages(result.recentTargetLanguages || []);
        setSelectedSubtitleIndex(result.selectedSubtitleIndex || 0);

        // Then get the current tab's specific language
        chrome.runtime.sendMessage(
          { action: "getCurrentTabLanguage" },
          (response) => {
            if (response && response.success) {
              setSelectedLanguage(response.language);
              console.log("Loaded current tab language:", response.language);
            } else {
              // Fallback to global default
              chrome.storage.local.get(["targetLanguage"], (globalResult) => {
                setSelectedLanguage(globalResult.targetLanguage || "en");
              });
            }
          }
        );

        if (enabled) {
          checkVideoAndLoadOptions();
        }
      }
    );
  }, []);
  const checkVideoAndLoadOptions = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0]?.id || 0,
        { action: "initialCheck" },
        (response) => {
          if (response && response.videoDetected) {
            loadSubtitleOptions();
          } else if (response && !response.videoDetected) {
            setVideoStatus({ text: "No video detected" });
          } else {
            setVideoStatus({ text: "Unknown" });
          }
        }
      );
    });
  };

  const loadSubtitleOptions = () => {
    console.log("Loading subtitle options...");

    // Set a timeout to prevent hanging
    const timeout = setTimeout(() => {
      setVideoStatus({
        text: "Loading subtitles timed out",
      });
      setShowSubtitleSelect(false);
    }, 10000); // 10 second timeout

    chrome.runtime.sendMessage({ action: "videoFound" }, (response) => {
      clearTimeout(timeout); // Clear timeout when we get a response
      if (chrome.runtime.lastError) {
        console.error(
          "Error loading subtitle options:",
          chrome.runtime.lastError
        );
        setVideoStatus({
          text: "Error loading subtitles",
        });
        setShowSubtitleSelect(false);
        return;
      }

      if (
        response &&
        response.subtitleOptions &&
        response.subtitleOptions.length > 0
      ) {
        setSubtitleOptions(response.subtitleOptions);
        setShowSubtitleSelect(true);
      } else if (response && response.error) {
        setVideoStatus({
          text:
            response.error === "Translator not available"
              ? "Translation service not available"
              : "Error loading subtitles",
        });
        setShowSubtitleSelect(false);
      } else {
        setVideoStatus({
          text: "No subtitles available for this video",
        });
        setShowSubtitleSelect(false);
      }
    });
  };

  const handleSubtitleToggle = (enabled: boolean) => {
    setSubtitlesEnabled(enabled);
    chrome.storage.local.set({ subtitlesEnabled: enabled });

    if (enabled) {
      checkVideoAndLoadOptions();
    } else {
      setShowSubtitleSelect(false);
      setVideoStatus({ text: "" });
    }

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0]?.id || 0, {
        action: "toggleSubtitles",
        enabled: enabled,
      });
    });
  };

  const handleSubtitleChange = (subtitleUrl: string, selectedIndex: number) => {
    setSelectedSubtitleIndex(selectedIndex);

    if (!subtitleUrl) {
      console.error("No subtitle selected - selectedSubtitle is empty or null");
      return;
    }

    // Save selectionIndex
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      try {
        chrome.storage.local.set({ selectedSubtitleIndex: selectedIndex });
      } catch (error) {
        console.error("Error saving selected subtitle:", error);
      }

      // Update status to show loading
      setVideoStatus({ text: "Updating subtitles..." });

      // Send message to content script to update subtitle
      chrome.tabs.sendMessage(
        tabs[0]?.id || 0,
        {
          action: "updateSubtitleTrack",
          subtitleUrl: subtitleUrl,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error updating subtitle track:",
              chrome.runtime.lastError
            );
            setVideoStatus({
              text: "Error updating subtitles",
            });
            return;
          }

          if (response && response.success) {
            setVideoStatus({
              text: "Subtitles updated successfully",
            });
            // Close popup after showing success message
            setTimeout(() => {
              window.close();
            }, 1500); // Close after 1.5 seconds of showing success message
          } else {
            setVideoStatus({
              text: "Failed to update subtitles",
            });
            console.error("Subtitle update failed:", response?.error);
            // Close popup even on error after showing error message
            setTimeout(() => {
              window.close();
            }, 2000); // Close after 2 seconds of showing error message
          }
        }
      );
    });
  };
  const handleFontScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fontScale = parseFloat(e.target.value);
    setFontScale(fontScale);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0]?.id || 0, {
        action: "updateFontScale",
        fontScale: fontScale,
      });
    });
  };

  const handleLanguageChange = (langCode: string) => {
    setSelectedLanguage(langCode);
    setRecentTargetLanguages(
      [...recentTargetLanguages, langCode].reverse().slice(0, 3)
    );
    setIsLanguageLoading(true);

    // Show loading status
    setVideoStatus({
      text: "Loading language model...",
    });

    // Send direct message to content script for immediate loading indicator
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id && tabs[0].url?.includes("svtplay.se")) {
        chrome.tabs
          .sendMessage(tabs[0].id, {
            action: "languageChanging",
            newLanguage: langCode,
          })
          .catch((error) => {
            console.log(
              "Could not send language changing message to content script:",
              error
            );
          });
      }
    });

    // Save to storage (keep global for new tabs, but also save per-tab)
    chrome.storage.local.set({ targetLanguage: langCode });
    chrome.storage.local.set({ recentTargetLanguages: recentTargetLanguages });

    // Send message to background script to update language for CURRENT TAB ONLY
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.runtime.sendMessage({
          action: "targetLanguageForTab",
          targetLanguage: langCode,
          tabId: tabs[0].id,
        });
      }
    });

    // Set a timeout to reset loading state and close popup
    setTimeout(() => {
      setIsLanguageLoading(false);
      setVideoStatus({
        text: "Language changed successfully",
      });
      // Close popup after showing success message
      setTimeout(() => {
        window.close();
      }, 1500); // Close after 1.5 seconds of showing success message
    }, 2000); // 2 second timeout
  };

  return (
    <div id="popup">
      <div className="popup-content">
        <div className="status-message">
          {videoStatus.text && <> {videoStatus.text}</>}
        </div>

        <div className="flex flex-col gap-2 pb-8 ">
          {/* main toggle */}
          <div className="w-full rounded-md p-2 text-lg">
            <div className="flex w-full  justify-between items-center gap-2">
              <div className="flex flex-col">
                <span className="font-bold ">Translate</span>
              </div>
              <label className="relative w-10 h-5">
                <input
                  type="checkbox"
                  checked={subtitlesEnabled}
                  onChange={(e) => handleSubtitleToggle(e.target.checked)}
                  className="w-0 h-0 opacity-0"
                />
                <span className="slider round w-10 h-5 bg-gray-300 rounded-full"></span>
              </label>
            </div>
          </div>
          {showSubtitleSelect && (
            <div className="flex flex-col gap-2 language-section">
              <label htmlFor="subtitleSelect" className="section-label">
                Select subtitle track
              </label>
              <select
                id="subtitleSelect"
                className="subtitle-select"
                value={subtitleOptions[selectedSubtitleIndex]?.url}
                onChange={(e) =>
                  handleSubtitleChange(e.target.value, e.target.selectedIndex)
                }
              >
                {subtitleOptions.length > 0 ? (
                  subtitleOptions.map((option) => (
                    <option key={option.url} value={option.url}>
                      {option.label}
                    </option>
                  ))
                ) : (
                  <option value="">Loading...</option>
                )}
              </select>
            </div>
          )}

          {subtitlesEnabled && (
            <>
              <div>
                <LanguageSeletor
                  selectedLanguage={selectedLanguage}
                  handleLanguageChange={handleLanguageChange}
                  isLanguageLoading={isLanguageLoading}
                  recentTargetLanguages={recentTargetLanguages}
                />
              </div>
              <div className="flex flex-row items-center gap-2 justify-between">
                <label htmlFor="fontSize" className="section-label">
                  Font Size
                </label>
                <input
                  type="range"
                  id="fontSize"
                  value={fontScale}
                  min={0.5}
                  max={3}
                  step={0.1}
                  onChange={(e) => handleFontScaleChange(e)}
                />
              </div>
            </>
          )}
        </div>
        {/* support developer button */}
        <div className="flex justify-end w-full absolute bottom-2 right-2  ">
          <a
            href="https://buymeacoffee.com/chengdai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs border-2 border-blue-300 rounded-md px-2 py-1 hover:bg-blue-500 hover:text-white transition-all duration-300"
          >
            Support ♥️
          </a>
        </div>
      </div>
    </div>
  );
};

// Initialize the React app
const container = document.getElementById("popup");
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}
