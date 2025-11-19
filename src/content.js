let selectedSubtitle = null;
let currentVideoId = null;
let lastSubtitleTime = 0;
let subtitleRequestInProgress = false;
let subtitleInitializationInProgress = false; // Flag to prevent concurrent initializations
let currentVideo = null; // Store reference to current video
let currentSubtitleContainer = null; // Store reference to subtitle container
let timeUpdateHandler = null; // Store reference to time update handler
let videoObserver = null;
// Message listener for communication with popup and background script
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let dragTimeout = null;
let fontScale = 1;
chrome.storage.local.get(["fontScale"], (result) => {
  if (result.fontScale) {
    fontScale = result.fontScale;
  }
});

const detectVideoPage = () => {
  return /\/video\/[^/?]+/.test(window.location.href);
};

// Helper function to get video ID from URL
function getVideoIdFromUrl(url) {
  const match = url.match(/\/video\/([^/?]+)/);
  return match ? match[1] : null;
}
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === "initialCheck") {
      console.log("initialCheck is called");
      const video = document.querySelector("video");
      if (video) {
        console.log("Video found when initialCheck is called");
        sendResponse({ videoDetected: true });
        return true;
      } else {
        console.log("No video found immediately, attempting retry detection");
        sendResponse({ videoDetected: false });
        return true;
      }
    }
    if (request.action === "toggleSubtitles") {
      if (request.enabled) {
        // Enable subtitles
        initializeSubtitleSystem();

        sendResponse({ subtitlesEnabled: request.enabled });
        return true;
      } else {
        // Disable subtitles
        resetSubtitleSystem();
        sendResponse({ subtitlesEnabled: request.enabled });
        return true;
      }
    }
    if (request.action === "updateFontScale") {
      const fontScale = request.fontScale;
      console.log("Updating font scale to:", fontScale);
      const container = document.getElementById("svt-english-subtitles");
      if (container) {
        const { fontSize } = getResponsiveSubtitleStyles(fontScale);
        container.style.fontSize = `${fontSize}px`;
      }
      chrome.storage.local.set({ fontScale: fontScale });
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "updateSubtitleTrack") {
      const newSubtitleUrl = request.subtitleUrl;
      console.log("Updating subtitle track to:", newSubtitleUrl);

      // Reset subtitle system to clear old subtitle data
      resetSubtitleSystem();

      // Reinitialize immediately with the new subtitle URL
      (async () => {
        try {
          // Add a small delay to ensure cleanup is complete
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Wait for any ongoing initialization to complete
          while (subtitleInitializationInProgress) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }

          const success = await initializeSubtitleSystem(newSubtitleUrl);

          if (success) {
            // Ensure subtitles are visible if they should be
            const result = await chrome.storage.local.get(["subtitlesEnabled"]);
            if (result.subtitlesEnabled && currentSubtitleContainer) {
              currentSubtitleContainer.style.display = "block";
            }

            sendResponse({ success: true });
            return true;
          } else {
            console.error("Failed to reinitialize subtitle system");
            sendResponse({ success: false, error: "Failed to initialize" });
            return true;
          }
        } catch (error) {
          console.error("Error updating subtitle track:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    }
    if (request.action === "languageChanging") {
      // Show immediate loading indicator when language is changing
      console.log("Language changing to:", request.newLanguage);
      if (currentVideo && currentSubtitleContainer) {
        // Get language name from the language code
        const languageNames = {
          ar: "Arabic",
          bn: "Bengali",
          bg: "Bulgarian",
          "zh-cn": "Chinese",
          hr: "Croatian",
          cs: "Czech",
          da: "Danish",
          nl: "Dutch",
          en: "English",
          fi: "Finnish",
          fr: "French",
          de: "German",
          el: "Greek",
          he: "Hebrew",
          hi: "Hindi",
          hu: "Hungarian",
          id: "Indonesian",
          it: "Italian",
          ja: "Japanese",
          kn: "Kannada",
          ko: "Korean",
          lt: "Lithuanian",
          mr: "Marathi",
          no: "Norwegian",
          pl: "Polish",
          pt: "Portuguese",
          ro: "Romanian",
          ru: "Russian",
          sk: "Slovak",
          sl: "Slovenian",
          es: "Spanish",
          ta: "Tamil",
          te: "Telugu",
          th: "Thai",
          tr: "Turkish",
          uk: "Ukrainian",
          vi: "Vietnamese",
        };
        const languageName =
          languageNames[request.newLanguage] || request.newLanguage;

        // Show loading indicator immediately
        currentSubtitleContainer.style.display = "block";
        currentSubtitleContainer.className = ""; // Remove any existing classes
        currentSubtitleContainer.innerHTML = `
          <div id="language-loading-container" style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            background: transparent;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            pointer-events: none;
            animation: fadeInScale 0.3s ease-out;
          ">
            <div style="
              display: flex;
              align-items: center;
              gap: 12px;
            ">
              <div id="loading-spinner" style="
                width: 28px;
                height: 28px;
                border: 3px solid rgba(255, 255, 255, 0.3);
                border-top: 3px solid #ffffff;
                border-radius: 50%;
                animation: subtitle-spin 0.8s linear infinite;
              "></div>
              <div style="
                color: #ffffff;
                font-size: 18px;
                font-weight: 600;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                letter-spacing: 0.3px;
              ">Loading Translation Model</div>
            </div>
            <div style="
              color: rgba(255, 255, 255, 0.95);
              font-size: 15px;
              font-weight: 500;
              text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
              display: flex;
              align-items: center;
              gap: 8px;
            ">
              <span style="
                display: inline-block;
                width: 8px;
                height: 8px;
                background: #4CAF50;
                border-radius: 50%;
                box-shadow: 0 0 8px rgba(76, 175, 80, 0.8);
                animation: pulse 1.5s ease-in-out infinite;
              "></span>
              <span>Switching to <strong style="color: #ffffff; text-decoration: underline;">${languageName}</strong></span>
            </div>
            <div style="
              width: 100%;
              height: 3px;
              background: rgba(255, 255, 255, 0.2);
              border-radius: 2px;
              overflow: hidden;
              margin-top: 4px;
            ">
              <div id="progress-bar" style="
                width: 0%;
                height: 100%;
                background: linear-gradient(90deg, #4CAF50 0%, #8BC34A 100%);
                border-radius: 2px;
                animation: progressBar 2s ease-in-out forwards;
                box-shadow: 0 0 10px rgba(76, 175, 80, 0.6);
              "></div>
            </div>
          </div>
        `;

        // Add CSS animations
        if (!document.getElementById("subtitle-loading-styles")) {
          const style = document.createElement("style");
          style.id = "subtitle-loading-styles";
          style.textContent = `
            @keyframes subtitle-spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @keyframes fadeInScale {
              0% {
                opacity: 0;
                transform: scale(0.9);
              }
              100% {
                opacity: 1;
                transform: scale(1);
              }
            }
            @keyframes pulse {
              0%, 100% {
                opacity: 1;
                transform: scale(1);
              }
              50% {
                opacity: 0.6;
                transform: scale(1.2);
              }
            }
            @keyframes progressBar {
              0% { width: 0%; }
              50% { width: 70%; }
              100% { width: 100%; }
            }
          `;
          document.head.appendChild(style);
        }
      }
      return true;
    }
    if (request.action === "refreshCurrentSubtitle") {
      // Force immediate refresh of current subtitle
      console.log("refreshing current subtitle");
      if (currentVideo && currentSubtitleContainer && timeUpdateHandler) {
        // Just trigger the subtitle update - loading indicator already shown by languageChanging
        handleTimeUpdate(currentVideo, currentSubtitleContainer);
      }
      return true;
    }
  } catch (error) {
    console.error("Error in message listener:", error);
  }
});

// Helper function to safely send messages to background script
async function safeSendMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      // Check if chrome.runtime is available
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        reject(new Error("Chrome runtime not available"));
        return;
      }

      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          // Check for extension context invalidated error
          if (
            chrome.runtime.lastError.message?.includes(
              "Extension context invalidated"
            )
          ) {
            console.warn("Extension context invalidated");
            resetSubtitleSystem();
            reject(new Error("Extension context invalidated"));
            return;
          }
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Function to handle video time updates
function handleTimeUpdate(video, subtitleContainer) {
  const currentTime = video.currentTime;

  // Only update if we've moved to a new subtitle time and no request is in progress
  if (subtitleRequestInProgress) {
    return;
  }

  // Reduce the time threshold to be less restrictive
  if (Math.abs(currentTime - lastSubtitleTime) < 0.1) {
    return;
  }

  lastSubtitleTime = currentTime;
  subtitleRequestInProgress = true;

  // Send message to background script to get subtitle for current time
  (async () => {
    try {
      const response = await safeSendMessage({
        action: "getCurrentSubtitle",
        time: currentTime,
      });

      if (response && response.translatedText) {
        subtitleContainer.style.display = "block";
        subtitleContainer.textContent = response.translatedText;
      } else {
        if (!isDragging) {
          subtitleContainer.textContent = "";
          subtitleContainer.style.display = "none";
        } else {
          // Keep container visible with placeholder text during dragging
          subtitleContainer.textContent = "Drag to position";
          subtitleContainer.style.display = "block";
          // Optionally add a subtle background to make it more visible
          subtitleContainer.style.background = "rgba(0, 0, 0, 0.3)";
        }
      }

      // Debug logging
      if (currentTime % 5 < 0.1) {
        // Log every 5 seconds to avoid spam
        console.log("Subtitle update:", {
          time: currentTime,
          hasResponse: !!response,
          hasTranslation: !!(response && response.translatedText),
          containerVisible: subtitleContainer.style.display !== "none",
        });
      }
    } catch (error) {
      console.error("Error sending message in handleTimeUpdate:", error);

      // If it's a context invalidated error, the safeSendMessage already handled reset
      if (!error.message?.includes("Extension context invalidated")) {
        // For other errors, just log them
        console.warn("Subtitle update failed, will retry on next time update");
      }
    } finally {
      subtitleRequestInProgress = false;
    }
  })();
}

