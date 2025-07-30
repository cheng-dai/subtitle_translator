# SVT Play English Subtitles Chrome Extension

This Chrome extension adds English subtitles to videos on SVT Play.

## Features

- Automatically detects SVT Play videos
- Adds English subtitles overlay to videos
- Toggle subtitles on/off
- Clean and non-intrusive subtitle display

## Installation

1. Clone this repository or download the files
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the directory containing the extension files

## Usage

1. Navigate to any video on SVT Play (https://www.svtplay.se)
2. Click the extension icon in your Chrome toolbar
3. Use the toggle switch to enable/disable subtitles
4. The subtitles will appear at the bottom of the video player

## Development

The extension consists of the following main components:

- `manifest.json`: Extension configuration
- `content.js`: Handles video player interaction and subtitle display
- `background.js`: Manages subtitle fetching and caching
- `popup.html/js`: User interface for controlling the extension
- `styles.css`: Styling for the subtitle display

## Note

This extension requires an API endpoint for fetching English subtitles. You'll need to:

1. Implement the actual subtitle fetching logic in `background.js`
2. Set up an API endpoint that can provide English subtitles for SVT Play videos
3. Update the `fetchSubtitles` function with your API endpoint

## License

MIT License 