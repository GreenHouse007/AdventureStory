const User = require("../models/user.model");

exports.attachUser = async (req, res, next) => {
  if (req.session.userId) {
    try {
      const user = await User.findById(req.session.userId);
      req.user = user;
      res.locals.user = user;
    } catch (e) {
      req.user = null;
      res.locals.user = null;
    }
  } else {
    req.user = null;
    res.locals.user = null;
  }

  console.log("attachUser -> req.session.userId:", req.session?.userId);
  console.log("attachUser -> res.locals.user:", res.locals.user);

  next();
};

exports.requireAuth = (req, res, next) => {
  if (!req.user) return res.redirect("/login");
  next();
};

exports.requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).render("public/403", { title: "Forbidden" });
  }
  next();
};
