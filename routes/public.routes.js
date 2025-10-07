const express = require("express");
const rateLimit = require("express-rate-limit");
const site = require("../controllers/site.controller");
const {
  home,
  about,
  loginGet,
  loginPost,
  logout,
} = require("../controllers/public.controller");
const router = express.Router();

router.get("/", home);
router.get("/about", about);
router.get("/login", loginGet);
router.post("/login", loginPost);
router.post("/logout", logout);

// Limit contact form abuse: 5 submissions / 10 minutes per IP
const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/contact", site.contactForm);
router.post("/contact", contactLimiter, site.contactSubmit);

module.exports = router;
