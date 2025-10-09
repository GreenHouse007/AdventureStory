require("dotenv").config();
const express = require("express");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { requireAuth } = require("../middleware/auth");
const {
  library,
  stats,
  userStoriesLibrary,
  authorDashboard,
  authorStoryCreateDraft,
  authorStoryForm,
  authorStoryCreate,
  authorStoryUpdate,
  authorStorySubmit,
  authorStorySetPrivate,
  authorStoryDelete,
  authorStoryImages,
  authorStoryImageUpload,
  authorStoryImageDelete,
} = require("../controllers/user.controller");
const {
  storyLanding,
  playNode,
  playEnding,
  unlockChoice,
} = require("../controllers/story.controller");

const router = express.Router();

router.use(requireAuth); // everything requires login
router.get("/library", library);
router.get("/library/user-stories", userStoriesLibrary);
router.get("/stats", stats);
router.get("/authors", authorDashboard);
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const authorImageStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const storyId = req.params.id;
    const authorId = req.user?._id ? String(req.user._id) : "unknown";
    const baseName = (file.originalname || "image")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9-_]+/gi, "-");
    return {
      folder: `authors/${authorId}/${storyId || "library"}`,
      public_id: `${Date.now()}-${baseName}`,
      resource_type: "image",
      allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
      transformation: [{ quality: "auto", fetch_format: "auto" }],
      context: {
        story_id: String(storyId || ""),
        author_id: authorId,
      },
    };
  },
});

const authorImageUpload = multer({
  storage: authorImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /image\/(png|jpe?g|gif|webp)$/i.test(file.mimetype);
    cb(ok ? null : new Error("Only image files are allowed"), ok);
  },
});

router.post("/authors/stories/new", authorStoryCreateDraft);
router.get("/authors/stories/:id/edit", authorStoryForm);
router.post("/authors/stories", authorStoryCreate);
router.post("/authors/stories/:id", authorStoryUpdate);
router.post("/authors/stories/:id/submit", authorStorySubmit);
router.post("/authors/stories/:id/private", authorStorySetPrivate);
router.post("/authors/stories/:id/delete", authorStoryDelete);
router.get("/authors/stories/:id/images", authorStoryImages);
router.post(
  "/authors/stories/:id/images/upload",
  authorImageUpload.single("image"),
  authorStoryImageUpload
);
router.post(
  "/authors/stories/:id/images/delete",
  authorStoryImageDelete
);
router.get("/story/:id", storyLanding);
router.get("/play/:id/:nodeId", playNode);
router.get("/play/:id/ending/:endingId", playEnding);
router.post(
  "/story/:id/nodes/:nodeId/choices/:choiceId/unlock",
  unlockChoice
);

module.exports = router;
