/**
 * StreamPulse - Create Channel Page Script
 * Verifies authentication via GET /api/auth/me before rendering
 * Submits channel payload via POST /api/auth/channels using credentials: "include"
 */

const API_BASE_URL = "http://localhost:5001";

let currentUser = null;

document.addEventListener("DOMContentLoaded", async () => {
    setupEventListeners();
    await checkAuthAndInitialize();
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

    // Channel Form Submit Handler
    const channelForm = document.getElementById("create-channel-form");
    if (channelForm) {
        channelForm.addEventListener("submit", handleFormSubmit);
    }
}

/**
 * Authentication Verification prior to displaying page
 * GET /api/auth/me
 */
async function checkAuthAndInitialize() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            },
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
            showFormCard();
        } else {
            window.location.href = "login.html";
        }
    } catch (err) {
        console.error("Auth check failed:", err);
        window.location.href = "login.html";
    }
}

/**
 * Render Header User Avatar Dropdown
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
 * Unhide Channel Card after authentication check succeeds
 */
function showFormCard() {
    const authLoadingState = document.getElementById("auth-loading-state");
    const channelFormCard = document.getElementById("channel-form-card");

    authLoadingState?.classList.add("hidden");
    channelFormCard?.classList.remove("hidden");
}

/**
 * Form Submission & Channel Creation
 * POST /api/auth/channels
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    clearBannersAndErrors();

    const nameInput = document.getElementById("name");
    const descInput = document.getElementById("description");

    const name = nameInput ? nameInput.value.trim() : "";
    const description = descInput ? descInput.value.trim() : "";

    // Client-side Validation
    let isValid = true;

    if (!name) {
        showFieldError("name", "Channel name is required.");
        isValid = false;
    } else if (name.length < 3) {
        showFieldError("name", "Channel name must be at least 3 characters.");
        isValid = false;
    }

    if (!description) {
        showFieldError("description", "Channel description is required.");
        isValid = false;
    } else if (description.length < 10) {
        showFieldError("description", "Please provide a description of at least 10 characters.");
        isValid = false;
    }

    if (!isValid) return;

    // Loading Spinner
    setSubmitLoading(true);

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/channels`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
                name: name,
                description: description
            })
        });

        const data = await response.json().catch(() => ({}));

        if (response.status === 201 || response.ok) {
            showSuccessState(data.channel || { name, description });
        } else if (response.status === 400) {
            showGlobalError(data.message || "Name and description are required.");
        } else if (response.status === 401) {
            showGlobalError("Your login session has expired. Redirecting to login...");
            setTimeout(() => { window.location.href = "login.html"; }, 2000);
        } else {
            showGlobalError(data.message || "Failed to create channel. Please try again.");
        }
    } catch (err) {
        console.error("Create channel error:", err);
        showGlobalError("Network error. Unable to connect to the backend server.");
    } finally {
        setSubmitLoading(false);
    }
}

/**
 * Switch view to Success State upon successful channel creation
 */
function showSuccessState(channel) {
    const formEl = document.getElementById("create-channel-form");
    const successCard = document.getElementById("success-card");
    const createdName = document.getElementById("created-channel-name");
    const createdDesc = document.getElementById("created-channel-desc");

    if (formEl) formEl.classList.add("hidden");

    if (createdName) createdName.textContent = channel.name || "My Channel";
    if (createdDesc) createdDesc.textContent = channel.description || "";

    if (successCard) successCard.classList.remove("hidden");
}

/**
 * Display Input Field Error Message
 */
function showFieldError(fieldId, message) {
    const inputEl = document.getElementById(fieldId);
    const errorEl = document.getElementById(`${fieldId}-error`);

    if (inputEl) inputEl.classList.add("input-invalid");
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove("hidden");
    }
}

/**
 * Display Global Alert Banner
 */
function showGlobalError(message) {
    const banner = document.getElementById("error-banner");
    const textEl = document.getElementById("error-banner-text");

    if (banner && textEl) {
        textEl.textContent = message;
        banner.classList.remove("hidden");
    }
}

/**
 * Clear Previous Errors
 */
function clearBannersAndErrors() {
    const errorBanner = document.getElementById("error-banner");
    if (errorBanner) errorBanner.classList.add("hidden");

    ["name", "description"].forEach(fieldId => {
        const inputEl = document.getElementById(fieldId);
        const errorEl = document.getElementById(`${fieldId}-error`);

        if (inputEl) inputEl.classList.remove("input-invalid");
        if (errorEl) {
            errorEl.textContent = "";
            errorEl.classList.add("hidden");
        }
    });
}

/**
 * Toggle Submit Button Loading Spinner State
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
 * XSS Helper Function
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