const playlistUrlInput = document.getElementById("playlistUrl");
const analyzeBtn = document.getElementById("analyzeBtn");
const clearBtn = document.getElementById("clearBtn");
const pasteBtn = document.getElementById("pasteBtn");
const statusEl = document.getElementById("status");

const resultsSection = document.getElementById("resultsSection");
const summaryCards = document.getElementById("summaryCards");
const speedPlanner = document.getElementById("speedPlanner");
const quickInsights = document.getElementById("quickInsights");
const videoList = document.getElementById("videoList");
const videoRowTemplate = document.getElementById("videoRowTemplate");
const selectionHint = document.getElementById("selectionHint");
const currentTimeDisplay = document.getElementById("currentTimeDisplay");

const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

// Optional: set your personal key here if you want it hardcoded for local-only use.
const HARDCODED_API_KEY = "AIzaSyAvoM4cMirD_aNLXel9zDv0DcHK6xNnbto";
let currentVideos = [];
let selectedVideoIds = new Set();
let currentStats = null;
let liveTimerId = null;

analyzeBtn.addEventListener("click", onAnalyze);
clearBtn.addEventListener("click", onClear);
pasteBtn.addEventListener("click", onPastePlaylistUrl);
videoList.addEventListener("change", onVideoToggle);

startLiveClock();

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function parsePlaylistId(url) {
  try {
    const parsed = new URL(url.trim());
    const listId = parsed.searchParams.get("list");
    return listId && listId.trim() ? listId.trim() : null;
  } catch {
    return null;
  }
}

function parseISODurationToSeconds(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return 0;
  }
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;

  if (h > 0) {
    return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  }
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function formatFinishIn(seconds) {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatClockTime(date) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function getEndTime(watchSeconds, now) {
  return new Date(now.getTime() + watchSeconds * 1000);
}

function updateCurrentTimeDisplay(now) {
  currentTimeDisplay.textContent = `Current time: ${formatClockTime(now)}`;
}

function startLiveClock() {
  if (liveTimerId) {
    clearInterval(liveTimerId);
  }

  const tick = () => {
    const now = new Date();
    updateCurrentTimeDisplay(now);
    if (currentStats) {
      renderSpeedPlanner(currentStats, now);
      renderQuickInsights(currentStats, now);
    }
  };

  tick();
  liveTimerId = setInterval(tick, 1000);
}

async function onPastePlaylistUrl() {
  try {
    const clipboardText = await navigator.clipboard.readText();
    if (!clipboardText.trim()) {
      setStatus("Clipboard is empty.", true);
      return;
    }

    playlistUrlInput.value = clipboardText.trim();
    setStatus("Playlist link pasted.");
    playlistUrlInput.focus();
  } catch {
    setStatus("Paste failed. Allow clipboard access or paste manually.", true);
  }
}

function batch(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

async function fetchPlaylistItems(playlistId, apiKey) {
  const items = [];
  let nextPageToken = "";

  while (true) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("key", apiKey);
    if (nextPageToken) {
      url.searchParams.set("pageToken", nextPageToken);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch playlist items. Check URL and API key.");
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "YouTube API error");
    }

    items.push(...(data.items || []));
    if (!data.nextPageToken) {
      break;
    }
    nextPageToken = data.nextPageToken;
  }

  return items;
}

async function fetchVideosByIds(videoIds, apiKey) {
  const chunks = batch(videoIds, 50);
  const responses = await Promise.all(
    chunks.map(async (idsChunk) => {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "contentDetails,snippet");
      url.searchParams.set("id", idsChunk.join(","));
      url.searchParams.set("maxResults", "50");
      url.searchParams.set("key", apiKey);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch video details.");
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || "YouTube API error");
      }
      return data.items || [];
    })
  );

  return responses.flat();
}

