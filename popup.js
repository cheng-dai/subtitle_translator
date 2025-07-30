document.addEventListener("DOMContentLoaded", function () {
  const subtitleToggle = document.getElementById("subtitleToggle");
  const statusText = document.getElementById("statusText");
  const videoStatus = document.getElementById("videoStatus");
  const NOT_SUPPORTED = document.getElementById("NOT_SUPPORTED");
  const subtitleSelectSection = document.getElementById(
    "subtitleSelectSection"
  );
  const subtitleSelect = document.getElementById("subtitleSelect");

  const match = /Chrome\/([0-9.]+)/.exec(navigator.userAgent);
  if (match) {
    const chromeVersion = match[1];
    if (chromeVersion < "138") {
      videoStatus.style.display = "none";
      statusText.style.display = "none";
      subtitleToggle.style.display = "none";
      subtitleToggle.disabled = true;
      subtitleToggle.style.opacity = 0.5;
      subtitleToggle.style.cursor = "not-allowed";
      NOT_SUPPORTED.style.display = "block";
      NOT_SUPPORTED.style.color = "#f44336";
      NOT_SUPPORTED.style.fontSize = "14px";
      NOT_SUPPORTED.style.fontWeight = "bold";
      NOT_SUPPORTED.style.textAlign = "center";
      NOT_SUPPORTED.style.margin = "10px 0";
      NOT_SUPPORTED.style.padding = "10px";
      return;
    }
  }

  // Function to set subtitle options in the popup
  function setSubtitleOptions(subtitleOptions) {
    subtitleSelect.innerHTML = "";

    if (subtitleOptions && subtitleOptions.length > 0) {
      subtitleOptions.forEach(function (subtitleRef) {
        const option = document.createElement("option");
        option.value = subtitleRef.url;
        option.textContent = subtitleRef.label;
        subtitleSelect.appendChild(option);
      });

      // Get current video ID and load saved selection for this specific video
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const videoId = getVideoIdFromUrl(tabs[0].url);
        const storageKey = videoId
          ? `selectedSubtitle_${videoId}`
          : "selectedSubtitle";

        chrome.storage.session.get([storageKey], (result) => {
          if (result[storageKey]) {
            subtitleSelect.value = result[storageKey];
          } else {
            subtitleSelect.value = subtitleOptions[0].url;
          }
        });
      });

      subtitleSelectSection.style.display = "block";
    } else {
      subtitleSelectSection.style.display = "none";
    }
  }

  // Handle subtitle selection change
  subtitleSelect.addEventListener("change", function () {
    const selectedSubtitle = subtitleSelect.value;

    if (selectedSubtitle) {
      // Get current video ID and save selection for this specific video
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const videoId = getVideoIdFromUrl(tabs[0].url);
        const storageKey = videoId
          ? `selectedSubtitle_${videoId}`
          : "selectedSubtitle";

        try {
          chrome.storage.session.set({ [storageKey]: selectedSubtitle });
        } catch (error) {
          console.error("Error saving selected subtitle:", error);
        }

        // Update status to show loading
        videoStatus.textContent = "Updating subtitles...";
        videoStatus.style.color = "#ff9800";

        // Send message to content script to update subtitle
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: "updateSubtitleTrack",
            subtitleUrl: selectedSubtitle,
          },
          function (response) {
            if (chrome.runtime.lastError) {
              console.error(
                "Error updating subtitle track:",
                chrome.runtime.lastError
              );
              videoStatus.textContent = "Error updating subtitles";
              videoStatus.style.color = "#f44336";
              return;
            }

            if (response && response.success) {
              videoStatus.textContent = "Subtitles updated successfully";
              videoStatus.style.color = "#4CAF50";
            } else {
              videoStatus.textContent = "Failed to update subtitles";
              videoStatus.style.color = "#f44336";
              console.error("Subtitle update failed:", response?.error);
            }
          }
        );
      });
    } else {
      console.error("No subtitle selected - selectedSubtitle is empty or null");
    }
  });

  // Helper function to extract video ID from URL
  function getVideoIdFromUrl(url) {
    const match = url.match(/\/video\/([^/?]+)/);
    return match ? match[1] : null;
  }

  // Load saved state
  chrome.storage.local.get(["subtitlesEnabled"], function (result) {
    subtitleToggle.checked = result.subtitlesEnabled || false;
    updateStatusText(result.subtitlesEnabled || false);
    if (result.subtitlesEnabled) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "checkVideo" },
          function (response) {
            if (response && response.alreadyHasSubtitles) {
              videoStatus.textContent = "Subtitles active";
              videoStatus.style.color = "#4CAF50";
              // Load subtitle options for the popup
              loadSubtitleOptions();
              return;
            }

            if (response && response.hasVideo && !response.noSubtitles) {
              videoStatus.textContent =
                "Video detected - initializing subtitles";
              videoStatus.style.color = "#4CAF50";
              // Load subtitle options for the popup
              loadSubtitleOptions();
            } else if (response && response.hasVideo && response.noSubtitles) {
              videoStatus.textContent =
                "Video detected - no subtitles available";
              videoStatus.style.color = "#f44336";
            } else {
              videoStatus.textContent = "No video detected";
              videoStatus.style.color = "#f44336";
            }
          }
        );
      });
    }
  });

  // Function to load subtitle options
  function loadSubtitleOptions() {
    chrome.runtime.sendMessage(
      {
        action: "videoFound",
      },
      function (response) {
        if (response && response.subtitleOptions) {
          setSubtitleOptions(response.subtitleOptions);
        }
      }
    );
  }

  // Handle toggle changes
  subtitleToggle.addEventListener("change", function () {
    const enabled = subtitleToggle.checked;
    chrome.storage.local.set({ subtitlesEnabled: enabled });
    updateStatusText(enabled);

    // Show/hide subtitle selection based on toggle state
    if (enabled) {
      loadSubtitleOptions();
    } else {
      subtitleSelectSection.style.display = "none";
    }

    // Send message to content script
    if (enabled) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "checkVideo" },
          function (response) {
            console.log("response", response);
            if (response && response.alreadyHasSubtitles) {
              videoStatus.textContent = "Subtitles active";
              videoStatus.style.color = "#4CAF50";
              return;
            }
            if (response && response.hasVideo && response.noSubtitles) {
              videoStatus.textContent =
                "Video detected - no subtitles available";
              videoStatus.style.color = "#f44336";
              return;
            }
            if (response && response.hasVideo && !response.noSubtitles) {
              videoStatus.textContent =
                "Video detected - initializing subtitles";
              videoStatus.style.color = "#4CAF50";
            } else {
              videoStatus.textContent = "No video detected";
              videoStatus.style.color = "#f44336";
            }
          }
        );
      });
    }
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "toggleSubtitles",
        enabled: enabled,
      });
    });
  });

  function updateStatusText(enabled) {
    statusText.textContent = `Subtitles: ${enabled ? "On" : "Off"}`;
  }
});
