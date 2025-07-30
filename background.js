// Check if Translator API is supported
let subtitles = [];
let translator;
let subtitleCache = {}; // Cache for translated subtitles, keyed by videoId:subtitleIndex
let currentVideoId = null; // Track current video ID
const MAX_CACHE_SIZE = 1000; // Maximum number of cached entries

// Function to clean up cache if it gets too large
function cleanupCache() {
  const cacheKeys = Object.keys(subtitleCache);
  if (cacheKeys.length > MAX_CACHE_SIZE) {
    // Remove oldest entries (keep the most recent 500)
    const keysToRemove = cacheKeys.slice(0, cacheKeys.length - 500);
    keysToRemove.forEach((key) => {
      delete subtitleCache[key];
    });
  }
}

async function initTranslator() {
  if (translator) {
    return true;
  }
  try {
    if (!("Translator" in self)) {
      return false;
    }

    translator = await Translator.create({
      sourceLanguage: "sv",
      targetLanguage: "en",
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          console.log("Download progress:", e);
        });
      },
    });
  } catch (error) {
    console.error("Error checking Translator API:", error);
    return false;
  }
}

// Function to parse WebVTT time to seconds
function parseWebVTTTime(timeStr) {
  const match = timeStr.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (match) {
    const [, hours, minutes, seconds, milliseconds] = match;
    return (
      parseInt(hours) * 3600 +
      parseInt(minutes) * 60 +
      parseInt(seconds) +
      parseInt(milliseconds) / 1000
    );
  }
  return 0;
}

// Function to parse WebVTT content
function parseWebVTT(vttContent) {
  const lines = vttContent.split("\n");
  let currentSubtitle = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip WebVTT header, empty lines, and UUID strings
    if (
      line === "WEBVTT" ||
      line === "" ||
      line.startsWith("NOTE") ||
      /^[a-f0-9]{32}$/.test(line)
    ) {
      continue;
    }

    // Parse timestamp line
    const timeMatch = line.match(
      /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/
    );
    if (timeMatch) {
      if (currentSubtitle) {
        subtitles.push(currentSubtitle);
      }
      currentSubtitle = {
        startTime: parseWebVTTTime(timeMatch[1]),
        endTime: parseWebVTTTime(timeMatch[2]),
        text: "",
        translatedText: null,
      };
      continue;
    }

    // Add text to current subtitle
    if (currentSubtitle && line) {
      // Clean the line of HTML-like tags before adding it
      const cleanedLine = cleanSubtitleText(line);
      if (cleanedLine) {
        currentSubtitle.text += (currentSubtitle.text ? " " : "") + cleanedLine;
      }
    }
  }
  // Add the last subtitle
  if (currentSubtitle) {
    subtitles.push(currentSubtitle);
  }

  return subtitles;
}

// Function to clean HTML-like tags from subtitle text
function cleanSubtitleText(text) {
  if (!text) return text;
  console.log("text before cleaning", text);
  // Remove HTML-like tags (e.g., <c.teletext>, </c>, <i>, </i>, etc.)
  return text.replace(/<[^>]*>/g, "").trim();
}

// Function to translate text using Chrome's Translator API
async function translateText(text) {
  try {
    // Clean the text first to remove any HTML-like tags
    const cleanedText = cleanSubtitleText(text);

    if (!cleanedText) {
      return text; // Return original if cleaning resulted in empty text
    }

    return await translator.translate(cleanedText);
  } catch (error) {
    console.error("Error in translation:", error);
    return text; // Return original text if translation fails
  }
}

// Helper function to format time for VTT
// function formatTime(seconds) {
//   const hours = Math.floor(seconds / 3600);
//   const minutes = Math.floor((seconds % 3600) / 60);
//   const secs = Math.floor(seconds % 60);
//   const ms = Math.floor((seconds % 1) * 1000);
//   return `${hours.toString().padStart(2, "0")}:${minutes
//     .toString()
//     .padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms
//     .toString()
//     .padStart(3, "0")}`;
// }

async function fetchSubtitleOptions(videoId) {
  const response = await fetch(`https://video.svt.se/video/${videoId}`);
  const data = await response.json();

  return data.subtitleReferences.filter((ref) => ref.language === "sv");
}

async function fetchSubtitle(subtitleUrl) {
  try {
    // Fetch video data from SVT API

    const response = await fetch(subtitleUrl);
    const data = await response.text();

    // Get the first subtitle reference (usually Swedish)

    if (!data) {
      console.error("No subtitle reference found for video:", subtitleUrl);
      return null;
    }

    const originalSubtitles = parseWebVTT(data);

    return originalSubtitles;
  } catch (error) {
    console.error("Error fetching subtitles:", error);
    return null;
  }
}

// Prefetch next N subtitles
function prefetchNextSubtitles(currentIndex, subtitles, count) {
  if (!currentVideoId) return;

  for (let i = 1; i <= count; i++) {
    const nextIndex = currentIndex + i;
    const cacheKey = `${currentVideoId}:${nextIndex}`;

    if (
      nextIndex < subtitles.length &&
      !subtitleCache[cacheKey] &&
      subtitles[nextIndex].text
    ) {
      // Fire and forget
      translateText(subtitles[nextIndex].text).then((translatedText) => {
        subtitleCache[cacheKey] = translatedText;
      });
    }
  }
}

