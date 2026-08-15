/**
 * StreamPulse Studio - Upload Video Page Script
 * Uploads video & thumbnail files directly from the browser to Cloudinary
 * using unsigned preset 'youtube mvp', then sends generated secure_url links
 * to the Node.js backend POST /api/auth/create_videos using credentials: "include".
 */

const API_BASE_URL = "http://localhost:5001";
const CLOUDINARY_CLOUD_NAME = "de95jndw0";
const CLOUDINARY_UPLOAD_PRESET = "youtube mvp";
const CLOUDINARY_VIDEO_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;
const CLOUDINARY_IMAGE_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

let currentUser = null;
let selectedVideoFile = null;
let selectedThumbFile = null;

document.addEventListener("DOMContentLoaded", async () => {
    setupEventListeners();
    await checkAuthentication();
});

/**
 * Event Listeners Registration
 */
function setupEventListeners() {
    // Mobile Sidebar Toggle
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

    // Video File Drop Zone & Input
    const videoFileInput = document.getElementById("video-file-input");
    const videoDropZone = document.getElementById("video-drop-zone");

    if (videoDropZone && videoFileInput) {
        videoDropZone.addEventListener("click", () => videoFileInput.click());

        videoDropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            videoDropZone.classList.add("drag-over");
        });

        ["dragleave", "dragend"].forEach(type => {
            videoDropZone.addEventListener(type, () => videoDropZone.classList.remove("drag-over"));
        });

        videoDropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            videoDropZone.classList.remove("drag-over");
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleVideoFileSelect(e.dataTransfer.files[0]);
            }
        });

        videoFileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleVideoFileSelect(e.target.files[0]);
            }
        });
    }

    // Thumbnail Drop Zone & Input
    const thumbFileInput = document.getElementById("thumb-file-input");
    const thumbDropZone = document.getElementById("thumb-drop-zone");

    if (thumbDropZone && thumbFileInput) {
        thumbDropZone.addEventListener("click", () => thumbFileInput.click());

        thumbDropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            thumbDropZone.classList.add("drag-over");
        });

        ["dragleave", "dragend"].forEach(type => {
            thumbDropZone.addEventListener(type, () => thumbDropZone.classList.remove("drag-over"));
        });

        thumbDropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            thumbDropZone.classList.remove("drag-over");
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleThumbFileSelect(e.dataTransfer.files[0]);
            }
        });

        thumbFileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleThumbFileSelect(e.target.files[0]);
            }
        });
    }

    // Thumbnail URL Input Live Preview
    const thumbUrlInput = document.getElementById("thumbnailUrlInput");
    if (thumbUrlInput) {
        thumbUrlInput.addEventListener("input", (e) => {
            const url = e.target.value.trim();
            if (url) {
                selectedThumbFile = null;
                const thumbBadge = document.getElementById("thumb-file-badge");
                if (thumbBadge) thumbBadge.classList.add("hidden");

                const previewImg = document.getElementById("thumb-preview-img");
                const previewPlaceholder = document.getElementById("thumb-preview-placeholder");
                if (previewImg) {
                    previewImg.src = url;
                    previewImg.classList.remove("hidden");
                    previewPlaceholder?.classList.add("hidden");
                }
            }
        });
    }

    // Form Submit Handler
    const uploadForm = document.getElementById("upload-form");
    if (uploadForm) {
        uploadForm.addEventListener("submit", handleFormSubmit);
    }
}

/**
 * Verify Authentication Session via GET /api/auth/me
 */
async function checkAuthentication() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include"
        });

        if (!response.ok) {
            window.location.href = "login.html";
            return;
        }

        const data = await response.json();
        if (data && data.authenticated && data.user) {
            currentUser = data.user;
            renderUserMenu(data.user);
        } else {
            window.location.href = "login.html";
        }
    } catch (err) {
        console.error("Auth check failed:", err);
        window.location.href = "login.html";
    }
}

/**
 * Handle Local Video Selection & Live Video Player Preview
 */
function handleVideoFileSelect(file) {
    if (!file.type.startsWith("video/")) {
        showFieldError("video-file", "Please select a valid video file (MP4, WebM, MOV).");
        return;
    }

    selectedVideoFile = file;
    clearFieldError("video-file");

    const badge = document.getElementById("video-file-badge");
    if (badge) {
        badge.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;
        badge.classList.remove("hidden");
    }

    const previewPlayer = document.getElementById("video-preview-player");
    const previewPlaceholder = document.getElementById("video-preview-placeholder");

    if (previewPlayer) {
        const objectUrl = URL.createObjectURL(file);
        previewPlayer.src = objectUrl;
        previewPlayer.classList.remove("hidden");
        previewPlaceholder?.classList.add("hidden");
    }
}

