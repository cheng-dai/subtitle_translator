// Check if Translator API is supported
// Per-tab data storage to handle multiple video tabs independently
const tabSubtitles = new Map(); // tabId -> subtitles array
const tabSubtitleCache = new Map(); // tabId -> cache object
const tabCurrentVideoId = new Map(); // tabId -> videoId
const tabTranslator = new Map(); // tabId -> translator instance
const tabTargetLanguage = new Map(); // tabId -> target language
const tabLanguageVersion = new Map(); // tabId -> language version
const tabSubtitleUrls = new Map(); // tabId -> subtitle url

// Global state for language management
let globalTargetLanguage = null;
let isLanguageChanging = false;
const MAX_CACHE_SIZE = 1000; // Maximum number of cached entries
console.log("globalTargetLanguage", globalTargetLanguage);

// Helper function to get or create tab data
async function getTabData(tabId) {
  if (!tabSubtitles.has(tabId)) {
    const stored = await chrome.storage.session.get([
      `tab_${tabId}_videoId`,
      `tab_${tabId}_targetLanguage`,
      `tab_${tabId}_languageVersion`,
      `tab_${tabId}_subtitleUrl`,
    ]);
    if (stored[`tab_${tabId}_videoId`]) {
      // Restore the state
      tabCurrentVideoId.set(tabId, stored[`tab_${tabId}_videoId`]);
      tabTargetLanguage.set(
        tabId,
        stored[`tab_${tabId}_targetLanguage`] || "en"
      );
      tabLanguageVersion.set(
        tabId,
        stored[`tab_${tabId}_languageVersion`] || 0
      );
      tabSubtitles.set(tabId, []);
      tabSubtitleCache.set(tabId, {});
      tabSubtitleUrls.set(tabId, stored[`tab_${tabId}_subtitleUrl`]);
    } else {
      console.log("Creating new tab data for tab:", tabId);
      tabSubtitles.set(tabId, []);
      tabSubtitleCache.set(tabId, {});
      tabCurrentVideoId.set(tabId, null);
      tabTargetLanguage.set(tabId, globalTargetLanguage || "en");
      tabLanguageVersion.set(tabId, 0);
      tabSubtitleUrls.set(tabId, null);
    }
    await persistTabData(tabId);
  }
  return {
    subtitles: tabSubtitles.get(tabId),
    cache: tabSubtitleCache.get(tabId),
    videoId: tabCurrentVideoId.get(tabId),
    targetLanguage: tabTargetLanguage.get(tabId),
    languageVersion: tabLanguageVersion.get(tabId),
    subtitleUrl: tabSubtitleUrls.get(tabId),
  };
}

// Helper function to update tab data
async function updateTabData(tabId, updates) {
  if (updates.subtitles !== undefined)
    tabSubtitles.set(tabId, updates.subtitles);
  if (updates.cache !== undefined) tabSubtitleCache.set(tabId, updates.cache);
  if (updates.videoId !== undefined)
    tabCurrentVideoId.set(tabId, updates.videoId);
  if (updates.targetLanguage !== undefined)
    tabTargetLanguage.set(tabId, updates.targetLanguage);
  if (updates.languageVersion !== undefined)
    tabLanguageVersion.set(tabId, updates.languageVersion);
  if (updates.subtitleUrl !== undefined)
    tabSubtitleUrls.set(tabId, updates.subtitleUrl);
  await persistTabData(tabId);
}

// Function to clean up cache if it gets too large
async function cleanupCache(tabId) {
  const tabData = await getTabData(tabId);
  const cacheKeys = Object.keys(tabData.cache);
  if (cacheKeys.length > MAX_CACHE_SIZE) {
    // Remove oldest entries (keep the most recent 500)
    const keysToRemove = cacheKeys.slice(0, cacheKeys.length - 500);
    keysToRemove.forEach((key) => {
      delete tabData.cache[key];
    });
    await updateTabData(tabId, { cache: tabData.cache });
  }
}