// Function to get subtitle for current time, with caching and prefetching
async function getSubtitleForTime(time, subtitles) {
  if (!currentVideoId) return null;

  // Find the subtitle that matches the current time
  const subtitleIndex = subtitles.findIndex((sub) => {
    return time + 0.5 >= sub.startTime && time <= sub.endTime;
  });
  if (subtitleIndex === -1) return null;
  const subtitle = subtitles[subtitleIndex];

  const cacheKey = `${currentVideoId}:${subtitleIndex}`;

  // Check cache first
  if (subtitleCache[cacheKey]) {
    // Pre-translate next subtitles in the background
    prefetchNextSubtitles(subtitleIndex, subtitles, 2);
    return {
      translatedText: subtitleCache[cacheKey],
    };
  }

  // Not cached, translate and cache
  try {
    const translatedText = await translateText(subtitle.text);
    subtitleCache[cacheKey] = translatedText;

    // Clean up cache if it gets too large
    cleanupCache();

    // Pre-translate next subtitles in the background
    prefetchNextSubtitles(subtitleIndex, subtitles, 2);

    return {
      translatedText: translatedText,
    };
  } catch (error) {
    console.error("Error translating subtitle:", error);
    return null;
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchSubtitleOptions") {
    (async () => {
      let videoId = null;

      if (sender.tab && sender.tab.url) {
        videoId = getVideoIdFromUrl(sender.tab.url);
      } else {
        // If no sender tab URL, get current active tab
        try {
          const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (tabs.length > 0) {
            videoId = getVideoIdFromUrl(tabs[0].url);
          }
        } catch (error) {
          console.error("Error getting current tab:", error);
        }
      }

      if (!videoId) {
        sendResponse({ subtitle: null });
        return true;
      }
      const subtitleOptions = await fetchSubtitleOptions(videoId);
      sendResponse({ subtitleOptions: subtitleOptions });
    })();
    return true;
  }
  if (request.action === "getSavedSubtitleSelection") {
    (async () => {
      try {
        const videoId = request.videoId;

        const storageKey = `selectedSubtitle_${videoId}`;
        const result = await chrome.storage.session.get([storageKey]);

        sendResponse({ selectedSubtitle: result[storageKey] || null });
      } catch (error) {
        console.error("Error getting saved subtitle selection:", error);
        sendResponse({ selectedSubtitle: null });
      }
    })();
    return true;
  }
  if (request.action === "loadSubtitle") {
    (async () => {
      try {
        // Get video ID from the current tab, handling cases where sender.tab might be undefined
        let videoId = null;

        if (sender.tab && sender.tab.url) {
          videoId = getVideoIdFromUrl(sender.tab.url);
        } else {
          // If no sender tab URL, get current active tab
          try {
            const tabs = await chrome.tabs.query({
              active: true,
              currentWindow: true,
            });
            if (tabs.length > 0) {
              videoId = getVideoIdFromUrl(tabs[0].url);
            }
          } catch (error) {
            console.error("Error getting current tab:", error);
          }
        }

        if (videoId !== currentVideoId) {
          // Clear cache when switching to a different video or subtitle track
          subtitleCache = {};
          currentVideoId = videoId;
        }

        subtitles = [];
        const translatorReady = await initTranslator();

        if (!translatorReady) {
          console.error("Translator not available");
          sendResponse({ loaded: false, error: "Translator not available" });
          return;
        }

        if (!request.subtitleUrl) {
          console.error("ERROR: subtitleUrl is null or undefined!");
          sendResponse({ loaded: false, error: "No subtitle URL provided" });
          return;
        }

        console.log("Loading subtitles from:", request.subtitleUrl);
        subtitles = (await fetchSubtitle(request.subtitleUrl)) || [];
        console.log("Subtitles loaded:", subtitles.length, "entries");

        if (subtitles.length === 0) {
          sendResponse({ loaded: false, error: "No subtitles found" });
          return;
        }

        sendResponse({ loaded: true, subtitleCount: subtitles.length });
      } catch (error) {
        console.error("Error in loadSubtitle:", error);
        sendResponse({ loaded: false, error: error.message });
      }
    })();
    return true;
  }
  if (request.action === "getCurrentSubtitle") {
    (async () => {
      const subtitle = await getSubtitleForTime(request.time, subtitles);

      sendResponse(subtitle);
    })();
    return true;
  }
});

// Helper function to extract video ID from URL
function getVideoIdFromUrl(url) {
  // Extract video ID from SVT Play URL
  const match = url.match(/\/video\/([^/?]+)/);
  return match ? match[1] : null;
}

// Clear cache when extension is unloaded
chrome.runtime.onSuspend.addListener(() => {
  subtitleCache = {};
  currentVideoId = null;
  subtitles = [];
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "videoFound") {
    (async () => {
      let videoId;

      // If sender has a tab URL, use it (content script)
      if (sender.tab && sender.tab.url) {
        videoId = getVideoIdFromUrl(sender.tab.url);
      } else {
        // If no sender tab URL (popup), get current active tab
        try {
          const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (tabs.length > 0) {
            videoId = getVideoIdFromUrl(tabs[0].url);
          }
        } catch (error) {
          console.error("Error getting current tab:", error);
        }
      }

      if (!videoId) {
        sendResponse({ subtitleOptions: [] });
        return;
      }

      await initTranslator();
      const subtitleOptions = await fetchSubtitleOptions(videoId);
      sendResponse({ subtitleOptions: subtitleOptions });
    })();
    return true;
  }
  if (request.action === "videoNotFound") {
    return true;
  }
});