// Function to initialize subtitle system
async function initializeSubtitleSystem(subtitleUrl = null) {
  try {
    const video = document.querySelector("video");
    if (!video) {
      return false;
    }

    // Wait for video to be ready (has metadata and duration)
    if (!(await waitForVideoReady(video))) {
      console.log("Video not ready after waiting");
      return false;
    }
    currentVideoId = getVideoIdFromUrl(window.location.href);

    // Check if subtitles are already initialized
    const existingContainer = document.getElementById("svt-english-subtitles");
    if (existingContainer) {
      // Store references for existing container
      currentVideo = video;
      currentSubtitleContainer = existingContainer;

      // Reattach time update handler
      if (timeUpdateHandler) {
        video.removeEventListener("timeupdate", timeUpdateHandler);
      }
      timeUpdateHandler = () => handleTimeUpdate(video, existingContainer);
      video.addEventListener("timeupdate", timeUpdateHandler);

      return true;
    }

    // Double-check that no container exists (race condition protection)
    if (document.getElementById("svt-english-subtitles")) {
      console.log("Subtitle container already exists, skipping initialization");
      return true;
    }

    // Check for available subtitles before creating container
    try {
      const response = await safeSendMessage({
        action: "videoFound",
      });
      console.log("response in initializeSubtitleSystem", response);

      if (response.subtitleOptions.length === 0) {
        console.log(
          "No subtitles available, skipping container initialization"
        );
        return { noSubtitles: true };
      }

      // Only initialize container if subtitles are available
      const subtitleContainer = await initSubtitleContainer();

      video.parentElement.appendChild(subtitleContainer);

      // Store references
      currentVideo = video;
      currentSubtitleContainer = subtitleContainer;

      // Create and store the time update handler
      timeUpdateHandler = () => handleTimeUpdate(video, subtitleContainer);
      video.addEventListener("timeupdate", timeUpdateHandler);

      if (subtitleUrl) {
        selectedSubtitle = subtitleUrl;
        const loadResponse = await safeSendMessage({
          action: "loadSubtitle",
          subtitleUrl: selectedSubtitle,
        });

        if (!loadResponse || !loadResponse.loaded) {
          console.error("Failed to load subtitle:", loadResponse?.error);
          return false;
        }
      } else if (response.subtitleOptions.length > 0) {
        // Get current video ID and load saved subtitle selection for this video
        // const videoId = getVideoIdFromUrl(window.location.href);
        console.log(
          "Found more than one subtitle, please select a subtitle in the popup of the extension"
        );
        const savedSubtitleIndex = (
          await chrome.storage.local.get("selectedSubtitleIndex")
        ).selectedSubtitleIndex;
        console.log("savedSubtitleIndex", savedSubtitleIndex);
        if (response.subtitleOptions[savedSubtitleIndex]) {
          console.log("found saved index", response.subtitleOptions);
          selectedSubtitle = response.subtitleOptions[savedSubtitleIndex].url;
        } else {
          selectedSubtitle = response.subtitleOptions[0].url;
        }
        console.log("selectedSubtitle", selectedSubtitle);
        const loadResponse = await safeSendMessage({
          action: "loadSubtitle",
          subtitleUrl: selectedSubtitle,
        });
        if (!loadResponse || !loadResponse.loaded) {
          console.error("Failed to load subtitle:", loadResponse?.error);
          return false;
        }
        return true;
      }
    } catch (error) {
      console.error("Error communicating with background script:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in initializeSubtitleSystem:", error);
    return false;
  }
}

// Function to wait for video to be ready
async function waitForVideoReady(video, timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    function checkReady() {
      // Check if video has basic properties loaded
      if (video.readyState >= 1 && video.duration && !isNaN(video.duration)) {
        console.log("Video is ready with duration:", video.duration);
        resolve(true);
        return;
      }

      // Check timeout
      if (Date.now() - startTime > timeout) {
        console.log("Video ready timeout reached");
        resolve(false);
        return;
      }

      // Continue checking
      setTimeout(checkReady, 100);
    }

    // Start checking immediately
    checkReady();

    // Also listen for loadedmetadata event as backup
    const onLoadedMetadata = () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      resolve(true);
    };
    video.addEventListener("loadedmetadata", onLoadedMetadata);
  });
}