async function initTranslator(
  tabId,
  forceLanguage = null,
  forceRecreate = false
) {
  const tabData = await getTabData(tabId);

  // If forceLanguage is provided, use it; otherwise use tab's current language or global default
  if (forceLanguage) {
    tabData.targetLanguage = forceLanguage;
  } else if (tabData.targetLanguage) {
    // Use the tab's existing language
    console.log("Using existing tab language:", tabData.targetLanguage);
  } else {
    // Fall back to global default for new tabs
    const stored = await chrome.storage.local.get("targetLanguage");
    tabData.targetLanguage =
      stored.targetLanguage || globalTargetLanguage || "en";
  }
  console.log("tabId", tabId, "targetLanguage", tabData.targetLanguage);

  // If translator exists and we're not forcing recreation, check if language matches
  const existingTranslator = tabTranslator.get(tabId);
  if (existingTranslator && !forceRecreate) {
    // Check if the translator is already using the correct language
    if (existingTranslator.targetLanguage === tabData.targetLanguage) {
      return true;
    }
  }

  // Recreate translator if it doesn't exist, or if we're forcing recreation, or if language doesn't match
  try {
    if (!("Translator" in self)) {
      console.error("Translator API not available");
      return false;
    }

    const translator = await Translator.create({
      sourceLanguage: "sv",
      targetLanguage: tabData.targetLanguage,
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          console.log("Download progress:", e);
        });
      },
    });

    tabTranslator.set(tabId, translator);
    await updateTabData(tabId, { targetLanguage: tabData.targetLanguage });
    console.log(
      "Translator created/recreated for tab",
      tabId,
      "with language:",
      tabData.targetLanguage
    );
    return true;
  } catch (error) {
    console.error("Error creating/recreating translator:", error);
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
  const subtitles = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
      .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        ""
      )
      .trim();
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
  console.log("subtitles after parsing", subtitles);

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
async function translateText(tabId, text) {
  const tabData = await getTabData(tabId);
  const translator = tabTranslator.get(tabId);

  console.log(
    "translating text",
    text,
    "with translator:",
    translator,
    "targetLanguage:",
    tabData.targetLanguage
  );
  try {
    // Clean the text first to remove any HTML-like tags
    const cleanedText = await cleanSubtitleText(text);

    if (!cleanedText) {
      return text; // Return original if cleaning resulted in empty text
    }

    if (!translator) {
      console.error("Translator not initialized for tab", tabId);
      return text;
    }

    const result = await translator.translate(cleanedText);
    console.log("Translation result:", result);
    return result;
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
    console.log("raw vtt data", data);
    // Get the first subtitle reference (usually Swedish)

    if (!data) {
      console.error("No subtitle reference found for video:", subtitleUrl);
      return null;
    }

    const originalSubtitles = parseWebVTT(data);
    console.log("originalSubtitles after parsing", originalSubtitles);

    return originalSubtitles;
  } catch (error) {
    console.error("Error fetching subtitles:", error);
    return null;
  }
}

// Prefetch next N subtitles
async function prefetchNextSubtitles(tabId, currentIndex, subtitles, count) {
  const tabData = await getTabData(tabId);
  if (!tabData.videoId) return;

  for (let i = 1; i <= count; i++) {
    const nextIndex = currentIndex + i;
    const cacheKey = `${tabData.videoId}:${nextIndex}:${tabData.languageVersion}`;

    if (
      nextIndex < subtitles.length &&
      !tabData.cache[cacheKey] &&
      subtitles[nextIndex].text
    ) {
      // Fire and forget
      translateText(tabId, subtitles[nextIndex].text).then(
        async (translatedText) => {
          tabData.cache[cacheKey] = {
            translatedText: translatedText,
            timestamp: Date.now(),
          };
          await updateTabData(tabId, { cache: tabData.cache });
        }
      );
    }
  }
}

