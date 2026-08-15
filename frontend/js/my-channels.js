/**
 * StreamPulse - My Channels Page Script
 * Connects to GET /api/auth/get_channels using credentials: "include"
 */

const API_BASE_URL = "http://localhost:5001";

let currentUser = null;

document.addEventListener("DOMContentLoaded", async () => {
    setupEventListeners();
    await checkAuthentication();
    await fetchYourChannels();
});

/**
 * Setup DOM Event Listeners
 */
function setupEventListeners() {
    // Mobile Sidebar Drawer Toggle
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

    // Header Search Form Handler
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
    document.getElementById("retry-btn")?.addEventListener("click", fetchYourChannels);
}

/**
 * Verify User Authentication Session via GET /api/auth/me
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
        window.location.href = "login.html";
    } catch (err) {
        console.warn("Auth check error:", err);
        window.location.href = "login.html";
    }
}

/**
 * Fetch Channel Details via GET /api/auth/get_channels
 */
async function fetchYourChannels() {
    showState("loading");

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/get_channels`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include"
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success && data.channel) {
            renderChannelsList([data.channel]);
            showState("content");
        } else if (response.status === 401 || !data.channel) {
            // User does not have an active channel_token cookie / no channel created
            showState("no_channels");
        } else {
            showState("error", data.message || "Failed to load channel details.");
        }
    } catch (err) {
        console.error("Fetch channels error:", err);
        showState("error", "Unable to connect to the backend server.");
    }
}

/**
 * Render Channel Card List
 */
function renderChannelsList(channels) {
    const listContainer = document.getElementById("channels-list");
    if (!listContainer) return;

    listContainer.innerHTML = channels.map(channel => createChannelCardHTML(channel)).join("");
}

/**
 * Template for Channel Item Card
 */
function createChannelCardHTML(channel) {
    const channelId = channel._id || channel.id || "";
    const name = escapeHTML(channel.name || "Untitled Channel");
    const description = escapeHTML(channel.description || "No description provided.");
    const dateFormatted = formatRelativeTime(channel.createdAt);
    const initial = name.charAt(0).toUpperCase() || "C";

    return `
        <article class="my-channel-card">
            <div class="channel-card-avatar">${initial}</div>
            <div class="channel-card-info">
                <h2 class="channel-card-title">${name}</h2>
                <div class="channel-card-meta">Created ${dateFormatted}</div>
                <p class="channel-card-description">${description}</p>
                <div class="channel-card-actions">
                    <a href="channel.html?id=${encodeURIComponent(channelId)}" class="btn btn-primary">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        View Channel
                    </a>
                    <a href="upload.html" class="btn btn-outline">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        Upload Video
                    </a>
                </div>
            </div>
        </article>
    `;
}

/**
 * State View Switcher
 */
function showState(state, message = "") {
    const loadingState = document.getElementById("loading-state");
    const contentState = document.getElementById("content-state");
    const noChannelsState = document.getElementById("no-channels-state");
    const errorState = document.getElementById("error-state");

    loadingState?.classList.add("hidden");
    contentState?.classList.add("hidden");
    noChannelsState?.classList.add("hidden");
    errorState?.classList.add("hidden");

    if (state === "loading") {
        loadingState?.classList.remove("hidden");
    } else if (state === "content") {
        contentState?.classList.remove("hidden");
    } else if (state === "no_channels") {
        noChannelsState?.classList.remove("hidden");
    } else if (state === "error") {
        if (errorState) {
            const msgEl = document.getElementById("error-message");
            if (msgEl && message) msgEl.textContent = message;
            errorState.classList.remove("hidden");
        }
    }
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
            <button id="user-avatar-btn" class="avatar-btn" aria-label="User Menu">${userInitial}</button>
            <div id="user-dropdown" class="user-dropdown hidden">
                <div class="dropdown-header">
                    <div class="dropdown-user-name">${escapeHTML(user.name || "User")}</div>
                    <div class="dropdown-user-email">${escapeHTML(user.email || "")}</div>
                </div>
                <a href="my-channels.html" class="dropdown-item">My Channels</a>
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
 * Format Relative Date
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
 * XSS Helper
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