/**
 * Handle Local Thumbnail Selection & Live Image Preview
 */
function handleThumbFileSelect(file) {
    if (!file.type.startsWith("image/")) {
        showFieldError("thumb-file", "Please select a valid image file (JPG, PNG, WebP).");
        return;
    }

    selectedThumbFile = file;
    clearFieldError("thumb-file");

    const urlInput = document.getElementById("thumbnailUrlInput");
    if (urlInput) urlInput.value = "";

    const badge = document.getElementById("thumb-file-badge");
    if (badge) {
        badge.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;
        badge.classList.remove("hidden");
    }

    const previewImg = document.getElementById("thumb-preview-img");
    const previewPlaceholder = document.getElementById("thumb-preview-placeholder");

    if (previewImg) {
        const objectUrl = URL.createObjectURL(file);
        previewImg.src = objectUrl;
        previewImg.classList.remove("hidden");
        previewPlaceholder?.classList.add("hidden");
    }
}

/**
 * Upload File directly to Cloudinary using XMLHttpRequest to monitor progress
 */
function uploadFileToCloudinary(file, endpointUrl, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();

        formData.append("file", file);
        formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

        xhr.open("POST", endpointUrl, true);

        if (xhr.upload && onProgress) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    onProgress(percent);
                }
            };
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    resolve(data.secure_url || data.url);
                } catch (err) {
                    reject(new Error("Failed to parse Cloudinary response."));
                }
            } else {
                try {
                    const errorData = JSON.parse(xhr.responseText);
                    reject(new Error(errorData.error?.message || `Cloudinary upload failed (${xhr.status}).`));
                } catch (err) {
                    reject(new Error(`Cloudinary server error (${xhr.status})`));
                }
            }
        };

        xhr.onerror = () => reject(new Error("Network error during Cloudinary upload."));

        xhr.send(formData);
    });
}

/**
 * Form Submission & Cloudinary + Backend Pipeline
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    clearBannersAndErrors();

    const titleInput = document.getElementById("title");
    const descInput = document.getElementById("description");
    const categoryInput = document.getElementById("category");
    const thumbUrlInput = document.getElementById("thumbnailUrlInput");

    const title = titleInput ? titleInput.value.trim() : "";
    const description = descInput ? descInput.value.trim() : "";
    const category = categoryInput ? categoryInput.value : "";
    let thumbnailUrl = thumbUrlInput ? thumbUrlInput.value.trim() : "";

    let isValid = true;

    if (!selectedVideoFile) {
        showFieldError("video-file", "Please select a video file to upload.");
        isValid = false;
    }

    if (!title) {
        showFieldError("title", "Video title is required.");
        isValid = false;
    }

    if (!description) {
        showFieldError("description", "Video description is required.");
        isValid = false;
    }

    if (!category) {
        showFieldError("category", "Please select a category.");
        isValid = false;
    }

    if (!selectedThumbFile && !thumbnailUrl) {
        showFieldError("thumb-file", "Please select a thumbnail image file or paste a thumbnail URL.");
        isValid = false;
    }

    if (!isValid) return;

    setSubmitLoading(true);
    showProgressUI(0, "Uploading video to Cloudinary...");

    try {
        // Step 1: Upload Video directly to Cloudinary
        const videoUrl = await uploadFileToCloudinary(
            selectedVideoFile,
            CLOUDINARY_VIDEO_URL,
            (percent) => updateProgressUI(percent, `Uploading video to Cloudinary... ${percent}%`)
        );

        console.log("Cloudinary Video URL:", videoUrl);

        // Step 2: Upload Thumbnail to Cloudinary if file selected
        if (selectedThumbFile) {
            updateProgressUI(0, "Uploading thumbnail to Cloudinary...");
            thumbnailUrl = await uploadFileToCloudinary(
                selectedThumbFile,
                CLOUDINARY_IMAGE_URL,
                (percent) => updateProgressUI(percent, `Uploading thumbnail to Cloudinary... ${percent}%`)
            );
            console.log("Cloudinary Thumbnail URL:", thumbnailUrl);
        }

        updateProgressUI(100, "Saving video metadata to database...");

        // Step 3: Send generated Cloudinary URLs & metadata to Node.js Express backend
        const response = await fetch(`${API_BASE_URL}/api/auth/create_videos`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
                title: title,
                description: description,
                category: category,
                videoUrl: videoUrl,
                thumbnailUrl: thumbnailUrl
            })
        });

        const data = await response.json().catch(() => ({}));

        if (response.status === 201 || response.ok) {
            showSuccessState(data.video || { title }, videoUrl, thumbnailUrl);
        } else if (response.status === 401) {
            if (data.message && data.message.toLowerCase().includes("channel")) {
                showNoChannelError("Channel token required. You must create a channel first before publishing videos.");
            } else {
                showGlobalError("Your session has expired. Please sign in again.");
                setTimeout(() => { window.location.href = "login.html"; }, 2000);
            }
        } else if (response.status === 400) {
            showGlobalError(data.message || "Title, description, category, videoUrl and thumbnailUrl are required.");
        } else if (response.status === 404) {
            showNoChannelError(data.message || "Channel not found. Please create a channel first.");
        } else {
            showGlobalError(data.message || "Failed to save video metadata to server.");
        }
    } catch (err) {
        console.error("Upload error:", err);
        showGlobalError(err.message || "An error occurred during video upload to Cloudinary.");
    } finally {
        setSubmitLoading(false);
        hideProgressUI();
    }
}

/**
 * Show Progress Bar UI
 */