// Function to get subtitle for current time, with caching and prefetching
async function getSubtitleForTime(tabId, time, subtitles) {
  const tabData = await getTabData(tabId);
  console.log("subtitles", subtitles, "time", time);
  console.log(
    "getting subtitle for time",
    time,
    "currentVideoId",
    tabData.videoId
  );
  if (!tabData.videoId) return null;

  // Find the subtitle that matches the current time
  const subtitleIndex = subtitles.findIndex((sub) => {
    return time + 0.5 >= sub.startTime && time <= sub.endTime;
  });
  console.log("subtitleIndex", subtitleIndex);
  if (subtitleIndex === -1) return null;
  const subtitle = subtitles[subtitleIndex];

  const cacheKey = `${tabData.videoId}:${subtitleIndex}:${tabData.languageVersion}`;

  // Check cache first, but force re-translation if language is changing
  if (tabData.cache[cacheKey] && !isLanguageChanging) {
    const cacheEntry = tabData.cache[cacheKey];
    // Pre-translate next subtitles in the background
    await prefetchNextSubtitles(tabId, subtitleIndex, subtitles, 2);
    return {
      translatedText: cacheEntry.translatedText || cacheEntry,
    };
  }

  // Not cached, translate and cache
  try {
    const translatedText = await translateText(tabId, subtitle.text);
    console.log("translated text", translatedText);
    // Store with timestamp for cache invalidation
    tabData.cache[cacheKey] = {
      translatedText: translatedText,
      timestamp: Date.now(),
    };
    await updateTabData(tabId, { cache: tabData.cache });

    // Clean up cache if it gets too large
    await cleanupCache(tabId);

    // Pre-translate next subtitles in the background
    await prefetchNextSubtitles(tabId, subtitleIndex, subtitles, 2);

    return {
      translatedText: translatedText,
    };
  } catch (error) {
    console.error("Error translating subtitle:", error);
    return null;
  }
}

