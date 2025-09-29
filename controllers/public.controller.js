exports.home = (req, res) =>
  res.render("public/home", { title: "Home", user: req.user });

exports.about = (req, res) =>
  res.render("public/about", { title: "About", user: req.user });

exports.loginGet = (req, res) => {
  res.render("public/login", {
    title: "Login",
    user: req.user,
    error: req.flash?.("error"),
    success: req.flash?.("success"),
  });
};

exports.loginPost = async (req, res) => {
  const { email, password, remember } = req.body;
  try {
    // TODO: lookup user, verify password, set session/JWT cookie
    // If using cookie session:
    // req.session.userId = user._id;
    // if (remember) set a longer cookie maxAge
    return res.redirect("/u/library");
  } catch (e) {
    console.error(e);
    if (req.flash) req.flash("error", "Invalid email or password.");
    return res.status(401).render("public/login", {
      title: "Login",
      error: "Invalid email or password.",
    });
  }
};

exports.logout = (req, res) => {
  // clear session
  res.redirect("/");
};
