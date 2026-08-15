/**
 * StreamPulse - Video Watch Page Script
 * Reads video ID from window.location.search (?id=VIDEO_ID)
 * Fetches video list from GET /api/auth/get_videos using credentials: "include"
 * Sends Likes to POST /api/auth/likes and stores state in LocalStorage
 */

const API_BASE_URL = "http://localhost:5001";
const STORAGE_LIKED_KEY = "sp_liked_videos";

let currentUser = null;
let currentVideoId = "";
let currentVideo = null;
let allVideos = [];

document.addEventListener("DOMContentLoaded", async () => {
    parseVideoIdFromURL();
    setupEventListeners();
    await checkAuthentication();
    await loadVideoData();
});

/**
 * استخراج الـ ID من رابط الصفحة
 */
function parseVideoIdFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    currentVideoId = urlParams.get("id");
}

/**
 * =========================================================================
 * دوال التخزين المحلي (LocalStorage) للإعجابات
 * =========================================================================
 */

// جلب قائمة الفيديوهات المعجب بها من التخزين المحلي
function getLikedVideos() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_LIKED_KEY) || "[]");
    } catch (e) {
        console.error("Error reading liked videos from localStorage:", e);
        return [];
    }
}

// فحص هل تم الإعجاب بالفيديو مسبقاً
function isVideoLiked(videoId) {
    if (!videoId) return false;
    const likedList = getLikedVideos();
    return likedList.includes(String(videoId));
}

// حفظ الفيديو في التخزين المحلي
function saveLikedVideo(videoId) {
    if (!videoId) return;
    const likedList = getLikedVideos();
    if (!likedList.includes(String(videoId))) {
        likedList.push(String(videoId));
        localStorage.setItem(STORAGE_LIKED_KEY, JSON.stringify(likedList));
    }
}

/**
 * تحديث شكل ولون زر اللايك في الواجهة
 * يجعل الخلفية بيضاء والنص/الأيقونة بلون داكن
 */
function updateLikeButtonUI(isLiked) {
    const likeBtn = document.getElementById("like-btn");
    const likeIcon = document.getElementById("like-icon") || likeBtn?.querySelector("svg");
    const likeText = document.getElementById("like-text") || likeBtn?.querySelector("span");

    if (!likeBtn) return;

    if (isLiked) {
        likeBtn.classList.add("liked");
        likeBtn.setAttribute("title", "Liked");
        if (likeText) likeText.textContent = "Liked";
        if (likeIcon) {
            likeIcon.setAttribute("fill", "currentColor");
        }
    } else {
        likeBtn.classList.remove("liked");
        likeBtn.setAttribute("title", "Like Video");
        if (likeText) likeText.textContent = "Like";
        if (likeIcon) {
            likeIcon.setAttribute("fill", "none");
        }
    }
}

/**
 * معالجة الضغط على زر الإعجاب وإرسال الطلب إلى الـ API
 */
/**
 * Handle Like Button Click & Send API Request
 */
async function handleLikeClick() {
    // 1. استخراج معرّف الفيديو
    const validVideoId = currentVideo?._id || currentVideo?.id || currentVideoId;

    if (!validVideoId) {
        showToast("Error: Video ID not found.");
        return;
    }

    // 2. التحقق من LocalStorage لمنع التكرار
    if (isVideoLiked(validVideoId)) {
        showToast("You have already liked this video!");
        return;
    }

    const likeBtn = document.getElementById("like-btn");
    if (likeBtn) likeBtn.disabled = true;

    try {
        const videoCategory = currentVideo?.category || "General";

        // 3. إعداد البيانات بالاسم المتطابق مع الباك إند (video_id)
        const payload = {
            video_id: String(validVideoId), // تم التعديل إلى video_id
            category: String(videoCategory)
        };

        const response = await fetch(`${API_BASE_URL}/api/auth/likes`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include", // لإرسال الكوكيز (token) للباك إند
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success) {
            // 4. الحفظ في LocalStorage
            saveLikedVideo(validVideoId);

            // 5. تحويل لون الزر للأبيض
            updateLikeButtonUI(true);

            showToast(data.message || "Added like successfully!");
        } else {
            if (response.status === 401) {
                showToast(data.message || "Please sign in to like this video.");
            } else if (response.status === 409) {
                saveLikedVideo(validVideoId);
                updateLikeButtonUI(true);
                showToast("You have already liked this video.");
            } else {
                showToast(data.message || "Failed to like video.");
            }
        }
    } catch (err) {
        console.error("Like API network error:", err);
        showToast("Network error. Could not like video.");
    } finally {
        if (likeBtn) likeBtn.disabled = false;
    }
}