function calculateStats(videos) {
  const totalSeconds = videos.reduce((sum, item) => sum + item.durationSeconds, 0);
  const totalVideos = videos.length;
  const avgSeconds = totalVideos ? totalSeconds / totalVideos : 0;

  const speedRows = SPEEDS.map((speed) => {
    const watchSeconds = totalSeconds / speed;
    const savedSeconds = totalSeconds - watchSeconds;
    return {
      speed,
      watchSeconds,
      savedSeconds
    };
  });

  return {
    totalSeconds,
    totalVideos,
    avgSeconds,
    speedRows
  };
}

function renderSummary(stats) {
  summaryCards.innerHTML = "";
  const cards = [
    { label: "Total Videos", value: String(stats.totalVideos) },
    { label: "Total Duration", value: formatDuration(stats.totalSeconds) },
    { label: "Average Video Duration", value: formatDuration(stats.avgSeconds) },
    { label: "At 2x Speed", value: formatDuration(stats.totalSeconds / 2) }
  ];

  for (const card of cards) {
    const el = document.createElement("article");
    el.className = "card";
    el.innerHTML = `<p class="label">${card.label}</p><p class="value">${card.value}</p>`;
    summaryCards.appendChild(el);
  }
}

function renderSpeedPlanner(stats, now = new Date()) {
  speedPlanner.innerHTML = "";
  for (const row of stats.speedRows) {
    const endAt = getEndTime(row.watchSeconds, now);
    const rowEl = document.createElement("div");
    rowEl.className = "speed-card";
    rowEl.innerHTML = `
      <div class="speed-head">
        <span class="speed-badge">${row.speed}x</span>
        <span class="speed-finish">Finish in ${formatFinishIn(row.watchSeconds)} • ends at ${formatClockTime(endAt)}</span>
      </div>
      <div class="speed-metrics">
        <div class="metric-box">
          <p class="metric-label">Watch Time</p>
          <p class="metric-value">${formatDuration(row.watchSeconds)}</p>
        </div>
        <div class="metric-box">
          <p class="metric-label">Time Saved</p>
          <p class="metric-value">${formatDuration(row.savedSeconds)}</p>
        </div>
      </div>
    `;
    speedPlanner.appendChild(rowEl);
  }
}

function renderQuickInsights(stats, now = new Date()) {
  const normal = stats.speedRows.find((row) => row.speed === 1);
  const fastest = stats.speedRows[stats.speedRows.length - 1];
  const sweetSpot = stats.speedRows.find((row) => row.speed === 1.5) || stats.speedRows[1];
  const normalEnd = getEndTime(normal.watchSeconds, now);
  const sweetSpotEnd = getEndTime(sweetSpot.watchSeconds, now);

  quickInsights.innerHTML = `
    <article class="insight">
      <p class="insight-title">Normal Pace (1x)</p>
      <p class="insight-value">${formatDuration(normal.watchSeconds)} • ends ${formatClockTime(normalEnd)}</p>
    </article>
    <article class="insight">
      <p class="insight-title">Balanced Pick (${sweetSpot.speed}x)</p>
      <p class="insight-value">Finish in ${formatFinishIn(sweetSpot.watchSeconds)} • ends ${formatClockTime(sweetSpotEnd)}</p>
    </article>
    <article class="insight">
      <p class="insight-title">Fastest (${fastest.speed}x)</p>
      <p class="insight-value">Save ${formatDuration(fastest.savedSeconds)}</p>
    </article>
  `;
}

function renderVideoList(videos) {
  videoList.innerHTML = "";

  const fragment = document.createDocumentFragment();
  videos.forEach((video) => {
    const node = videoRowTemplate.content.cloneNode(true);
    const thumb = node.querySelector(".thumb");
    const title = node.querySelector(".video-title");
    const channel = node.querySelector(".video-channel");
    const duration = node.querySelector(".video-duration");
    const checkbox = node.querySelector(".include-checkbox");

    thumb.src = video.thumbnail;
    title.textContent = video.title;
    channel.textContent = video.channel;
    duration.textContent = formatDuration(video.durationSeconds);
    checkbox.dataset.videoId = video.id;
    checkbox.checked = selectedVideoIds.has(video.id);

    fragment.appendChild(node);
  });

  videoList.appendChild(fragment);
}

