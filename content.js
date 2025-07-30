let selectedSubtitle = null;
let lastSubtitleTime = 0;
let subtitleRequestInProgress = false;
let subtitleSystemInitialized = false; // Flag to prevent multiple initializations
let subtitleInitializationInProgress = false; // Flag to prevent concurrent initializations
let currentVideo = null; // Store reference to current video
let currentSubtitleContainer = null; // Store reference to subtitle container
let timeUpdateHandler = null; // Store reference to time update handler

// Start watching for dynamically loaded videos
watchForVideos();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === "checkVideo") {
      const video = document.querySelector("video");

      if (video) {
        if (document.getElementById("english-subtitles")) {
          sendResponse({ alreadyHasSubtitles: true });
          return;
        }

        (async () => {
          try {
            if (
              !subtitleSystemInitialized &&
              !subtitleInitializationInProgress
            ) {
              const result = await initializeSubtitleSystem();
              console.log("result", result);
              if (result && result.noSubtitles) {
                console.log("No subtitles available!!!");
                sendResponse({ hasVideo: true, noSubtitles: true });
                return true;
              } else {
                sendResponse({ hasVideo: true });
              }
            }
          } catch (error) {
            console.error("Error in checkVideo:", error);
          }
        })();
        return true;
      } else {
        // No video found immediately, try with retry mechanism
        console.log("No video found immediately, attempting retry detection");

        (async () => {
          try {
            if (
              !subtitleSystemInitialized &&
              !subtitleInitializationInProgress
            ) {
              // Check if video exists and try to initialize
              const video = document.querySelector("video");
              if (video) {
                const success = await initializeSubtitleSystem();
                if (success) {
                  sendResponse({ hasVideo: true, foundAfterRetry: true });
                } else {
                  sendResponse({ hasVideo: false });
                }
              } else {
                sendResponse({ hasVideo: false });
              }
            } else {
              sendResponse({ hasVideo: true, alreadyInitialized: true });
            }
          } catch (error) {
            console.error("Error in video detection:", error);
            sendResponse({ hasVideo: false });
          }
        })();
        return true;
      }
    }
    if (request.action === "toggleSubtitles") {
      if (request.enabled) {
        // Enable subtitles
        if (currentSubtitleContainer) {
          currentSubtitleContainer.style.display = "block";
        }
        sendResponse({ subtitlesEnabled: request.enabled });
        return true;
      } else {
        // Disable subtitles
        if (currentVideo && currentSubtitleContainer && timeUpdateHandler) {
          currentVideo.removeEventListener("timeupdate", timeUpdateHandler);
          currentSubtitleContainer.style.display = "none";
          currentSubtitleContainer.textContent = "";
        }
        sendResponse({ subtitlesEnabled: request.enabled });
        return true;
      }
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
            subtitleSystemInitialized = true;

            // Ensure subtitles are visible if they should be
            const result = await chrome.storage.local.get(["subtitlesEnabled"]);
            if (result.subtitlesEnabled && currentSubtitleContainer) {
              currentSubtitleContainer.style.display = "block";
            }

            sendResponse({ success: true });
          } else {
            console.error("Failed to reinitialize subtitle system");
            sendResponse({ success: false, error: "Failed to initialize" });
          }
        } catch (error) {
          console.error("Error updating subtitle track:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();

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
        subtitleContainer.textContent = "";
        subtitleContainer.style.display = "none";
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

    // Check if subtitles are already initialized
    const existingContainer = document.getElementById("english-subtitles");
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
    if (document.getElementById("english-subtitles")) {
      console.log("Subtitle container already exists, skipping initialization");
      return true;
    }

    // Check for available subtitles before creating container
    try {
      const response = await safeSendMessage({
        action: "videoFound",
      });

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
        const videoId = getVideoIdFromUrl(window.location.href);

        try {
          // Use background script as proxy to access storage
          const storageResponse = await safeSendMessage({
            action: "getSavedSubtitleSelection",
            videoId: videoId,
          });

          if (storageResponse && storageResponse.selectedSubtitle) {
            // Use saved subtitle selection
            selectedSubtitle = storageResponse.selectedSubtitle;
          } else {
            // Use first subtitle option as default
            selectedSubtitle = response.subtitleOptions[0].url;
          }

          // Load the selected subtitle
          const loadResponse = await safeSendMessage({
            action: "loadSubtitle",
            subtitleUrl: selectedSubtitle,
          });

          if (!loadResponse || !loadResponse.loaded) {
            console.error(
              "Failed to load selected subtitle:",
              loadResponse?.error
            );
            throw new Error("Subtitle loading failed");
          }
        } catch (error) {
          console.error("Error loading saved subtitle selection:", error);
          // Fallback to first option
          selectedSubtitle = response.subtitleOptions[0].url;
          const fallbackResponse = await safeSendMessage({
            action: "loadSubtitle",
            subtitleUrl: selectedSubtitle,
          });

          if (!fallbackResponse || !fallbackResponse.loaded) {
            console.error(
              "Failed to load fallback subtitle:",
              fallbackResponse?.error
            );
            return false;
          }
        }
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

// Helper function to extract video ID from URL
function getVideoIdFromUrl(url) {
  const match = url.match(/\/video\/([^/?]+)/);
  return match ? match[1] : null;
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
  subtitleSystemInitialized = false;
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
  const existingContainer = document.getElementById("english-subtitles");
  if (existingContainer) {
    existingContainer.remove();
  }
}

// Function to watch for dynamically loaded videos
function watchForVideos() {
  const observer = new MutationObserver((mutations) => {
    // Skip if we're already initializing or system is initialized
    if (subtitleSystemInitialized || subtitleInitializationInProgress) {
      return;
    }

    let shouldCheckForVideo = false;

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

          if (videos.length > 0) {
            shouldCheckForVideo = true;
          }
        }
      });
    });

    if (shouldCheckForVideo) {
      console.log("New video element detected via MutationObserver");

      // Check if subtitles are enabled and initialize
      try {
        chrome.storage.local.get(["subtitlesEnabled"], (result) => {
          if (chrome.runtime.lastError) {
            console.error("Storage error:", chrome.runtime.lastError);
            return;
          }

          if (
            result.subtitlesEnabled &&
            !document.getElementById("english-subtitles") &&
            !subtitleSystemInitialized &&
            !subtitleInitializationInProgress
          ) {
            // Initialize subtitles for the newly detected video
            initializeSubtitleSystem();
          }
        });
      } catch (error) {
        console.error("Error accessing storage:", error);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Variables for drag functionality
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let dragTimeout = null;

// Function to save subtitle position
function saveSubtitlePosition(x, y) {
  chrome.storage.local.set({ subtitlePosition: { x, y } });
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
    container.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
    container.style.border = "1px solid rgba(255, 255, 255, 0.3)";

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
          container.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
          container.style.border = "none";
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
    const originalBg = container.style.backgroundColor;
    container.style.backgroundColor = "rgba(0, 150, 0, 0.8)";
    setTimeout(() => {
      container.style.backgroundColor = originalBg;
    }, 300);
  });

  container.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // Only left mouse button

    console.log("Subtitle drag started");
    isDragging = true;
    container.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
    container.style.border = "1px solid rgba(255, 255, 255, 0.5)";
    container.style.cursor = "grabbing";

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
      const relativeX = rect.left - videoRect.left;
      const relativeY = rect.top - videoRect.top;
      console.log("Saving subtitle position:", relativeX, relativeY);
      saveSubtitlePosition(relativeX, relativeY);
    }

    // Remove global event listeners
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);

    // Reset visual state after a delay if not hovering
    setTimeout(() => {
      if (!isHovering) {
        container.style.cursor = isHovering ? "move" : "default";
        container.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
        container.style.border = "none";
      }
    }, 300);

    e.preventDefault();
  }
}

