const express = require("express");
const {
  signupGet,
  signupPost,
  loginGet,
  loginPost,
  logout,
} = require("../controllers/auth.controller");
const router = express.Router();

router.get("/signup", signupGet);
router.post("/signup", signupPost);
router.get("/login", loginGet);
router.post("/login", loginPost);
router.post("/logout", logout);

module.exports = router;