function getSelectedVideos() {
  return currentVideos.filter((video) => selectedVideoIds.has(video.id));
}

function updateSelectionHint(selectedCount, totalCount) {
  selectionHint.textContent = `Counting ${selectedCount} of ${totalCount} videos.`;
}

function refreshStatsFromSelection() {
  const selectedVideos = getSelectedVideos();
  const stats = calculateStats(selectedVideos);
  currentStats = stats;
  renderSummary(stats);
  renderSpeedPlanner(stats);
  renderQuickInsights(stats);
  updateSelectionHint(selectedVideos.length, currentVideos.length);
}

function onVideoToggle(event) {
  const checkbox = event.target;
  if (!checkbox.classList.contains("include-checkbox")) {
    return;
  }

  const videoId = checkbox.dataset.videoId;
  if (!videoId) {
    return;
  }

  if (checkbox.checked) {
    selectedVideoIds.add(videoId);
  } else {
    selectedVideoIds.delete(videoId);
  }

  refreshStatsFromSelection();
}

async function onAnalyze() {
  const playlistUrl = playlistUrlInput.value.trim();
  const apiKey = HARDCODED_API_KEY;

  if (!playlistUrl || !apiKey) {
    setStatus("Please provide a playlist URL and set your API key in script.js.", true);
    return;
  }

  const playlistId = parsePlaylistId(playlistUrl);
  if (!playlistId) {
    setStatus("Invalid playlist URL. Ensure it includes ?list=...", true);
    return;
  }

  analyzeBtn.disabled = true;
  setStatus("Fetching playlist data...");
  resultsSection.classList.add("hidden");

  try {
    const playlistItems = await fetchPlaylistItems(playlistId, apiKey);

    if (!playlistItems.length) {
      throw new Error("No videos found in playlist.");
    }

    const orderedVideoIds = playlistItems
      .map((item) => item.contentDetails?.videoId)
      .filter(Boolean);

    setStatus(`Found ${orderedVideoIds.length} videos. Fetching durations...`);
    const videoDetails = await fetchVideosByIds(orderedVideoIds, apiKey);

    const detailsById = new Map(videoDetails.map((item) => [item.id, item]));

    const videos = orderedVideoIds
      .map((id) => detailsById.get(id))
      .filter(Boolean)
      .map((item) => ({
        id: item.id,
        title: item.snippet?.title || "Untitled",
        channel: item.snippet?.channelTitle || "Unknown channel",
        thumbnail:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          "",
        durationSeconds: parseISODurationToSeconds(item.contentDetails?.duration || "PT0S")
      }));

    currentVideos = videos;
    selectedVideoIds = new Set(videos.map((video) => video.id));
    renderVideoList(currentVideos);
    refreshStatsFromSelection();

    resultsSection.classList.remove("hidden");

    const unavailableCount = orderedVideoIds.length - videos.length;
    if (unavailableCount > 0) {
      setStatus(
        `Loaded ${videos.length}/${orderedVideoIds.length} videos. ${unavailableCount} unavailable/private videos were skipped.`
      );
    } else {
      setStatus(`Done. Loaded ${videos.length} videos successfully.`);
    }
  } catch (error) {
    setStatus(error.message || "Something went wrong while fetching data.", true);
  } finally {
    analyzeBtn.disabled = false;
  }
}

function onClear() {
  playlistUrlInput.value = "";
  currentVideos = [];
  selectedVideoIds = new Set();
  currentStats = null;
  summaryCards.innerHTML = "";
  speedPlanner.innerHTML = "";
  quickInsights.innerHTML = "";
  videoList.innerHTML = "";
  selectionHint.textContent = "";
  setStatus("");
  resultsSection.classList.add("hidden");
}
