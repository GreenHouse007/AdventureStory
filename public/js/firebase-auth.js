import {
  initializeApp,
  getApps,
  getApp,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const page = window.firebaseAuthPage || {};
const errorBanner = document.querySelector('[data-auth-message="error"]');
const successBanner = document.querySelector('[data-auth-message="success"]');

const setBanner = (banner, message) => {
  if (!banner) return;
  if (!message) {
    banner.hidden = true;
    banner.textContent = "";
    return;
  }
  banner.hidden = false;
  banner.textContent = message;
};

const showError = (message) => setBanner(errorBanner, message);
const showSuccess = (message) => setBanner(successBanner, message);
const clearBanners = () => {
  setBanner(errorBanner, "");
  setBanner(successBanner, "");
};

const setFormDisabled = (form, disabled) => {
  if (!form) return;
  [...form.querySelectorAll("input, button, select")].forEach((el) => {
    if (disabled) {
      el.setAttribute("disabled", "disabled");
    } else {
      el.removeAttribute("disabled");
    }
  });
};

const ERROR_MESSAGES = {
  "auth/email-already-in-use": "An account with that email already exists.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/invalid-login-credentials": "Invalid email or password.",
  "auth/user-not-found": "No account found with that email.",
  "auth/wrong-password": "Invalid email or password.",
  "auth/popup-closed-by-user": "The sign-in popup was closed before completing.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
};

const handleAuthError = (error) => {
  console.error(error);
  if (error && ERROR_MESSAGES[error.code]) {
    showError(ERROR_MESSAGES[error.code]);
    return;
  }
  if (error && ERROR_MESSAGES[error.message]) {
    showError(ERROR_MESSAGES[error.message]);
    return;
  }
  showError(error?.message || "Something went wrong. Please try again.");
};

const postJson = async (url, payload) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    throw error;
  }
  return data;
};

const establishSession = async ({ endpoint, user, payload }) => {
  const idToken = await user.getIdToken(true);
  const response = await postJson(endpoint, { idToken, ...payload });
  if (response.redirect) {
    window.location.assign(response.redirect);
  } else if (response.message) {
    showSuccess(response.message);
  }
};

const loginForm = document.querySelector('[data-auth-form="login"]');
const signupForm = document.querySelector('[data-auth-form="signup"]');

const config = page.config || {};
if (!config.apiKey) {
  console.warn("Firebase config missing; authentication helpers are disabled.");
} else {
  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);

  const rememberInput = loginForm?.querySelector('input[name="remember"]');

  const resolveRememberChoice = () => {
    if (!rememberInput) return true;
    return rememberInput.checked;
  };

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearBanners();

      const formData = new FormData(loginForm);
      const email = String(formData.get("email") || "").trim();
      const password = String(formData.get("password") || "");
      const remember = resolveRememberChoice();

      if (!email || !password) {
        showError("Please enter your email and password.");
        return;
      }

      setFormDisabled(loginForm, true);
      try {
        await setPersistence(
          auth,
          remember ? browserLocalPersistence : browserSessionPersistence
        );
        const credential = await signInWithEmailAndPassword(auth, email, password);
        await establishSession({
          endpoint: "/login",
          user: credential.user,
          payload: { remember },
        });
      } catch (error) {
        handleAuthError(error);
      } finally {
        setFormDisabled(loginForm, false);
      }
    });

    const googleButton = document.querySelector("[data-google-sign-in]");
    if (googleButton) {
      googleButton.addEventListener("click", async () => {
        clearBanners();
        const remember = resolveRememberChoice();
        setFormDisabled(loginForm, true);
        try {
          await setPersistence(
            auth,
            remember ? browserLocalPersistence : browserSessionPersistence
          );
          const provider = new GoogleAuthProvider();
          const credential = await signInWithPopup(auth, provider);
          await establishSession({
            endpoint: "/login",
            user: credential.user,
            payload: { remember },
          });
        } catch (error) {
          handleAuthError(error);
        } finally {
          setFormDisabled(loginForm, false);
        }
      });
    }

    const resetLink = document.querySelector("[data-reset-password]");
    if (resetLink) {
      resetLink.addEventListener("click", async (event) => {
        event.preventDefault();
        clearBanners();
        const email = loginForm.querySelector('input[name="email"]').value.trim();
        if (!email) {
          showError("Enter your email above and try again.");
          return;
        }
        try {
          await sendPasswordResetEmail(auth, email);
          showSuccess("Password reset email sent! Check your inbox.");
        } catch (error) {
          handleAuthError(error);
        }
      });
    }
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearBanners();

      const formData = new FormData(signupForm);
      const username = String(formData.get("username") || "").trim();
      const email = String(formData.get("email") || "").trim();
      const password = String(formData.get("password") || "");

      if (!username || username.length < 3) {
        showError("Choose a username with at least 3 characters.");
        return;
      }
      if (!email || !password) {
        showError("Email and password are required.");
        return;
      }

      setFormDisabled(signupForm, true);
      let credential;
      try {
        await setPersistence(auth, browserLocalPersistence);
        credential = await createUserWithEmailAndPassword(auth, email, password);
        if (username) {
          await updateProfile(credential.user, { displayName: username });
        }
        try {
          await sendEmailVerification(credential.user);
          showSuccess("Verification email sent. Please check your inbox.");
        } catch (error) {
          console.warn("Email verification failed", error);
        }

        await establishSession({
          endpoint: "/signup",
          user: credential.user,
          payload: { username },
        });
      } catch (error) {
        if (error.status && credential?.user) {
          try {
            await credential.user.delete();
          } catch (cleanupError) {
            console.warn(
              "Unable to delete Firebase user after signup failure",
              cleanupError
            );
          }
        }
        await signOut(auth).catch(() => undefined);
        handleAuthError(error);
      } finally {
        setFormDisabled(signupForm, false);
      }
    });
  }

  let handshakeComplete = false;

  onAuthStateChanged(auth, async (user) => {
    if (!user || handshakeComplete) {
      return;
    }
    if (page.mode !== "login") {
      return;
    }
    try {
      handshakeComplete = true;
      await establishSession({
        endpoint: "/login",
        user,
        payload: { remember: true },
      });
    } catch (error) {
      handshakeComplete = false;
      if (error.status === 401) {
        await signOut(auth).catch(() => undefined);
      } else {
        console.warn("Automatic session sync failed", error);
      }
    }
  });
}