/**
 * معالجة روابط الوسائط (فيديوهات وصور مصغرة)
 */
function getFullUrl(rawUrl) {
    if (!rawUrl) return "";
    let cleanUrl = String(rawUrl).replace(/\\/g, "/");
    if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://") || cleanUrl.startsWith("blob:") || cleanUrl.startsWith("data:")) {
        return cleanUrl;
    }
    const prefix = cleanUrl.startsWith("/") ? "" : "/";
    return `${API_BASE_URL}${prefix}${cleanUrl}`;
}

function getVideoSourceUrl(video) {
    if (!video) return "";
    if (typeof video === "string") return video;
    return (
        video.videoUrl ||
        video.video_url ||
        video.videoPath ||
        video.video_path ||
        video.url ||
        video.filePath ||
        video.file_path ||
        video.path ||
        video.filename ||
        video.file_name ||
        video.file ||
        video.src ||
        video.source ||
        video.streamUrl ||
        video.stream_url ||
        video.mediaUrl ||
        video.media_url ||
        (typeof video.video === "string" ? video.video : video.video?.url) ||
        ""
    );
}

function getThumbnailUrl(video) {
    if (!video) return "";
    return (
        video.thumbnailUrl ||
        video.thumbnail_url ||
        video.thumbnailPath ||
        video.thumbnail_path ||
        video.thumbnail ||
        video.thumb ||
        video.poster ||
        video.image ||
        video.coverUrl ||
        video.cover_url ||
        video.cover ||
        ""
    );
}

function getYouTubeEmbedUrl(url) {
    if (!url || typeof url !== "string") return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2] && match[2].length === 11) {
        return `https://www.youtube.com/embed/${match[2]}?rel=0&autoplay=1`;
    }
    return null;
}

/**
 * إعداد مستمعي الأحداث
 */
function setupEventListeners() {
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

    document.getElementById("subscribe-btn")?.addEventListener("click", () => {
        alert("BACKEND REQUIRED: Subscription system is not implemented in the backend.");
    });

    // ربط زر الإعجاب بالدالة المحدثة
    document.getElementById("like-btn")?.addEventListener("click", handleLikeClick);

    document.getElementById("save-btn")?.addEventListener("click", () => {
        alert("BACKEND REQUIRED: Save to Playlist endpoint is not implemented in the backend.");
    });

    document.getElementById("share-btn")?.addEventListener("click", copyShareLink);
    document.getElementById("retry-btn")?.addEventListener("click", loadVideoData);
}

/**
 * التحقق من جلسة المستخدم
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
 * تحميل بيانات الفيديو
 */
async function loadVideoData() {
    if (!currentVideoId) {
        showState("not_found");
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

        currentVideo = allVideos.find(v => String(v._id || v.id) === String(currentVideoId));

        if (!currentVideo) {
            showState("not_found");
            return;
        }

        renderVideoPlayer(currentVideo);
        renderRecommendedVideos(allVideos, currentVideoId);
        showState("loaded");
    } catch (err) {
        console.error("Error loading video:", err);
        showState("error", "Unable to load video data from the server.");
    }
}

/**
 * عرض مشغل الفيديو وتحديث بيانات الواجهة
 */
function renderVideoPlayer(video) {
    const playerWrapper = document.querySelector(".player-wrapper");
    const titleEl = document.getElementById("video-title");
    const viewsEl = document.getElementById("video-views");
    const dateEl = document.getElementById("video-date");
    const catEl = document.getElementById("video-category-badge");
    const descEl = document.getElementById("video-description");
    const channelEl = document.getElementById("channel-name");

    const rawVideoUrl = getVideoSourceUrl(video);
    const rawPosterUrl = getThumbnailUrl(video);

    const fullVideoUrl = getFullUrl(rawVideoUrl);
    const fullPosterUrl = getFullUrl(rawPosterUrl);

    const youtubeEmbedUrl = getYouTubeEmbedUrl(fullVideoUrl || rawVideoUrl);

    if (playerWrapper) {
        if (youtubeEmbedUrl) {
            playerWrapper.innerHTML = `
                <iframe 
                    id="youtube-player" 
                    src="${youtubeEmbedUrl}" 
                    title="${escapeHTML(video.title || 'YouTube Video')}"
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                    allowfullscreen
                    style="width: 100%; aspect-ratio: 16/9; border: none; border-radius: 12px;">
                </iframe>
            `;
        } else {
            playerWrapper.innerHTML = `
                <video id="video-player" class="video-player" controls preload="metadata" ${fullPosterUrl ? `poster="${escapeHTML(fullPosterUrl)}"` : ""}>
                    ${fullVideoUrl ? `<source id="video-source" src="${escapeHTML(fullVideoUrl)}">` : ""}
                    Your browser does not support HTML5 video playback.
                </video>
            `;

            const videoPlayer = document.getElementById("video-player");
            if (videoPlayer) {
                videoPlayer.removeAttribute("crossorigin");
                if (fullVideoUrl) {
                    videoPlayer.src = fullVideoUrl;
                    videoPlayer.load();
                }
            }
        }
    }

    if (titleEl) titleEl.textContent = video.title || "Untitled Video";
    if (viewsEl) viewsEl.textContent = formatViews(video.views);
    if (dateEl) dateEl.textContent = formatRelativeTime(video.createdAt || video.created_at || video.uploadDate || video.upload_date || video.date);
    if (catEl) catEl.textContent = video.category || "General";
    if (descEl) descEl.textContent = video.description || "No description provided for this video.";
    if (channelEl) channelEl.textContent = video.channelName || video.uploaderName || video.channel_name || video.uploader_name || video.user?.name || video.user?.username || "Channel";

    // تحديث لون وشكل زر الإعجاب فوراً إذا كان الفيديو محفوظاً في LocalStorage
    updateLikeButtonUI(isVideoLiked(currentVideoId));

    document.title = `${video.title || "Watch Video"} - StreamPulse`;
}

