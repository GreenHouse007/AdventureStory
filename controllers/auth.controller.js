const bcrypt = require("bcrypt");
const User = require("../models/user.model");

// show signup form
exports.signupGet = (req, res) => {
  res.render("public/signup", { title: "Sign Up" });
};

// handle signup form submission
exports.signupPost = async (req, res) => {
  const { username, email, password } = req.body;
  try {
    // hash the password
    const passwordHash = await bcrypt.hash(password, 12);

    // create user in MongoDB
    const user = await User.create({ username, email, passwordHash });

    // store user ID in session (logs them in)
    req.session.userId = user._id;
    await req.session.save();
    res.redirect("/u/library"); // send to their library
  } catch (err) {
    console.error(err);

    // if duplicate email or username
    if (err.code === 11000) {
      return res.status(400).render("public/signup", {
        title: "Sign Up",
        error: "Username or email already exists.",
        old: { username, email },
      });
    }

    res.status(500).render("public/signup", {
      title: "Sign Up",
      error: "Something went wrong. Please try again.",
      old: { username, email },
    });
  }
};

exports.loginGet = (req, res) => {
  res.render("public/login", { title: "Login" });
};

exports.loginPost = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).render("public/login", {
        title: "Login",
        error: "Invalid credentials",
      });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).render("public/login", {
        title: "Login",
        error: "Invalid credentials",
      });
    }

    req.session.userId = user._id;

    // ✅ Ensure the session is saved before redirect
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).render("public/login", {
          title: "Login",
          error: "Server error",
        });
      }
      res.redirect("/u/library");
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("public/login", {
      title: "Login",
      error: "Server error",
    });
  }
};

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Logout failed");
    }
    res.clearCookie("connect.sid"); // default session cookie name
    res.redirect("/");
  });
};
