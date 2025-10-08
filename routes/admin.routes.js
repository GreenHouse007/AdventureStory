require("dotenv").config();
const express = require("express");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const fs = require("fs");
const path = require("path");
const { requireAdmin } = require("../middleware/auth");
const controller = require("../controllers/admin.controller");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log(
  "[Cloudinary] cloud:",
  process.env.CLOUDINARY_CLOUD_NAME,
  "key:",
  (process.env.CLOUDINARY_API_KEY || "").slice(0, 4) + "…"
);

// Store files in Cloudinary under stories/<storyId>/...
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const storyId = req.params.id; // from /stories/:id/images/upload
    return {
      folder: `stories/${storyId}`,
      public_id: `${Date.now()}-${file.originalname.replace(/\.[^.]+$/, "")}`,
      resource_type: "image",
      allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
      transformation: [{ quality: "auto", fetch_format: "auto" }],
      context: { story_id: String(storyId) },
    };
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = /image\/(png|jpe?g|gif|webp)$/i.test(file.mimetype);
    cb(ok ? null : new Error("Only image files are allowed"), ok);
  },
});

const router = express.Router();
router.use(requireAdmin);

/* ---------------- Dashboard ---------------- */
router.get("/", controller.dashboard);

/* ---------------- Stories ---------------- */
router.get("/stories", controller.storiesList);
router.get("/stories/add", controller.storyAddForm);
router.post("/stories/add", controller.storyAddPost);
router.get("/stories/:id/edit", controller.storyEditForm);
router.post("/stories/:id/edit", controller.storyEditPost);
router.post("/stories/:id/delete", controller.storyDelete);
router.post("/stories/:id/update-inline", controller.storyUpdateInline);
router.post("/stories/order", controller.updateStoriesOrder);

/* ---------------- Users ---------------- */
router.get("/users", controller.usersList);
router.get("/users/add", controller.userAddForm);
router.post("/users/add", controller.userAddPost);
router.get("/users/:id", controller.userDetail);
router.post("/users/:id", controller.userUpdate);
router.post("/users/:id/reset-password", controller.userResetPassword);
router.post("/users/:id/delete", controller.userDelete);

// --- Progress Maintenance (NEW) ---
router.post(
  "/users/:id/progress/:storyId/remove-endings",
  controller.userProgressRemoveEndings
);
router.post(
  "/users/:id/progress/:storyId/clear",
  controller.userProgressClearStory
);
router.post("/users/:id/recompute", controller.userRecomputeTotals);

/* ---------------- Nodes ---------------- */
router.post("/stories/:id/nodes/add", controller.storyNodeAddPost);
router.post(
  "/stories/:id/nodes/:nodeId/update-inline",
  controller.storyNodeUpdateInline
);
router.post("/stories/:id/nodes/:nodeId/delete", controller.storyNodeDelete);
router.post(
  "/stories/:id/nodes/:nodeId/position",
  controller.storyNodeUpdatePosition
);

/* Dividers */
router.post("/stories/:id/nodes/add-divider", controller.storyNodeAddDivider);
router.post(
  "/stories/:id/nodes/:nodeId/update-divider",
  controller.storyNodeUpdateDivider
);
router.post(
  "/stories/:id/nodes/:nodeId/delete-divider",
  controller.storyNodeDeleteDivider
);

/* Node Reorder */
router.post("/stories/:id/nodes/reorder", controller.nodesReorder);

/* ---------------- Choices ---------------- */
router.post(
  "/stories/:id/nodes/:nodeId/choices/add-inline",
  controller.nodeChoiceAddInline
);
router.post(
  "/stories/:id/nodes/:nodeId/choices/:choiceId/update-inline",
  controller.nodeChoiceUpdateInline
);
router.post(
  "/stories/:id/nodes/:nodeId/choices/:choiceId/delete",
  controller.nodeChoiceDelete
);

/* ---------------- Endings ---------------- */
router.post("/stories/:id/endings/add", controller.storyEndingAddPost);
router.post(
  "/stories/:id/endings/:endingId/update-inline",
  controller.storyEndingUpdateInline
);
router.post(
  "/stories/:id/endings/:endingId/delete",
  controller.storyEndingDelete
);
router.post(
  "/stories/:id/endings/:endingId/position",
  controller.storyEndingUpdatePosition
);

/* Ending Reorder */
router.post("/stories/:id/endings/reorder", controller.endingsReorder);

/* ---------------- Images ---------------- */
router.get("/stories/:id/images", controller.listImages);
router.post(
  "/stories/:id/images/upload",
  upload.single("image"),
  controller.uploadImage
);
// NEW: delete endpoint
router.post("/stories/:id/images/delete", controller.deleteImage);

module.exports = router;