// Function to create subtitle container
async function initSubtitleContainer() {
  const existingContainer = document.getElementById("english-subtitles");
  if (existingContainer) {
    // Clear any existing content when reusing container
    existingContainer.textContent = "";
    return existingContainer;
  }

  const container = document.createElement("div");
  container.id = "english-subtitles";

  // Load saved position
  const savedPosition = await loadSubtitlePosition();

  if (savedPosition) {
    // Use saved position
    container.style.cssText = `
      position: absolute;
      left: ${savedPosition.x}px;
      top: ${savedPosition.y}px;
      color: white;
      font-size: 24px;
      text-align: center;
      text-shadow: 2px 2px 2px black;
      z-index: 9999;
      pointer-events: auto;
      max-width: 80%;
      background-color: rgba(0, 0, 0, 0.7);
      padding: 8px 12px;
      border-radius: 4px;
      white-space: pre-wrap;
      word-wrap: break-word;
      display: block;
      user-select: none;
      transition: background-color 0.2s ease;
      cursor: default;
    `;
  } else {
    // Use default centered position
    container.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      font-size: 24px;
      text-align: center;
      text-shadow: 2px 2px 2px black;
      z-index: 9999;
      pointer-events: auto;
      max-width: 80%;
      background-color: rgba(0, 0, 0, 0.7);
      padding: 8px 12px;
      border-radius: 4px;
      white-space: pre-wrap;
      word-wrap: break-word;
      display: block;
      user-select: none;
      transition: background-color 0.2s ease;
      cursor: default;
    `;
  }

  // Make the container draggable
  makeDraggable(container);

  return container;
}
