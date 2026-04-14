# YouTube Playlist Time Calculator

A simple, fast, static web app that calculates the total duration of a YouTube playlist, shows the number of videos, average video duration, per-video list, and estimates watch time and savings at different playback speeds.

## Features

- Paste a YouTube playlist URL
- Analyze playlist duration and video count
- Toggle individual videos on/off to exclude them from totals
- See watch time at 1x, 1.25x, 1.5x, 1.75x, and 2x
- See estimated finish time from the current moment
- Live current-time updates
- Quick insights and a clean premium-style UI
- Clipboard paste button for the playlist URL
- Marathon player page for continuous playlist playback with chapter timestamps

## Requirements

- A browser with JavaScript enabled
- A YouTube Data API v3 key

## Setup

The app is fully static and runs directly in the browser.

1. Open `script.js`
2. Set your API key in the `HARDCODED_API_KEY` constant near the top of the file
3. Open `index.html` in your browser
4. Paste a playlist link and click **Analyze Playlist**

To use the continuous playlist player:

1. Open `player.html` in your browser
2. Paste playlist URL and click **Load Marathon Player**
3. Use chapter timestamps to jump across the playlist timeline

> The API key is not shown in the page UI. It is read from the script file only.

## How it works

The app uses the YouTube Data API v3:

- `playlistItems` endpoint to fetch all videos in the playlist
- `videos` endpoint to fetch durations and metadata

Durations are calculated in the browser, so no data is stored on a server.

## GitHub Pages Deployment

This project is ready for GitHub Pages because it is a static HTML/CSS/JS app.

### Steps

1. Push the repository to GitHub
2. Go to the repository on GitHub
3. Open **Settings** > **Pages**
4. Under **Build and deployment**, select **Deploy from a branch**
5. Choose the branch you want to publish, usually `main`
6. Set the folder to `/root`
7. Save

## Important note about the API key

Because this is a client-side app, the API key is visible in the JavaScript file. For personal use that is fine, but if you want to rotate or change it later, just edit `HARDCODED_API_KEY` in `script.js`.

## Files

- `index.html` - page structure
- `styles.css` - UI styling
- `script.js` - playlist analysis logic
- `player.html` - continuous playlist player page
- `player.js` - continuous playback and chapter timeline logic
- `README.md` - project documentation

## License

No license has been added yet.