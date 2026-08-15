/**
 * StreamPulse - Login Page Script
 * Pure Vanilla JavaScript using Fetch API with credentials: "include"
 */

// Centralized API Base URL Configuration
const API_BASE_URL = "http://localhost:5001";

document.addEventListener("DOMContentLoaded", () => {
    setupLoginForm();
});

/**
 * Main Setup Function
 */
function setupLoginForm() {
    const loginForm = document.getElementById("login-form");
    const passwordInput = document.getElementById("password");
    const togglePasswordBtn = document.getElementById("toggle-password-btn");

    // Password Visibility Toggle
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener("click", () => {
            const isPassword = passwordInput.getAttribute("type") === "password";
            passwordInput.setAttribute("type", isPassword ? "text" : "password");

            document.getElementById("eye-icon-show")?.classList.toggle("hidden", isPassword);
            document.getElementById("eye-icon-hide")?.classList.toggle("hidden", !isPassword);
        });
    }

    // Form Submit Handler
    if (loginForm) {
        loginForm.addEventListener("submit", handleLoginSubmit);
    }
}

/**
 * Handle Form Submission & Client Validation
 */
async function handleLoginSubmit(e) {
    e.preventDefault();
    clearErrors();

    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");

    const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
    const password = passwordInput ? passwordInput.value : "";

    // Client-side Validation Checks
    let isValid = true;

    if (!email) {
        showFieldError("email", "Email address is required.");
        isValid = false;
    } else if (!validateEmailPattern(email)) {
        showFieldError("email", "Please enter a valid email address.");
        isValid = false;
    }

    if (!password) {
        showFieldError("password", "Password is required.");
        isValid = false;
    } else if (password.length < 8) {
        showFieldError("password", "Password must be at least 8 characters long.");
        isValid = false;
    }

    if (!isValid) return;

    // Trigger Loading State
    setSubmitLoading(true);

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/log_in`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
                email: email,
                password: password
            })
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            // Success: HTTP-only 'token' cookie is set by the backend. Redirect to Home.
            window.location.href = "index.html";
        } else {
            // Handle Specific Backend Server Errors
            if (response.status === 401) {
                showGlobalError(data.message || "Invalid email or password.");
            } else if (response.status === 400) {
                showGlobalError(data.message || "Email and password are required.");
            } else {
                showGlobalError(data.message || "Server error occurred. Please try again later.");
            }
        }
    } catch (err) {
        console.error("Login error:", err);
        showGlobalError("Network error. Unable to connect to backend server.");
    } finally {
        setSubmitLoading(false);
    }
}

/**
 * Display Field-Level Error Messages
 */
function showFieldError(fieldId, message) {
    const inputEl = document.getElementById(fieldId);
    const errorEl = document.getElementById(`${fieldId}-error`);

    if (inputEl) {
        inputEl.classList.add("input-invalid");
    }

    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove("hidden");
    }
}

/**
 * Display Global Alert Banner Error
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
 * Clear All Validation Errors
 */
function clearErrors() {
    const banner = document.getElementById("error-banner");
    if (banner) banner.classList.add("hidden");

    ["email", "password"].forEach(fieldId => {
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
 * Regex Email Pattern Helper
 */
function validateEmailPattern(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}