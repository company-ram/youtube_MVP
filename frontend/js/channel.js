/**
 * StreamPulse - Channel Page View Script
 * Reads ?id=CHANNEL_ID from URL
 * Fetches video list from GET /api/auth/get_videos using credentials: "include"
 * Filters videos matching video.channelId === CHANNEL_ID
 */

const API_BASE_URL = "http://localhost:5001";

let currentUser = null;
let currentChannelId = "";
let channelVideos = [];
let allVideos = [];

document.addEventListener("DOMContentLoaded", async () => {
    parseChannelIdFromURL();
    setupEventListeners();
    await checkAuthentication();
    await loadChannelData();
});

/**
 * Extract 'id' query parameter from URL
 */
function parseChannelIdFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    currentChannelId = (urlParams.get("id") || "").trim();
}

/**
 * DOM Event Listeners Registration
 */
function setupEventListeners() {
    // Sidebar Mobile Drawer Toggle
    const sidebarToggleBtn = document.getElementById("sidebar-toggle");
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebar-overlay");

    if (sidebarToggleBtn && sidebar && sidebarOverlay) {
        sidebarToggleBtn.addEventListener("click", () => {
            sidebar.classList.toggle("mobile-open");
            sidebarOverlay.classList.toggle("active");
        });

        sidebarOverlay.addEventListener("click", () => {
            sidebar.classList.remove("mobile-open");
            sidebarOverlay.classList.remove("active");
        });
    }

    // Header Search Handler
    const searchForm = document.getElementById("search-form");
    if (searchForm) {
        searchForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const query = document.getElementById("search-input")?.value.trim();
            if (query) {
                window.location.href = `search.html?q=${encodeURIComponent(query)}`;
            }
        });
    }

    // Subscribe Button Handler
    const subscribeBtn = document.getElementById("subscribe-btn");
    if (subscribeBtn) {
        subscribeBtn.addEventListener("click", () => {
            alert("BACKEND REQUIRED: Subscription system endpoint is not implemented on the backend.");
        });
    }

    // Tab Switcher Handler
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const tabTarget = btn.getAttribute("data-tab");
            switchTab(tabTarget);
        });
    });

    // Retry Button Handler
    document.getElementById("retry-btn")?.addEventListener("click", loadChannelData);
}

/**
 * Switch Tab Content View (Videos vs About)
 */
function switchTab(tabName) {
    const videosContent = document.getElementById("tab-content-videos");
    const aboutContent = document.getElementById("tab-content-about");

    if (tabName === "about") {
        videosContent?.classList.add("hidden");
        aboutContent?.classList.remove("hidden");
    } else {
        aboutContent?.classList.add("hidden");
        videosContent?.classList.remove("hidden");
    }
}

/**
 * Check User Session via GET /api/auth/me
 */
async function checkAuthentication() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include"
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.authenticated && data.user) {
                currentUser = data.user;
                renderUserMenu(data.user);
                return;
            }
        }
        renderLoginButton();
    } catch (err) {
        console.warn("Auth check error:", err);
        renderLoginButton();
    }
}

/**
 * Fetch Video Collection and filter by channelId
 * Uses GET /api/auth/get_videos
 */
