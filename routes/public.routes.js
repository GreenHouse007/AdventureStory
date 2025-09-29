const express = require("express");
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

module.exports = router;
