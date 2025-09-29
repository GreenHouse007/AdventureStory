const express = require("express");
const router = express.Router();

const publicRoutes = require("./public.routes");
const userRoutes = require("./user.routes");
const adminRoutes = require("./admin.routes");
const authRoutes = require("./auth.routes");
router.use("/", authRoutes);
router.use("/", publicRoutes);
router.use("/u", userRoutes); // e.g., /u/library, /u/stats
router.use("/admin", adminRoutes); // e.g., /admin/stories, /admin/users

module.exports = router;
