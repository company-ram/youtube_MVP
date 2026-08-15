/**
 * StreamPulse - Home Page Script
 * Pure Vanilla JavaScript using Fetch API with credentials: "include"
 */

// Single configurable Backend API Base URL
const API_BASE_URL = "http://localhost:5001";

// Global State Management
let currentUser = null;
let allVideos = [];
let userCategories = []; // categories the user likes / has searched before
let activeCategory = "All";
let searchQuery = "";

// Initialize App
document.addEventListener("DOMContentLoaded", async () => {
    setupEventListeners();
    await checkAuthentication();
    await fetchVideos();
});

/**
 * Setup DOM event listeners
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

    // Category Bar Filter Click Handling
    const categoryBar = document.getElementById("category-bar");
    if (categoryBar) {
        categoryBar.addEventListener("click", (e) => {
            if (e.target.classList.contains("chip")) {
                document.querySelectorAll(".chip").forEach(chip => chip.classList.remove("active"));
                e.target.classList.add("active");
                activeCategory = e.target.getAttribute("data-category") || "All";
                applyFiltersAndRender();
            }
        });
    }

    // Search Form Handler
    const searchForm = document.getElementById("search-form");
    const searchInput = document.getElementById("search-input");
    if (searchForm && searchInput) {
        searchForm.addEventListener("submit", (e) => {
            e.preventDefault();
            searchQuery = searchInput.value.trim().toLowerCase();
            applyFiltersAndRender();
        });
    }

    // Retry Button Handler for Error State
    const retryBtn = document.getElementById("retry-btn");
    if (retryBtn) {
        retryBtn.addEventListener("click", fetchVideos);
    }
}

/**
 * Check User Authentication Status
 * Uses GET /api/auth/me
 */
async function checkAuthentication() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            },
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
        console.warn("Auth check error or unauthenticated:", err);
        renderLoginButton();
    }
}

/**
 * Render Header User Dropdown Menu when Authenticated
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
                <a href="#" id="logout-btn" class="dropdown-item" title="BACKEND REQUIRED: Logout Endpoint">
                    Log Out <span class="badge-backend">Req</span>
                </a>
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

        document.addEventListener("click", () => {
            dropdown.classList.add("hidden");
        });
    }

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            alert("BACKEND REQUIRED: Log out API endpoint is not provided on the backend.");
        });
    }
}

/**
 * Render Header Login Button when Unauthenticated
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
 * Fetch Video Grid Data
 * Uses GET /api/auth/get_videos
 */