// Helper function to get tab ID from sender
async function getTabIdFromSender(sender, request) {
  // If sender has a tab ID, use it (content script)
  if (sender.tab?.id) {
    console.log(
      "Using tab ID from sender:",
      sender.tab.id,
      "for action:",
      request.action
    );
    return sender.tab.id;
  }

  // If no sender tab (popup or other contexts), try to get current active tab
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs.length > 0) {
      console.log(
        "Using current active tab ID:",
        tabs[0].id,
        "for action:",
        request.action
      );
      return tabs[0].id;
    }
  } catch (error) {
    console.error("Error getting current tab:", error);
  }

  // If we still don't have a tab ID, return null
  console.warn(
    "No tab ID available for action:",
    request.action,
    "sender:",
    sender
  );
  return null;
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Get tab ID asynchronously
  (async () => {
    const tabId = await getTabIdFromSender(sender, request);

    // Some actions don't require a tab ID (like global language changes)
    const actionsWithoutTabId = ["targetLanguage"];
    if (!tabId && !actionsWithoutTabId.includes(request.action)) {
      console.error("No tab ID available for message:", request.action);
      sendResponse({ error: "No tab ID available" });
      return;
    }

    if (request.action === "fetchSubtitleOptions") {
      let videoId = null;

      if (sender.tab && sender.tab.url) {
        videoId = getVideoIdFromUrl(sender.tab.url);
        tabCurrentVideoId.set(tabId, videoId);
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
        return;
      }
      const subtitleOptions = await fetchSubtitleOptions(videoId);
      sendResponse({ subtitleOptions: subtitleOptions });
      return;
    }
    if (request.action === "getSavedSubtitleSelection") {
      try {
        const videoId = request.videoId;

        const storageKey = `selectedSubtitle_${videoId}`;
        const result = await chrome.storage.session.get([storageKey]);

        sendResponse({ selectedSubtitle: result[storageKey] || null });
      } catch (error) {
        console.error("Error getting saved subtitle selection:", error);
        sendResponse({ selectedSubtitle: null });
      }
      return;
    }
    if (request.action === "loadSubtitle") {
      try {
        // Get video ID from the current tab, handling cases where sender.tab might be undefined
        let videoId = null;

        if (sender.tab && sender.tab.url) {
          videoId = getVideoIdFromUrl(sender.tab.url);
          tabCurrentVideoId.set(tabId, videoId);
        } else {
          // If no sender tab URL, get current active tab
          try {
            const tabs = await chrome.tabs.query({
              active: true,
              currentWindow: true,
            });
            if (tabs.length > 0) {
              videoId = getVideoIdFromUrl(tabs[0].url);
              tabCurrentVideoId.set(tabId, videoId);
            }
          } catch (error) {
            console.error("Error getting current tab:", error);
          }
        }

        const tabData = await getTabData(tabId);
        if (videoId !== tabData.videoId) {
          // Clear cache when switching to a different video or subtitle track
          await updateTabData(tabId, {
            cache: {},
            videoId: videoId,
            subtitles: [],
            subtitleUrl: request.subtitleUrl,
          });
        }

        const translatorReady = await initTranslator(tabId);

        if (!translatorReady) {
          console.error("Translator not available for tab", tabId);
          sendResponse({ loaded: false, error: "Translator not available" });
          return;
        }

        if (!request.subtitleUrl) {
          console.error("ERROR: subtitleUrl is null or undefined!");
          sendResponse({ loaded: false, error: "No subtitle URL provided" });
          return;
        }

        console.log("Loading subtitles from:", request.subtitleUrl);
        const subtitles = (await fetchSubtitle(request.subtitleUrl)) || [];
        console.log("Subtitles loaded:", subtitles.length, "entries");

        await updateTabData(tabId, {
          subtitles: subtitles,
          subtitleUrl: request.subtitleUrl,
        });

        if (subtitles.length === 0) {
          sendResponse({ loaded: false, error: "No subtitles found" });
          return;
        }

        sendResponse({ loaded: true, subtitleCount: subtitles.length });
      } catch (error) {
        console.error("Error in loadSubtitle:", error);
        sendResponse({ loaded: false, error: error.message });
      }
      return;
    }
    if (request.action === "getCurrentSubtitle") {
      console.log("get getCurrentSubtitle request", request);
      const tabData = await getTabData(tabId);
      const subtitleUrl = tabSubtitleUrls.get(tabId);
      if (!tabData.subtitles || tabData.subtitles.length === 0) {
        console.log(
          "tabData.subtitles is empty, fetching subtitle",
          subtitleUrl
        );
        const subtitles = await fetchSubtitle(subtitleUrl);
        await updateTabData(tabId, {
          subtitles: subtitles,
          subtitleUrl: subtitleUrl,
        });
      }

      const subtitle = await getSubtitleForTime(
        tabId,
        request.time,
        tabData.subtitles
      );
      console.log("subtitle for time", request.time, subtitle);

      sendResponse(subtitle);
      return;
    }
  })();
  return true; // Keep the listener alive for async response
});

// Helper function to extract video ID from URL
function getVideoIdFromUrl(url) {
  // Extract video ID from SVT Play URL
  const match = url.match(/\/video\/([^/?]+)/);
  return match ? match[1] : null;
}

// Check if this is the first run and open options page
// chrome.runtime.onInstalled.addListener((details) => {
//   if (details.reason === "install") {
//     // First time installation - open options page
//     chrome.runtime.openOptionsPage();
//   }
// });

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log("Cleaning up data for closed tab:", tabId);
  tabSubtitles.delete(tabId);
  tabSubtitleCache.delete(tabId);
  tabCurrentVideoId.delete(tabId);
  tabTranslator.delete(tabId);
  tabTargetLanguage.delete(tabId);
  tabLanguageVersion.delete(tabId);
  tabSubtitleUrls.delete(tabId);
});