function showProgressUI(percent, statusText) {
    const container = document.getElementById("progress-container");
    if (container) container.classList.remove("hidden");
    updateProgressUI(percent, statusText);
}

/**
 * Update Progress Bar
 */
function updateProgressUI(percent, statusText) {
    const progressBar = document.getElementById("progress-bar-fill");
    const percentText = document.getElementById("progress-percent-text");
    const statusMsg = document.getElementById("progress-status-text");

    if (progressBar) progressBar.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${percent}%`;
    if (statusMsg && statusText) statusMsg.textContent = statusText;
}

/**
 * Hide Progress Bar
 */
function hideProgressUI() {
    const container = document.getElementById("progress-container");
    if (container) container.classList.add("hidden");
}

/**
 * Render Success Card View
 */
function showSuccessState(video, videoUrl, thumbnailUrl) {
    const uploadGrid = document.getElementById("upload-grid");
    const successCard = document.getElementById("success-card");
    const titleEl = document.getElementById("success-video-title");
    const videoUrlLink = document.getElementById("generated-video-url-link");
    const thumbUrlLink = document.getElementById("generated-thumb-url-link");
    const watchLinkEl = document.getElementById("watch-video-link");

    if (uploadGrid) uploadGrid.classList.add("hidden");

    if (titleEl) titleEl.textContent = video.title || "Untitled Video";

    if (videoUrlLink) {
        videoUrlLink.href = videoUrl;
        videoUrlLink.textContent = videoUrl;
    }

    if (thumbUrlLink) {
        thumbUrlLink.href = thumbnailUrl;
        thumbUrlLink.textContent = thumbnailUrl;
    }

    const videoId = video._id || video.id;
    if (watchLinkEl && videoId) {
        watchLinkEl.href = `watch.html?id=${encodeURIComponent(videoId)}`;
    }

    if (successCard) successCard.classList.remove("hidden");
}

/**
 * Show Channel Token Error
 */
function showNoChannelError(message) {
    const banner = document.getElementById("channel-required-banner");
    const textEl = document.getElementById("channel-required-text");

    if (banner && textEl) {
        textEl.textContent = message;
        banner.classList.remove("hidden");
        banner.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

/**
 * Show Global Server Error
 */
function showGlobalError(message) {
    const banner = document.getElementById("error-banner");
    const textEl = document.getElementById("error-banner-text");

    if (banner && textEl) {
        textEl.textContent = message;
        banner.classList.remove("hidden");
        banner.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

/**
 * Show Input Field Error
 */
function showFieldError(fieldId, message) {
    const errorEl = document.getElementById(`${fieldId}-error`);
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove("hidden");
    }
}

/**
 * Clear Field Error
 */
function clearFieldError(fieldId) {
    const errorEl = document.getElementById(`${fieldId}-error`);
    if (errorEl) {
        errorEl.textContent = "";
        errorEl.classList.add("hidden");
    }
}

/**
 * Clear Banners
 */
function clearBannersAndErrors() {
    const errorBanner = document.getElementById("error-banner");
    const channelBanner = document.getElementById("channel-required-banner");

    if (errorBanner) errorBanner.classList.add("hidden");
    if (channelBanner) channelBanner.classList.add("hidden");

    ["video-file", "thumb-file", "title", "description", "category"].forEach(id => clearFieldError(id));
}

/**
 * Submit Button Loading Spinner
 */
function setSubmitLoading(isLoading) {
    const btn = document.getElementById("submit-btn");
    const btnText = document.getElementById("btn-text");
    const btnSpinner = document.getElementById("btn-spinner");

    if (btn) btn.disabled = isLoading;
    if (btnText) btnText.classList.toggle("hidden", isLoading);
    if (btnSpinner) btnSpinner.classList.toggle("hidden", !isLoading);
}

/**
 * User Dropdown Menu
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
 * Format Bytes
 */
function formatFileSize(bytes) {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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