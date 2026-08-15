/**
 * StreamPulse - Search Page Script
 * Reads query parameter from ?q=QUERY or ?search=QUERY
 * Performs client-side filtering over GET /api/auth/get_videos
 */

const API_BASE_URL = "http://localhost:5001";

let currentUser = null;
let searchQuery = "";
let allVideos = [];

document.addEventListener("DOMContentLoaded", async () => {
    parseSearchQueryFromURL();
    setupEventListeners();
    await checkAuthentication();
    await fetchAndFilterVideos();
});

/**
 * Extract 'q' or 'search' query parameter from URL
 */
function parseSearchQueryFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    searchQuery = (urlParams.get("q") || urlParams.get("search") || "").trim();

    // Pre-fill header search input
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.value = searchQuery;
    }
}

/**
 * Event Listener Setup
 */
function setupEventListeners() {
    // Sidebar Mobile Toggle
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

    // Search Form Handler
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

    // Retry Button Handler
    document.getElementById("retry-btn")?.addEventListener("click", fetchAndFilterVideos);
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
 * Fetch video collection and filter by query on the frontend
 * Uses GET /api/auth/get_videos
 */
async function fetchAndFilterVideos() {
    showState("loading");

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/auth/search_videos?q=${encodeURIComponent(searchQuery)}`,
            {
                method: "GET",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include"
            }
        );

        if (response.status === 401) {
            showState("auth_required");
            return;
        }

        if (!response.ok) {
            throw new Error(
                `Server returned status code ${response.status}`
            );
        }

        const data = await response.json();

        allVideos = Array.isArray(data.videos)
            ? data.videos
            : [];

        const countEl = document.getElementById("results-count");

        if (countEl) {
            countEl.textContent =
                `About ${allVideos.length} result${allVideos.length === 1 ? "" : "s"} for "${searchQuery}"`;

            countEl.classList.remove("hidden");
        }

        if (allVideos.length === 0) {
            showState(
                "empty",
                `No video results found matching "${escapeHTML(searchQuery)}".`
            );
        } else {
            renderSearchResults(allVideos);
            showState("results");
        }

    } catch (err) {

        console.error("Search error:", err);

        showState(
            "error",
            "Unable to connect to the backend server."
        );
    }
}

/**
 * Execute client-side filtering over title, description, and category
 */


/**
 * Render Search Result Cards
 */
function renderSearchResults(videos) {
    const resultsList = document.getElementById("results-list");
    if (!resultsList) return;

    resultsList.innerHTML = videos.map(video => createSearchCardHTML(video)).join("");

    // Attach click listener to search cards
    resultsList.querySelectorAll(".search-card").forEach(card => {
        card.addEventListener("click", () => {
            const videoId = card.getAttribute("data-video-id");
            if (videoId) {
                window.location.href = `watch.html?id=${encodeURIComponent(videoId)}`;
            }
        });
    });
}

/**
 * HTML Template for a single horizontal Search Result Card
 */
function createSearchCardHTML(video) {
    const videoId = video._id || video.id || "";
    const title = escapeHTML(video.title || "Untitled Video");
    const thumbnail = video.thumbnailUrl || "https://via.placeholder.com/640x360?text=No+Thumbnail";
    const views = formatViews(video.views);
    const date = formatRelativeTime(video.createdAt);
    const category = escapeHTML(video.category || "General");
    const descriptionSnippet = escapeHTML(video.description || "No description provided.");
    const channelName = "Channel";

    return `
        <article class="search-card" data-video-id="${escapeHTML(videoId)}">
            <div class="search-thumb-container">
                <img src="${escapeHTML(thumbnail)}" alt="${title}" class="search-thumb-img" loading="lazy" onerror="this.src='https://via.placeholder.com/640x360?text=Image+Error';">
                <span class="duration-badge" title="BACKEND REQUIRED: Video Duration">--:--</span>
            </div>
            <div class="search-details">
                <h2 class="search-title" title="${title}">${title}</h2>
                <div class="search-meta">
                    <span>${views}</span> • <span>${date}</span>
                    <span class="category-tag">${category}</span>
                </div>
                <div class="search-channel-row">
                    <div class="channel-avatar-sm">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </div>
                    <span class="channel-name" title="BACKEND REQUIRED: Channel name resolution">${escapeHTML(channelName)}</span>
                </div>
                <p class="search-description-snippet">${descriptionSnippet}</p>
            </div>
        </article>
    `;
}

/**
 * UI State Manager
 */
function showState(state, message = "") {
    const skeletonContainer = document.getElementById("skeleton-container");
    const resultsList = document.getElementById("results-list");
    const emptyState = document.getElementById("empty-state");
    const authState = document.getElementById("auth-required-state");
    const errorState = document.getElementById("error-state");

    skeletonContainer?.classList.add("hidden");
    resultsList?.classList.add("hidden");
    emptyState?.classList.add("hidden");
    authState?.classList.add("hidden");
    errorState?.classList.add("hidden");

    if (state === "loading") {
        skeletonContainer?.classList.remove("hidden");
    } else if (state === "results") {
        resultsList?.classList.remove("hidden");
    } else if (state === "empty") {
        if (emptyState) {
            const msgEl = document.getElementById("empty-message");
            if (msgEl && message) msgEl.textContent = message;
            emptyState.classList.remove("hidden");
        }
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
 * Render Header Login Button
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
 * Render Header User Menu
 */
function renderUserMenu(user) {
    const headerAuthSection = document.getElementById("header-auth-section");
    if (!headerAuthSection) return;

    const userInitial = user.name ? user.name.charAt(0).toUpperCase() : "U";

    headerAuthSection.innerHTML = `
        <div class="user-profile-menu">
            <button id="user-avatar-btn" class="avatar-btn">${userInitial}</button>
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
 * Format View Count Helper
 */
function formatViews(views) {
    const num = Number(views) || 0;
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M views";
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K views";
    return `${num} view${num === 1 ? "" : "s"}`;
}

/**
 * Format Relative Date Helper
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
 * XSS Prevention Helper
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