async function loadChannelData() {
    if (!currentChannelId) {
        showState("error", "No channel ID provided in the URL query string (?id=CHANNEL_ID).");
        return;
    }

    showState("loading");

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/get_videos`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include"
        });

        if (response.status === 401) {
            showState("auth_required");
            return;
        }

        if (!response.ok) {
            throw new Error(`Server returned status code ${response.status}`);
        }

        const data = await response.json();

        if (Array.isArray(data)) {
            allVideos = data;
        } else if (data && Array.isArray(data.videos)) {
            allVideos = data.videos;
        } else {
            allVideos = [];
        }

        // Filter videos matching video.channelId === CHANNEL_ID
        channelVideos = allVideos.filter(v => String(v.channelId) === String(currentChannelId));

        renderChannelHeaderInfo();
        renderChannelVideos();
        renderAboutTabInfo();

        showState("loaded");
    } catch (err) {
        console.error("Error loading channel data:", err);
        showState("error", "Unable to load channel content from the backend server.");
    }
}

/**
 * Render Header Channel Information
 */
function renderChannelHeaderInfo() {
    const titleEl = document.getElementById("channel-title");
    const videoCountEl = document.getElementById("channel-video-count");
    const descSnippetEl = document.getElementById("channel-header-desc");

    // Infer channel name from video metadata if present, else fallback
    let detectedName = "Channel " + currentChannelId.substring(0, 8);
    let detectedDesc = "No description provided for this channel.";

    if (channelVideos.length > 0) {
        const first = channelVideos[0];
        if (first.channelName) detectedName = first.channelName;
        else if (first.channel_name) detectedName = first.channel_name;

        if (first.description) detectedDesc = first.description;
    }

    if (titleEl) titleEl.textContent = detectedName;
    if (videoCountEl) videoCountEl.textContent = `${channelVideos.length} video${channelVideos.length === 1 ? "" : "s"}`;
    if (descSnippetEl) descSnippetEl.textContent = detectedDesc;

    document.title = `${detectedName} - StreamPulse`;
}

/**
 * Render Video Grid inside Videos Tab
 */
function renderChannelVideos() {
    const videoGrid = document.getElementById("channel-video-grid");
    const emptyState = document.getElementById("channel-videos-empty");

    if (!videoGrid) return;

    if (channelVideos.length === 0) {
        videoGrid.classList.add("hidden");
        emptyState?.classList.remove("hidden");
        return;
    }

    emptyState?.classList.add("hidden");
    videoGrid.classList.remove("hidden");

    videoGrid.innerHTML = channelVideos.map(video => createVideoCardHTML(video)).join("");

    videoGrid.querySelectorAll(".video-card").forEach(card => {
        card.addEventListener("click", () => {
            const videoId = card.getAttribute("data-video-id");
            if (videoId) {
                window.location.href = `watch.html?id=${encodeURIComponent(videoId)}`;
            }
        });
    });
}

/**
 * Template for Video Card inside Channel Grid
 */
function createVideoCardHTML(video) {
    const videoId = video._id || video.id || "";
    const title = escapeHTML(video.title || "Untitled Video");
    const thumbnail = video.thumbnailUrl || "https://via.placeholder.com/640x360?text=No+Thumbnail";
    const views = formatViews(video.views);
    const time = formatRelativeTime(video.createdAt || video.created_at);
    const category = escapeHTML(video.category || "General");

    return `
        <article class="video-card" data-video-id="${escapeHTML(videoId)}">
            <div class="thumbnail-container">
                <img src="${escapeHTML(thumbnail)}" alt="${title}" class="thumbnail-img" loading="lazy" onerror="this.src='https://via.placeholder.com/640x360?text=Image+Error';">
                <span class="duration-badge" title="BACKEND REQUIRED: Video Duration">--:--</span>
            </div>
            <div class="video-details">
                <div class="video-info">
                    <h3 class="video-title" title="${title}">${title}</h3>
                    <div class="video-meta">
                        <span>${views}</span> • <span>${time}</span>
                    </div>
                    <div class="video-category-tag">${category}</div>
                </div>
            </div>
        </article>
    `;
}

/**
 * Render About Tab Stats & Channel Metadata
 */
function renderAboutTabInfo() {
    const aboutChannelIdEl = document.getElementById("about-channel-id");
    const aboutDescEl = document.getElementById("about-description");
    const totalViewsEl = document.getElementById("about-total-views");
    const totalVideosEl = document.getElementById("about-total-videos");

    const totalViews = channelVideos.reduce((acc, curr) => acc + (Number(curr.views) || 0), 0);

    if (aboutChannelIdEl) aboutChannelIdEl.textContent = currentChannelId;
    if (totalViewsEl) totalViewsEl.textContent = formatViews(totalViews);
    if (totalVideosEl) totalVideosEl.textContent = `${channelVideos.length} video${channelVideos.length === 1 ? "" : "s"}`;

    if (channelVideos.length > 0 && channelVideos[0].description) {
        if (aboutDescEl) aboutDescEl.textContent = channelVideos[0].description;
    }
}

/**
 * State Manager for Channel Workspace
 */
function showState(state, message = "") {
    const skeleton = document.getElementById("channel-skeleton");
    const container = document.getElementById("channel-container");
    const authState = document.getElementById("auth-required-state");
    const errorState = document.getElementById("error-state");

    skeleton?.classList.add("hidden");
    container?.classList.add("hidden");
    authState?.classList.add("hidden");
    errorState?.classList.add("hidden");

    if (state === "loading") {
        skeleton?.classList.remove("hidden");
    } else if (state === "loaded") {
        container?.classList.remove("hidden");
    } else if (state === "auth_required") {
        authState?.classList.remove("hidden");
    } else if (state === "error") {
        if (errorState) {
            const msgEl = document.getElementById("error-message");
            if (msgEl && message) msgEl.textContent = message;
            errorState.classList.remove("hidden");
        }
    }
}

/**
 * Header Unauthenticated State
 */
function renderLoginButton() {
    const headerAuthSection = document.getElementById("header-auth-section");
    if (!headerAuthSection) return;

    headerAuthSection.innerHTML = `
        <a href="login.html" class="btn btn-outline">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Sign In
        </a>
    `;
}

/**
 * Header Authenticated State
 */
function renderUserMenu(user) {
    const headerAuthSection = document.getElementById("header-auth-section");
    if (!headerAuthSection) return;

    const userInitial = user.name ? user.name.charAt(0).toUpperCase() : "U";

    headerAuthSection.innerHTML = `
        <div class="user-profile-menu">
            <button id="user-avatar-btn" class="avatar-btn" aria-label="User Menu">${userInitial}</button>
            <div id="user-dropdown" class="user-dropdown hidden">
                <div class="dropdown-header">
                    <div class="dropdown-user-name">${escapeHTML(user.name || "User")}</div>
                    <div class="dropdown-user-email">${escapeHTML(user.email || "")}</div>
                </div>
                <a href="create-channel.html" class="dropdown-item">Create Channel</a>
                <a href="upload.html" class="dropdown-item">Upload Video</a>
            </div>
        </div>
    `;

    const avatarBtn = document.getElementById("user-avatar-btn");
    const dropdown = document.getElementById("user-dropdown");
    if (avatarBtn && dropdown) {
        avatarBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            dropdown.classList.toggle("hidden");
        });
        document.addEventListener("click", () => dropdown.classList.add("hidden"));
    }
}

/**
 * Format View Count
 */
function formatViews(views) {
    const num = Number(views) || 0;
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M views";
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K views";
    return `${num} view${num === 1 ? "" : "s"}`;
}

/**
 * Format ISO Date
 */
function formatRelativeTime(dateString) {
    if (!dateString) return "Recently";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Recently";

    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return `${interval} year${interval === 1 ? "" : "s"} ago`;
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) return `${interval} month${interval === 1 ? "" : "s"} ago`;
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) return `${interval} day${interval === 1 ? "" : "s"} ago`;
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) return `${interval} hour${interval === 1 ? "" : "s"} ago`;
    interval = Math.floor(seconds / 60);
    if (interval >= 1) return `${interval} minute${interval === 1 ? "" : "s"} ago`;
    return "Just now";
}

/**
 * XSS Security Helper
 */
function escapeHTML(str) {
    if (typeof str !== "string") return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}