// Function to reset subtitle system state (useful for page navigation)
function resetSubtitleSystem() {
  console.log("resetting subtitle system");
  subtitleInitializationInProgress = false;
  selectedSubtitle = null;
  lastSubtitleTime = 0;
  subtitleRequestInProgress = false;

  // Clean up event listeners before resetting references
  if (currentVideo && timeUpdateHandler) {
    currentVideo.removeEventListener("timeupdate", timeUpdateHandler);
  }

  currentVideo = null;
  currentSubtitleContainer = null;
  timeUpdateHandler = null;

  // Remove existing subtitle container
  const existingContainer = document.getElementById("svt-english-subtitles");
  if (existingContainer) {
    existingContainer.remove();
  }
}

// Function to load saved subtitle position
async function loadSubtitlePosition() {
  try {
    const result = await chrome.storage.local.get("subtitlePosition");
    return result.subtitlePosition || null;
  } catch (error) {
    console.error("Error loading subtitle position:", error);
    return null;
  }
}

// Function to make container draggable
function makeDraggable(container) {
  let isHovering = false;

  // Show drag cursor and visual feedback on hover
  container.addEventListener("mouseenter", () => {
    isHovering = true;
    container.style.cursor = "move";
    container.style.background =
      "linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.85) 100%)";
    container.style.border = "1px solid rgba(255, 255, 255, 0.4)";
    container.style.boxShadow =
      "0 6px 30px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.2)";
    container.style.transform = container.style.transform.includes("translateX")
      ? "translateX(-50%) scale(1.02)"
      : "scale(1.02)";

    // Add drag hint
    if (container.textContent && !container.dataset.dragHintShown) {
      const originalTitle = container.title;
      container.title = "Drag to reposition subtitles";
      setTimeout(() => {
        container.title = originalTitle;
      }, 2000);
      container.dataset.dragHintShown = "true";
    }

    // Clear any existing timeout
    if (dragTimeout) {
      clearTimeout(dragTimeout);
      dragTimeout = null;
    }
  });

  container.addEventListener("mouseleave", () => {
    isHovering = false;
    if (!isDragging) {
      // Delay before resetting visual state
      dragTimeout = setTimeout(() => {
        if (!isHovering && !isDragging) {
          container.style.cursor = "default";
          container.style.background = "transparent";
          container.style.border = "none";
          container.style.boxShadow =
            "0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1)";
          container.style.transform = container.style.transform.includes(
            "translateX"
          )
            ? "translateX(-50%)"
            : "none";
        }
      }, 300);
    }
  });

  // Double-click to reset position
  container.addEventListener("dblclick", (e) => {
    e.preventDefault();

    // Reset to default center position
    container.style.left = "50%";
    container.style.top = "auto";
    container.style.bottom = "20px";
    container.style.transform = "translateX(-50%)";

    // Show feedback
    const originalBg = container.style.background;
    const originalBoxShadow = container.style.boxShadow;
    chrome.storage.local.remove("subtitlePosition");
    container.style.background =
      "linear-gradient(135deg, rgba(0, 150, 0, 0.9) 0%, rgba(0, 120, 0, 0.8) 100%)";
    container.style.boxShadow =
      "0 6px 30px rgba(0, 150, 0, 0.4), 0 0 0 1px rgba(0, 255, 0, 0.3)";
    setTimeout(() => {
      container.style.background = originalBg;
      container.style.boxShadow = originalBoxShadow;
    }, 300);
  });

  container.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // Only left mouse button

    console.log("Subtitle drag started");
    isDragging = true;
    container.style.background =
      "linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.9) 100%)";
    container.style.border = "1px solid rgba(255, 255, 255, 0.6)";
    container.style.boxShadow =
      "0 8px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.3)";
    container.style.cursor = "grabbing";
    container.style.transform = container.style.transform.includes("translateX")
      ? "translateX(-50%) scale(1.05)"
      : "scale(1.05)";

    const rect = container.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;

    // Prevent text selection during drag
    e.preventDefault();
    e.stopPropagation();

    // Add global mouse event listeners
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  });

  function handleMouseMove(e) {
    if (!isDragging) return;

    const video = document.querySelector("video");
    if (!video) return;

    const videoRect = video.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Calculate new position relative to video
    let newX = e.clientX - dragOffset.x - videoRect.left;
    let newY = e.clientY - dragOffset.y - videoRect.top;

    // Constrain to video bounds
    const maxX = videoRect.width - containerRect.width;
    const maxY = videoRect.height - containerRect.height;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    // Update position
    container.style.left = newX + "px";
    container.style.top = newY + "px";
    container.style.transform = "none";
    container.style.bottom = "auto";

    e.preventDefault();
  }

  function handleMouseUp(e) {
    if (!isDragging) return;

    console.log("Subtitle drag ended");
    isDragging = false;

    // Save the new position
    const rect = container.getBoundingClientRect();
    const videoRect = document.querySelector("video")?.getBoundingClientRect();

    if (videoRect) {
      const containerCenterX = rect.left + rect.width / 2 - videoRect.left;
      const relativeY = rect.top - videoRect.top;
      console.log("Saving subtitle position:", containerCenterX, relativeY);
      saveSubtitlePosition(containerCenterX, relativeY);
    }

    // Remove global event listeners
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);

    // Reset visual state after a delay if not hovering
    setTimeout(() => {
      if (!isHovering) {
        container.style.cursor = isHovering ? "move" : "default";
        container.style.background =
          "linear-gradient(135deg, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.75) 100%)";
        container.style.border = "none";
        container.style.boxShadow =
          "0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1)";
        container.style.transform = container.style.transform.includes(
          "translateX"
        )
          ? "translateX(-50%)"
          : "none";
      }
    }, 300);

    e.preventDefault();
  }
}