async function persistTabData(tabId) {
  const tabData = await getTabData(tabId);
  await chrome.storage.session.set({
    [`tab_${tabId}_subtitleUrl`]: tabData.subtitleUrl,
    [`tab_${tabId}_videoId`]: tabData.videoId,
    [`tab_${tabId}_targetLanguage`]: tabData.targetLanguage,
    [`tab_${tabId}_languageVersion`]: tabData.languageVersion,
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Get tab ID asynchronously
  (async () => {
    const tabId = await getTabIdFromSender(sender, request);
    if (!tabId) {
      console.error("No tab ID available for message:", request.action);
      sendResponse({ error: "No tab ID available" });
      return;
    }

    if (request.action === "videoFound") {
      let videoId;

      // If sender has a tab URL, use it (content script)
      if (sender.tab && sender.tab.url) {
        videoId = getVideoIdFromUrl(sender.tab.url);
        console.log("videoId from sender.tab.url", videoId);
      } else {
        // If no sender tab URL (popup), get current active tab
        try {
          const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (tabs.length > 0) {
            videoId = getVideoIdFromUrl(tabs[0].url);
            console.log("videoId from tabs[0].url", videoId);
          }
        } catch (error) {
          console.error("Error getting current tab:", error);
        }
      }

      if (!videoId) {
        sendResponse({ subtitleOptions: [] });
        return;
      }

      console.log("Initializing translator for videoFound...");
      const translatorInitialized = await initTranslator(tabId);
      console.log("Translator initialized:", translatorInitialized);
      if (!translatorInitialized) {
        console.error("Failed to initialize translator for tab", tabId);
        sendResponse({
          subtitleOptions: [],
          error: "Translator not available",
        });
        return;
      }

      const subtitleOptions = await fetchSubtitleOptions(videoId);
      sendResponse({ subtitleOptions: subtitleOptions });
      return;
    }
    if (request.action === "videoNotFound") {
      sendResponse({ success: true });
      return;
    }
    if (request.action === "targetLanguageForTab") {
      // Update language for specific tab only
      const tabId = request.tabId;
      if (!tabId) {
        sendResponse({ success: false, error: "No tab ID provided" });
        return;
      }

      isLanguageChanging = true;
      const tabData = await getTabData(tabId);
      const newLanguageVersion = tabData.languageVersion + 1;

      // Clear subtitle cache for this tab when language changes
      await updateTabData(tabId, {
        cache: {},
        targetLanguage: request.targetLanguage,
        languageVersion: newLanguageVersion,
      });

      // Reinitialize translator with new language for this tab
      await initTranslator(tabId, request.targetLanguage, true);

      console.log(
        "Updated tab",
        tabId,
        "with new language:",
        request.targetLanguage
      );

      // Add a small delay to ensure translator is fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Notify the specific tab to refresh current subtitle
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: "refreshCurrentSubtitle",
        });
        console.log("Refresh message sent successfully to tab:", tabId);
      } catch (error) {
        console.log("Could not send refresh message to tab", tabId, ":", error);
      }

      // Reset the language changing flag after everything is complete
      isLanguageChanging = false;
      console.log(
        "Language change completed for tab",
        tabId,
        "language:",
        request.targetLanguage
      );
      sendResponse({ success: true });
      return;
    }
    if (request.action === "getCurrentTabLanguage") {
      // Get the current tab's language setting
      const tabData = await getTabData(tabId);
      sendResponse({
        success: true,
        language: tabData.targetLanguage,
        isGlobalDefault:
          !tabTargetLanguage.has(tabId) ||
          tabData.targetLanguage === globalTargetLanguage,
      });
      return;
    }
    if (request.action === "targetLanguage") {
      // This is now only used for setting the global default for NEW tabs
      globalTargetLanguage = request.targetLanguage;
      console.log(
        "Updated global target language for new tabs:",
        globalTargetLanguage
      );
      sendResponse({ success: true });
      return;
    }
  })();
  return true; // Keep the listener alive for async response
});
