import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import LanguageSelector from "@/components/LanguageSelector";
import "./popup.css";
import { Button } from "@/components/ui/button";

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
  const [selectedSubtitleOption, setSelectedSubtitleOption] =
    useState("closed");
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
    (async () => {
      const savedSettings = await chrome.storage.local.get([
        "subtitlesEnabled",
        "recentTargetLanguages",
        "selectedSubtitleOption",
        "targetLanguage",
      ]);
      const enabled = savedSettings.subtitlesEnabled ?? false;
      setSubtitlesEnabled(enabled as boolean);
      setRecentTargetLanguages(
        (savedSettings.recentTargetLanguages as string[]) ?? []
      );
      setSelectedSubtitleOption(
        (savedSettings.selectedSubtitleOption as string) ?? "closed"
      );
      setSelectedLanguage((savedSettings.targetLanguage as string) ?? "en");
      if (enabled) {
        checkVideoAndLoadOptions();
      }
    })();
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

  const handleSubtitleChange = (
    subtitleUrl: string,
    selectedOption: string
  ) => {
    setSelectedSubtitleOption(selectedOption);

    if (!subtitleUrl) {
      console.error("No subtitle selected - selectedSubtitle is empty or null");
      return;
    }

    // Save selectionIndex
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      try {
        chrome.storage.local.set({ selectedSubtitleOption: selectedOption });
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
  const handleAILearning = () => {
    console.log("AI Learning");
    chrome.runtime.sendMessage({
      action: "aiLearning",
    });
  };
  const handleLanguageChange = (langCode: string) => {
    setSelectedLanguage(langCode);
    chrome.storage.local.set({ targetLanguage: langCode });
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

    // Send message to background script to update language
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.runtime.sendMessage({
          action: "changeTargetLanguage",
          newLanguage: langCode,
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
      }, 1000); // Close after 1 second of showing success message
    }, 2000); // 2 second timeout
  };

  return (
    <div className="overflow-hidden bg-white rounded-lg w-[280px] min-h-[280px] font-sans shadow-[0_4px_16px_rgba(0,0,0,0.1)]">
      <div className="p-3.5">
        {/* Status Message */}
        {videoStatus.text && (
          <div className="mb-3 text-xs font-medium px-3 py-1 rounded">
            {videoStatus.text}
          </div>
        )}

        <div className="flex flex-col gap-2 pb-8">
          {/* Main toggle */}
          <div className="bg-gray-50 border border-gray-200 rounded-md p-2.5">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex flex-col gap-1">
                <span className="text-gray-800 text-sm font-semibold">
                  Enable Subtitles
                </span>
              </div>
              <label className="relative inline-block w-11 h-6">
                <input
                  type="checkbox"
                  checked={subtitlesEnabled}
                  onChange={(e) => handleSubtitleToggle(e.target.checked)}
                  className="w-0 h-0 opacity-0"
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>
          {/* TODO: Add AI learning section */}
          {/* AI learning section */}
          {/* <div className="bg-gray-50 border border-gray-200 rounded-md p-2.5">
            <div className="flex items-center justify-between gap-2.5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleAILearning}
              >
                AI Learning
              </Button>
            </div>
          </div> */}

          {/* Subtitle track selector */}
          {showSubtitleSelect && (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-2.5">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="subtitleSelect"
                  className="text-gray-800 text-xs font-semibold"
                >
                  Select subtitle track
                </label>
                <select
                  id="subtitleSelect"
                  className="text-gray-800 cursor-pointer bg-white border border-gray-200 rounded-md w-full px-3 py-2 text-xs transition-all hover:bg-blue-50 hover:border-blue-500 focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(33,150,243,0.1)]"
                  value={
                    subtitleOptions.filter((option) =>
                      option.url.includes(selectedSubtitleOption)
                    )[0]?.url
                  }
                  onChange={(e) =>
                    handleSubtitleChange(e.target.value, e.target.value)
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
            </div>
          )}

          {/* Language selector and font size */}
          {subtitlesEnabled && (
            <>
              <div className="bg-gray-50 border border-gray-200 rounded-md p-2.5">
                <LanguageSelector
                  selectedLanguage={selectedLanguage}
                  handleLanguageChange={handleLanguageChange}
                  isLanguageLoading={isLanguageLoading}
                  recentTargetLanguages={recentTargetLanguages}
                />
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-md p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="fontSize"
                    className="text-gray-800 text-xs font-semibold"
                  >
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
                    className="flex-1 max-w-[140px]"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Support developer button */}
        <div className="flex justify-end w-full absolute bottom-2 right-2">
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