async function fetchVideos() {
    showState("loading");

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/get_videos`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include"
        });

        // Specific 401 Unauthorized Handling
        if (response.status === 401) {
            console.warn("GET /api/auth/get_videos returned 401 Unauthorized. User is not logged in.");
            showState("auth_required");
            return;
        }

        if (!response.ok) {
            throw new Error(`Server returned status code ${response.status}`);
        }

        const data = await response.json();

        if (Array.isArray(data)) {
            allVideos = data;
            userCategories = [];
        } else if (data && Array.isArray(data.videos)) {
            allVideos = data.videos;
            userCategories = Array.isArray(data.preferredCategories) ? data.preferredCategories : [];
        } else {
            allVideos = [];
            userCategories = [];
        }

        applyFiltersAndRender();
    } catch (err) {
        console.error("Error fetching videos:", err);
        showState("error", "Could not connect to the backend server or failed to load videos.");
    }
}

/**
 * Filter videos based on active category and search query, then trigger render.
 *
 * Behavior:
 * - Default view ("All" category, no search typed): show ONLY videos
 *   whose category is one of the user's preferred categories (liked or
 *   searched before). This keeps the main feed focused on their taste.
 * - As soon as the user picks a specific category chip, or types a
 *   search query, we intentionally stop restricting to their taste and
 *   show everything that matches - this is how they discover videos and
 *   categories they haven't interacted with yet.
 */
function applyFiltersAndRender() {
    let filtered = [...allVideos];

    const isDefaultView = activeCategory === "All" && !searchQuery;

    if (isDefaultView) {
        if (userCategories.length > 0) {
            filtered = filtered.filter(video =>
                video.category && userCategories.includes(video.category)
            );
        }
        // If the user has no preferred categories yet (brand new
        // account), there is nothing to restrict to, so we simply show
        // the discovery feed the backend already ranked for them.
    } else {
        if (activeCategory !== "All") {
            filtered = filtered.filter(video =>
                video.category && video.category.toLowerCase() === activeCategory.toLowerCase()
            );
        }

        if (searchQuery) {
            filtered = filtered.filter(video =>
                (video.title && video.title.toLowerCase().includes(searchQuery)) ||
                (video.description && video.description.toLowerCase().includes(searchQuery))
            );
        }
    }

    if (filtered.length === 0) {
        let msg;
        if (searchQuery) {
            msg = `No videos match your search query "${escapeHTML(searchQuery)}".`;
        } else if (isDefaultView) {
            msg = `No videos match your interests yet. Try exploring a category above!`;
        } else {
            msg = `No videos found in the "${escapeHTML(activeCategory)}" category.`;
        }
        showState("empty", msg);
    } else {
        renderVideoGrid(filtered);
        showState("grid");
    }
}

/**
 * Render Video Cards into Grid Container
 */
function renderVideoGrid(videos) {
    const videoGrid = document.getElementById("video-grid");
    if (!videoGrid) return;

    videoGrid.innerHTML = videos.map(video => createVideoCardHTML(video)).join("");

    const cards = videoGrid.querySelectorAll(".video-card");
    cards.forEach(card => {
        card.addEventListener("click", () => {
            const videoId = card.getAttribute("data-video-id");
            if (videoId) {
                window.location.href = `watch.html?id=${encodeURIComponent(videoId)}`;
            }
        });
    });
}

/**
 * Generate HTML String for a single Video Card
 */
function createVideoCardHTML(video) {
    const videoId = video._id || video.id || "";
    const title = escapeHTML(video.title || "Untitled Video");
    const thumbnail = video.thumbnailUrl || "https://via.placeholder.com/640x360?text=No+Thumbnail";
    const viewsFormatted = formatViews(video.views);
    const timeFormatted = formatRelativeTime(video.createdAt);
    const channelName = "Channel"; 

    return `
        <article class="video-card" data-video-id="${escapeHTML(videoId)}">
            <div class="thumbnail-container">
                <img src="${escapeHTML(thumbnail)}" alt="${title}" class="thumbnail-img" loading="lazy" onerror="this.src='https://via.placeholder.com/640x360?text=Image+Error';">
                <span class="duration-badge" title="BACKEND REQUIRED: Video Duration">--:--</span>
            </div>
            <div class="video-details">
                <div class="channel-avatar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                </div>
                <div class="video-info">
                    <h3 class="video-title" title="${title}">${title}</h3>
                    <div class="channel-name" title="BACKEND REQUIRED: Channel name resolution endpoint">${escapeHTML(channelName)}</div>
                    <div class="video-meta">
                        <span>${viewsFormatted}</span> • <span>${timeFormatted}</span>
                    </div>
                </div>
            </div>
        </article>
    `;
}

/**
 * State display manager
 */
function showState(state, message = "") {
    const skeletonContainer = document.getElementById("skeleton-container");
    const emptyState = document.getElementById("empty-state");
    const errorState = document.getElementById("error-state");
    const authRequiredState = document.getElementById("auth-required-state");
    const videoGrid = document.getElementById("video-grid");

    skeletonContainer?.classList.add("hidden");
    emptyState?.classList.add("hidden");
    errorState?.classList.add("hidden");
    authRequiredState?.classList.add("hidden");
    videoGrid?.classList.add("hidden");

    if (state === "loading") {
        skeletonContainer?.classList.remove("hidden");
    } else if (state === "auth_required") {
        authRequiredState?.classList.remove("hidden");
    } else if (state === "empty") {
        if (emptyState) {
            const msgEl = document.getElementById("empty-message");
            if (msgEl && message) msgEl.textContent = message;
            emptyState.classList.remove("hidden");
        }
    } else if (state === "error") {
        if (errorState) {
            const msgEl = document.getElementById("error-message");
            if (msgEl && message) msgEl.textContent = message;
            errorState.classList.remove("hidden");
        }
    } else if (state === "grid") {
        videoGrid?.classList.remove("hidden");
    }
}

/**
 * Utility: Format view count
 */
function formatViews(views) {
    const num = Number(views) || 0;
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M views";
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K views";
    }
    return `${num} view${num === 1 ? "" : "s"}`;
}

/**
 * Utility: Format ISO Date into relative time ago
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
 * Utility: Escape HTML
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