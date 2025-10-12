const crypto = require("crypto");
const User = require("../models/user.model");
const firebaseAdmin = require("../utils/firebaseAdmin");
const { buildFirebaseConfig } = require("../utils/firebaseConfig");

const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const THIRTY_DAYS_MS = ONE_DAY_MS * 30;

const renderWithFirebase = (res, view, locals = {}) =>
  res.render(view, {
    ...locals,
    firebaseConfig: buildFirebaseConfig(),
  });

const verifyIdToken = async (idToken) => {
  try {
    return await firebaseAdmin.auth().verifyIdToken(idToken);
  } catch (error) {
    const err = new Error("Invalid or expired Firebase ID token");
    err.status = 401;
    throw err;
  }
};

const sanitizeUsername = (input) => {
  if (!input) return "adventurer";
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.length >= 3 ? normalized.slice(0, 24) : "adventurer";
};

const generateAvailableUsername = async (base) => {
  const sanitizedBase = sanitizeUsername(base);
  let candidate = sanitizedBase;
  let suffix = 0;

  // Try sequential suffixes before falling back to a random hash
  while (await User.exists({ username: candidate })) {
    suffix += 1;
    if (suffix > 25) {
      const random = crypto.randomBytes(3).toString("hex");
      candidate = `${sanitizedBase}_${random}`;
      if (!(await User.exists({ username: candidate }))) {
        break;
      }
    } else {
      candidate = `${sanitizedBase}${suffix}`.slice(0, 32);
    }
  }

  return candidate;
};

const attachFirebaseUid = async ({ firebaseUid, email, usernameHint }) => {
  let user = await User.findOne({ firebaseUid });

  if (!user && email) {
    user = await User.findOne({ email });
  }

  if (!user && email) {
    const base = usernameHint || (email ? email.split("@")[0] : "adventurer");
    const username = await generateAvailableUsername(base);
    user = await User.create({ username, email, firebaseUid });
  } else if (!user) {
    const username = await generateAvailableUsername(usernameHint || "adventurer");
    user = await User.create({ username, firebaseUid, email: `${firebaseUid}@placeholder.local` });
  } else {
    if (!user.firebaseUid) {
      user.firebaseUid = firebaseUid;
    }
    if (email && user.email !== email) {
      user.email = email;
    }
    await user.save();
  }

  return user;
};

const persistSession = (req, { userId, remember }) =>
  new Promise((resolve, reject) => {
    req.session.userId = userId;
    req.session.cookie.maxAge = remember ? THIRTY_DAYS_MS : ONE_DAY_MS;
    req.session.save((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

exports.signupGet = (req, res) => {
  renderWithFirebase(res, "public/signup", {
    title: "Sign Up",
    user: req.user,
    old: {},
  });
};

exports.signupPost = async (req, res) => {
  const { idToken, username } = req.body;

  if (!idToken || !username) {
    return res.status(400).json({ error: "Missing Firebase token or username." });
  }

  try {
    const decoded = await verifyIdToken(idToken);
    const email = decoded.email;
    if (!email) {
      return res.status(400).json({ error: "A verified email address is required." });
    }

    const usernameOwner = await User.findOne({ username });
    if (usernameOwner) {
      const belongsToRequester =
        String(usernameOwner.firebaseUid || "") === decoded.uid ||
        usernameOwner.email === email;
      if (!belongsToRequester) {
        return res.status(400).json({ error: "That username is already taken." });
      }
    }

    let user = await User.findOne({ firebaseUid: decoded.uid });
    if (!user) {
      user = await User.findOne({ email });
    }

    if (!user) {
      user = await User.create({ username, email, firebaseUid: decoded.uid });
    } else {
      if (!user.firebaseUid) {
        user.firebaseUid = decoded.uid;
      }
      if (!user.username) {
        user.username = username;
      }
      if (user.email !== email) {
        user.email = email;
      }
      await user.save();
    }

    await persistSession(req, { userId: user._id, remember: true });
    res.json({ redirect: "/u/library" });
  } catch (error) {
    console.error("Signup error:", error);
    const status = error.status || 500;
    res.status(status).json({ error: error.message || "Unable to complete signup." });
  }
};

exports.loginGet = (req, res) => {
  renderWithFirebase(res, "public/login", {
    title: "Login",
    user: req.user,
    old: {},
    remember: false,
  });
};

exports.loginPost = async (req, res) => {
  const { idToken, remember } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: "Missing Firebase token." });
  }

  try {
    const decoded = await verifyIdToken(idToken);
    const rememberMe = remember === "1" || remember === "on" || remember === true;
    const usernameHint = decoded.name || (decoded.email ? decoded.email.split("@")[0] : null);

    const user = await attachFirebaseUid({
      firebaseUid: decoded.uid,
      email: decoded.email,
      usernameHint,
    });

    await persistSession(req, { userId: user._id, remember: rememberMe });
    res.json({ redirect: "/u/library" });
  } catch (error) {
    console.error("Login error:", error);
    const status = error.status || 500;
    res.status(status).json({ error: error.message || "Unable to log in." });
  }
};

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Logout failed");
    }
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
};