// Function to get responsive subtitle styles
function getResponsiveSubtitleStyles(fontScale) {
  const screenWidth = window.innerWidth;

  // Calculate responsive font size (base 24px, scales with screen size)
  let fontSize = 24 * fontScale;

  let maxWidth = "60%";

  if (screenWidth <= 480) {
    // Mobile phones
    fontSize = 18 * fontScale;
    maxWidth = "85%";
  } else if (screenWidth <= 768) {
    // Tablets
    fontSize = 20 * fontScale;
    maxWidth = "70%";
  } else if (screenWidth <= 1024) {
    // Small laptops
    fontSize = 22 * fontScale;
    maxWidth = "65%";
  } else if (screenWidth >= 1920) {
    // Large screens
    fontSize = 28 * fontScale;
    maxWidth = "65%";
  }

  return { fontSize, maxWidth };
}

// Function to create subtitle container
async function initSubtitleContainer() {
  const existingContainer = document.getElementById("svt-english-subtitles");
  if (existingContainer) {
    // Clear any existing content when reusing container
    existingContainer.textContent = "";
    return existingContainer;
  }

  const container = document.createElement("div");
  container.id = "svt-english-subtitles";
  makeDraggable(container);

  // Load saved position
  const savedPosition = await loadSubtitlePosition();
  const responsiveStyles = getResponsiveSubtitleStyles(fontScale);

  if (savedPosition) {
    // Use saved position
    console.log("using saved position", savedPosition);
    const containerRect = container.getBoundingClientRect();
    container.style.cssText = `
      position: absolute;
      left: ${savedPosition.x - containerRect.width / 2}px;
      top: ${savedPosition.y}px;

      color: #ffffff;
      font-size: ${responsiveStyles.fontSize}px;
      font-weight: 500;
      text-align: center;
      text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 0, 0, 0.5);
      z-index: 9999;
      pointer-events: auto;
      max-width: ${responsiveStyles.maxWidth};
      background: transparent;
      border-radius: 12px;
      white-space: pre-wrap;
      word-wrap: break-word;
      display: block;
      user-select: none;
    
      cursor: default;
      border: none;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
    `;
  } else {
    // Use default centered position
    console.log("using default centered position");
    container.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      color: #ffffff;
      font-size: ${responsiveStyles.fontSize}px;
      font-weight: 500;
      text-align: center;
      text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 0, 0, 0.5);
      z-index: 9999;
      pointer-events: auto;
      max-width: ${responsiveStyles.maxWidth};
      background: transparent;
      border-radius: 12px;
      white-space: pre-wrap;
      word-wrap: break-word;
      display: block;
      user-select: none;

      cursor: default;
      border: none;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
    `;
  }

  return container;
}

// Function to update subtitle container styles on window resize
function updateSubtitleContainerStyles() {
  const container = document.getElementById("svt-english-subtitles");
  if (!container) return;

  const responsiveStyles = getResponsiveSubtitleStyles(fontScale);

  // Update font size, padding, and max-width
  container.style.fontSize = `${responsiveStyles.fontSize}px`;
  container.style.maxWidth = responsiveStyles.maxWidth;
}

// SPA-compatible video detection and subtitle system

// Function to check if we're on a video page (already declared above)

// Function to initialize subtitle system for current video
async function initializeSubtitleSystemForCurrentVideo() {
  console.log("Initializing subtitle system for video");
  subtitleInitializationInProgress = true;

  try {
    const result = await initializeSubtitleSystem();
    if (result && !result.noSubtitles) {
      console.log("Subtitle system initialized successfully");
    } else if (result && result.noSubtitles) {
      console.log("No subtitles available for this video");
    }
  } catch (error) {
    console.error("Error initializing subtitle system:", error);
  } finally {
    subtitleInitializationInProgress = false;
  }
}

// Function to watch for video elements dynamically
function addVideoObserver() {
  if (videoObserver) {
    videoObserver.disconnect();
  }

  videoObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if the added node is a video or contains a video
          const videos = node.querySelectorAll
            ? node.querySelectorAll("video")
            : [];
          if (node.tagName === "VIDEO") {
            videos.push(node);
          }
          if (detectVideoPage() && videos.length > 0) {
            console.log("New video element detected via MutationObserver");

            // Check if subtitles are enabled and initialize
            try {
              chrome.storage.local.get(["subtitlesEnabled"], (result) => {
                console.log("subtitlesEnabled", result.subtitlesEnabled);
                if (chrome.runtime.lastError) {
                  console.error("Storage error:", chrome.runtime.lastError);
                  return;
                }

                if (
                  result.subtitlesEnabled &&
                  !document.getElementById("svt-english-subtitles")
                ) {
                  // Initialize subtitles for the newly detected video
                  initializeSubtitleSystemForCurrentVideo();

                  // Stop observing once video is found and subtitle system is initialized
                  if (videoObserver) {
                    videoObserver.disconnect();
                    videoObserver = null;
                    console.log("Video observer stopped after finding video");
                  }
                }
              });
            } catch (error) {
              console.error("Error accessing storage:", error);
            }
          }
        }
      });
    });
  });

  videoObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Function to handle video ID changes during navigation
function handleVideoIdChange() {
  const newVideoId = getVideoIdFromUrl(location.href);

  console.log("🔄 Checking video ID change:", currentVideoId, "→", newVideoId);

  // Navigated away from video page
  if (!detectVideoPage() && currentVideoId) {
    console.log("❌ Navigated away from video page");
    currentVideoId = null;
    resetSubtitleSystem();
    if (videoObserver) {
      videoObserver.disconnect();
      videoObserver = null;
    }
    return;
  }

  // Video ID changed (new episode)
  if (newVideoId && newVideoId !== currentVideoId) {
    console.log("📺 Video ID changed from", currentVideoId, "to", newVideoId);
    currentVideoId = newVideoId;
    resetSubtitleSystem();

    // Reinitialize for new video
    if (detectVideoPage()) {
      chrome.storage.local.get(["subtitlesEnabled"], (result) => {
        if (result.subtitlesEnabled) {
          console.log("🔄 Reinitializing subtitle system for new video");

          // First, set up observer for when video element appears
          addVideoObserver();

          // Also check if video already exists (common in SPAs)
          const existingVideo = document.querySelector("video");
          if (existingVideo) {
            console.log(
              "✅ Video element already exists, initializing immediately"
            );
            initializeSubtitleSystemForCurrentVideo();
          }
        } else {
          console.log("⏸️ Subtitles disabled, skipping initialization");
        }
      });
    }
  }
}

// Setup navigation monitoring using PerformanceObserver + setInterval fallback
function setupNavigationMonitoring() {
  let lastUrl = location.href;
  let lastVideoId = getVideoIdFromUrl(lastUrl);

  // Modern approach: Watch for navigation events
  try {
    const perfObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "navigation") {
          console.log("🔄 Navigation event detected via PerformanceObserver");
          handleVideoIdChange();
        }
      }
    });

    perfObserver.observe({ entryTypes: ["navigation"] });
    console.log("✅ PerformanceObserver active");
  } catch (error) {
    console.log("⚠️ PerformanceObserver not available:", error);
  }

  // Fallback: Poll for URL changes (catches SPA navigation)
  setInterval(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      console.log("🔴 URL changed detected:", lastUrl, "→", currentUrl);
      lastUrl = currentUrl;

      const newVideoId = getVideoIdFromUrl(currentUrl);
      if (newVideoId !== lastVideoId) {
        lastVideoId = newVideoId;
        handleVideoIdChange();
      }
    }
  }, 500); // Check every 500ms

  console.log("✅ URL change monitoring active (polling every 500ms)");
}

// Listen for back/forward button navigation
window.addEventListener("popstate", () => {
  console.log("🔙 Popstate event (back/forward button)");
  handleVideoIdChange();
});

// Initialize when DOM is ready
console.log("SVT Play Subtitle Extension loaded");
console.log("Current URL:", window.location.href);

// Set up navigation monitoring for SPA
setupNavigationMonitoring();

// Check if we're on a video page and set up detection
if (detectVideoPage()) {
  console.log("on video page");
  currentVideoId = getVideoIdFromUrl(window.location.href);
  console.log("Initial video ID:", currentVideoId);
  addVideoObserver();

  // Also check for existing video immediately
  const existingVideo = document.querySelector("video");
  if (existingVideo) {
    console.log("Video found on page load");
    initializeSubtitleSystemForCurrentVideo();
  }
} else {
  console.log("not on video page");
}

function saveSubtitlePosition(containerCenterX, relativeY) {
  chrome.storage.local.set({
    subtitlePosition: { x: containerCenterX, y: relativeY },
  });
}

// Add window resize listener for responsive subtitle styling
window.addEventListener("resize", () => {
  // Debounce the resize event to avoid excessive updates
  clearTimeout(window.subtitleResizeTimeout);
  window.subtitleResizeTimeout = setTimeout(updateSubtitleContainerStyles, 150);
});