/**
 * عرض الفيديوهات المقترحة
 */
function renderRecommendedVideos(videos, activeId) {
    const recGrid = document.getElementById("recommended-grid");
    if (!recGrid) return;

    const recommendations = videos.filter(v => String(v._id || v.id) !== String(activeId));

    if (recommendations.length === 0) {
        recGrid.innerHTML = `<p style="font-size:13px; color:var(--text-secondary);">No other recommended videos available.</p>`;
        return;
    }

    recGrid.innerHTML = recommendations.map(v => {
        const vId = v._id || v.id || "";
        const title = escapeHTML(v.title || "Untitled Video");
        const rawThumb = getThumbnailUrl(v);
        const thumb = getFullUrl(rawThumb) || "https://via.placeholder.com/320x180?text=No+Thumbnail";
        const views = formatViews(v.views);
        const channel = escapeHTML(v.channelName || v.uploaderName || v.channel_name || v.uploader_name || v.user?.name || v.user?.username || "Channel");

        return `
            <article class="rec-card" data-video-id="${escapeHTML(vId)}">
                <div class="rec-thumb-container">
                    <img src="${escapeHTML(thumb)}" alt="${title}" class="rec-thumb-img" loading="lazy">
                </div>
                <div class="rec-details">
                    <h3 class="rec-title" title="${title}">${title}</h3>
                    <div class="rec-meta">${channel}</div>
                    <div class="rec-meta">${views}</div>
                </div>
            </article>
        `;
    }).join("");

    recGrid.querySelectorAll(".rec-card").forEach(card => {
        card.addEventListener("click", () => {
            const vId = card.getAttribute("data-video-id");
            if (vId) {
                window.location.href = `watch.html?id=${encodeURIComponent(vId)}`;
            }
        });
    });
}

function copyShareLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
        showToast("Link copied to clipboard!");
    }).catch(() => {
        showToast("Failed to copy link.");
    });
}

function showToast(msg) {
    const toast = document.getElementById("toast");
    if (toast) {
        toast.textContent = msg;
        toast.classList.remove("hidden");
        setTimeout(() => toast.classList.add("hidden"), 3000);
    }
}

function showState(state, message = "") {
    const skeleton = document.getElementById("watch-skeleton");
    const container = document.getElementById("watch-container");
    const authState = document.getElementById("auth-required-state");
    const notFoundState = document.getElementById("not-found-state");
    const errorState = document.getElementById("error-state");

    skeleton?.classList.add("hidden");
    container?.classList.add("hidden");
    authState?.classList.add("hidden");
    notFoundState?.classList.add("hidden");
    errorState?.classList.add("hidden");

    if (state === "loading") {
        skeleton?.classList.remove("hidden");
    } else if (state === "loaded") {
        container?.classList.remove("hidden");
    } else if (state === "auth_required") {
        authState?.classList.remove("hidden");
    } else if (state === "not_found") {
        notFoundState?.classList.remove("hidden");
    } else if (state === "error") {
        if (errorState) {
            const msgEl = document.getElementById("error-message");
            if (msgEl && message) msgEl.textContent = message;
            errorState.classList.remove("hidden");
        }
    }
}

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

function formatViews(views) {
    const num = Number(views) || 0;
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M views";
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K views";
    return `${num} view${num === 1 ? "" : "s"}`;
}

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

function escapeHTML(str) {
    if (typeof str !== "string") return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}