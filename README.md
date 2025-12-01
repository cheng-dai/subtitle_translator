# SVT Play English Subtitles Extension

A Chrome extension that automatically detects videos on SVT Play and provides English subtitles by translating Swedish subtitles in real-time.

## [Chrome web store](https://chromewebstore.google.com/detail/subtitle-translate-svt-pl/nbdjcajgdikaielcldjkobcajaehllee)

## Features

- **Automatic Video Detection**: Detects video elements on SVT Play pages using MutationObserver
- **Real-time Translation**: Uses Chrome's built-in Translator API to translate Swedish subtitles to English
- **Smart Caching**: Caches translated subtitles to improve performance and reduce API calls
- **SPA Navigation Support**: Handles single-page application navigation to detect videos on page changes
- **User-friendly Interface**: Simple popup interface to enable/disable subtitles and select subtitle tracks
- **Position Memory**: Remembers subtitle position preferences

## How It Works

### Video Detection

1. The extension monitors the DOM for video elements using MutationObserver
2. When a video is detected on an SVT Play page, it automatically initializes the subtitle system
3. The system handles SPA navigation by listening to history changes and DOM mutations

### Subtitle Processing

1. Fetches available Swedish subtitle tracks from SVT's API
2. Downloads and parses WebVTT subtitle files
3. Translates subtitle text using Chrome's Translator API
4. Caches translations to improve performance

### Display System

1. Creates an overlay container positioned over the video
2. Synchronizes subtitle display with video playback time
3. Updates subtitles in real-time as the video plays

## Installation

### Development Setup

1. Clone this repository
2. Install dependencies:

   ```bash
   bun install
   ```

3. Build the popup:

   ```bash
   bun run build
   ```

4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the project directory

### Production Installation

1. Download the latest release
2. Extract the files
3. Load the extension in Chrome as described above

## Usage

1. Navigate to any video on SVT Play (e.g., `https://www.svtplay.se/video/...`)
2. Click the extension icon in your browser toolbar
3. Toggle the "Subtitles" switch to enable English subtitles
4. If multiple subtitle tracks are available, select your preferred track from the dropdown
5. Subtitles will appear overlaid on the video and update in real-time

## Technical Details

### Architecture

- **Content Script** (`content.js`): Handles video detection, subtitle display, and user interaction
- **Background Script** (`background.js`): Manages subtitle fetching, translation, and caching
- **Popup** (`popup.tsx`): React-based user interface for controlling the extension

### Key Components

#### Video Detection System

```javascript
// Uses MutationObserver to detect video elements
const videoObserver = new MutationObserver((mutations) => {
  // Check for new video elements and initialize subtitle system
});
```

#### Subtitle Translation

```javascript
// Uses Chrome's Translator API for real-time translation
const translator = await Translator.create({
  sourceLanguage: "sv",
  targetLanguage: "en",
});
```

#### Caching System

```javascript
// Caches translated subtitles to improve performance
const subtitleCache = {};
const cacheKey = `${videoId}:${subtitleIndex}`;
```

### Permissions

The extension requires the following permissions:

- `storage`: To save user preferences
- `activeTab`: To interact with the current tab
- `scripting`: To inject content scripts
- `host_permissions`: Access to SVT Play and video.svt.se domains

## Development

### Building

```bash
# Build the popup
bun run build

# Watch for changes during development
bun run dev
```

### File Structure

```
svt_play_subtitle/
├── content.js          # Content script for video detection and subtitle display
├── background.js       # Background script for subtitle processing
├── popup.tsx          # React popup component
├── popup.js           # Built popup (generated)
├── popup.html         # Popup HTML template
├── styles.css         # Styling for popup and subtitles
├── manifest.json      # Extension manifest
└── icons/             # Extension icons
```

### Debugging

1. Open Chrome DevTools
2. Go to the "Console" tab
3. Look for log messages from the extension:
   - "SVT Play Subtitle Extension loaded"
   - "Video detected"
   - "Subtitle system initialized successfully"

## Troubleshooting

### Common Issues

1. **Subtitles not appearing**:

   - Check if the video has Swedish subtitles available
   - Ensure the extension is enabled for the current site
   - Check the browser console for error messages

2. **Translation not working**:

   - Verify that Chrome's Translator API is available
   - Check if the extension has the necessary permissions

3. **Performance issues**:
   - The extension caches translations to improve performance
   - Clear the extension's storage if you experience issues

### Error Messages

- "No subtitles available": The video doesn't have Swedish subtitles
- "Translator not available": Chrome's Translator API is not accessible
- "Video not ready": The video element hasn't loaded metadata yet

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- SVT Play for providing the video content and subtitle data
- Chrome's Translator API for real-time translation capabilities
- The React team for the popup interface framework
