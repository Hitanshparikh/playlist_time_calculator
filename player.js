const playlistUrlInput = document.getElementById("playlistUrl");
const pasteBtn = document.getElementById("pasteBtn");
const loadBtn = document.getElementById("loadBtn");
const statusEl = document.getElementById("status");
const marathonSection = document.getElementById("marathonSection");
const chaptersEl = document.getElementById("chapters");
const nowPlayingEl = document.getElementById("nowPlaying");
const globalProgressEl = document.getElementById("globalProgress");

const HARDCODED_API_KEY = "AIzaSyAvoM4cMirD_aNLXel9zDv0DcHK6xNnbto";

let player = null;
let playerReady = false;
let videos = [];
let activeIndex = 0;
let progressTimerId = null;

pasteBtn.addEventListener("click", onPastePlaylistUrl);
loadBtn.addEventListener("click", onLoadPlaylist);

window.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
  playerReady = true;
};

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

function formatClock(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function batch(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
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
  } catch {
    setStatus("Paste failed. Allow clipboard access or paste manually.", true);
  }
}

async function fetchPlaylistItems(playlistId) {
  const items = [];
  let nextPageToken = "";

  while (true) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("key", HARDCODED_API_KEY);
    if (nextPageToken) {
      url.searchParams.set("pageToken", nextPageToken);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch playlist items.");
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

async function fetchVideoDetails(videoIds) {
  const chunks = batch(videoIds, 50);
  const responses = await Promise.all(
    chunks.map(async (idsChunk) => {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "contentDetails,snippet");
      url.searchParams.set("id", idsChunk.join(","));
      url.searchParams.set("maxResults", "50");
      url.searchParams.set("key", HARDCODED_API_KEY);

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

function computeStarts(videosList) {
  let running = 0;
  return videosList.map((video) => {
    const startedAt = running;
    running += video.durationSeconds;
    return {
      ...video,
      startedAt
    };
  });
}

function getTotalDuration() {
  return videos.reduce((sum, item) => sum + item.durationSeconds, 0);
}

function syncActiveIndexFromPlayer() {
  if (!player || !videos.length || typeof player.getPlaylistIndex !== "function") {
    return;
  }

  const playlistIndex = Number(player.getPlaylistIndex());
  if (Number.isFinite(playlistIndex) && playlistIndex >= 0 && playlistIndex < videos.length) {
    if (playlistIndex !== activeIndex) {
      activeIndex = playlistIndex;
      renderChapters();
    }
  }
}

function getGlobalElapsed() {
  if (!player || !videos.length) {
    return 0;
  }

  syncActiveIndexFromPlayer();
  const localElapsed = Number(player.getCurrentTime?.() || 0);
  return (videos[activeIndex]?.startedAt || 0) + localElapsed;
}

function renderChapters() {
  chaptersEl.innerHTML = "";
  const fragment = document.createDocumentFragment();

  videos.forEach((video, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chapter-item";
    if (index === activeIndex) {
      button.classList.add("active");
    }

    button.innerHTML = `
      <span class="chapter-time">${formatClock(video.startedAt)}</span>
      <span class="chapter-title">${video.title}</span>
      <span class="chapter-duration">${formatClock(video.durationSeconds)}</span>
    `;

    button.addEventListener("click", () => {
      jumpToChapter(index, 0);
    });

    fragment.appendChild(button);
  });

  chaptersEl.appendChild(fragment);
}

function updateLiveProgress() {
  if (!videos.length) {
    return;
  }

  syncActiveIndexFromPlayer();

  const currentVideo = videos[activeIndex];
  nowPlayingEl.textContent = `Now playing: ${currentVideo.title}`;

  const elapsed = getGlobalElapsed();
  const total = getTotalDuration();
  globalProgressEl.textContent = `${formatClock(elapsed)} / ${formatClock(total)}`;
}

function startProgressTimer() {
  if (progressTimerId) {
    clearInterval(progressTimerId);
  }

  updateLiveProgress();
  progressTimerId = setInterval(() => {
    updateLiveProgress();
  }, 500);
}

function stopProgressTimer() {
  if (progressTimerId) {
    clearInterval(progressTimerId);
    progressTimerId = null;
  }
}

function jumpToChapter(index, offsetSeconds) {
  if (!player || !videos[index]) {
    return;
  }

  activeIndex = index;
  if (typeof player.playVideoAt === "function") {
    player.playVideoAt(index);
  }
  if (offsetSeconds > 0 && typeof player.seekTo === "function") {
    player.seekTo(offsetSeconds, true);
  }
  renderChapters();
  updateLiveProgress();
}

function createOrReplacePlayer(playlistId, startIndex = 0) {
  if (!playerReady || !window.YT || !window.YT.Player) {
    throw new Error("YouTube player is still loading. Try again in a moment.");
  }

  if (player && typeof player.destroy === "function") {
    player.destroy();
  }

  player = new window.YT.Player("player", {
    videoId: videos[startIndex]?.id,
    playerVars: {
      autoplay: 1,
      controls: 1,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      listType: "playlist",
      list: playlistId,
      index: startIndex
    },
    events: {
      onReady: () => {
        syncActiveIndexFromPlayer();
        renderChapters();
        player.playVideo();
        updateLiveProgress();
      },
      onStateChange: (event) => {
        syncActiveIndexFromPlayer();

        if (event.data === window.YT.PlayerState.ENDED) {
          const currentIdx = Number(player.getPlaylistIndex?.() ?? activeIndex);
          const total = Number(player.getPlaylist?.().length || videos.length);
          if (currentIdx >= total - 1) {
            stopProgressTimer();
            setStatus("Playlist finished.");
          }
        }

        updateLiveProgress();
      }
    }
  });
}

async function onLoadPlaylist() {
  const playlistUrl = playlistUrlInput.value.trim();

  if (!playlistUrl) {
    setStatus("Please paste a playlist URL.", true);
    return;
  }

  if (!HARDCODED_API_KEY) {
    setStatus("Set HARDCODED_API_KEY in player.js first.", true);
    return;
  }

  const playlistId = parsePlaylistId(playlistUrl);
  if (!playlistId) {
    setStatus("Invalid playlist URL. Ensure it includes ?list=...", true);
    return;
  }

  loadBtn.disabled = true;
  setStatus("Loading playlist...");

  try {
    const playlistItems = await fetchPlaylistItems(playlistId);
    if (!playlistItems.length) {
      throw new Error("No videos found in playlist.");
    }

    const orderedIds = playlistItems
      .map((item) => item.contentDetails?.videoId)
      .filter(Boolean);

    const details = await fetchVideoDetails(orderedIds);
    const byId = new Map(details.map((item) => [item.id, item]));

    const orderedVideos = orderedIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((item) => ({
        id: item.id,
        title: item.snippet?.title || "Untitled",
        durationSeconds: parseISODurationToSeconds(item.contentDetails?.duration || "PT0S")
      }));

    videos = computeStarts(orderedVideos);
    activeIndex = 0;

    renderChapters();
    createOrReplacePlayer(playlistId, 0);
    startProgressTimer();

    marathonSection.classList.remove("hidden");

    const skipped = orderedIds.length - videos.length;
    if (skipped > 0) {
      setStatus(`Loaded ${videos.length} videos. ${skipped} unavailable/private videos were skipped.`);
    } else {
      setStatus(`Loaded ${videos.length} videos. Playing now.`);
    }
  } catch (error) {
    setStatus(error.message || "Could not load playlist.", true);
  } finally {
    loadBtn.disabled = false;
  }
}
