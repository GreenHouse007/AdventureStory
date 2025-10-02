const express = require("express");

const multer = require("multer");
const fs = require("fs");
const path = require("path");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(
      __dirname,
      "..",
      "public",
      "uploads",
      "stories",
      req.params.id
    );
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

const { requireAdmin } = require("../middleware/auth");
const {
  dashboard,
  storiesList,
  storyAddForm,
  storyAddPost,
  storyEditForm,
  storyEditPost,
  storyDelete,
  usersList,
  userAddForm,
  userAddPost,
  userDetail,
  userUpdate,
  userResetPassword,
  userDelete,
  storyNodeAddForm,
  storyNodeAddPost,
  storyNodeEditForm,
  storyNodeEditPost,
  storyNodeDelete,
  storyEndingAddForm,
  storyEndingAddPost,
  storyEndingEditForm,
  storyEndingEditPost,
  storyEndingDelete,
  nodeChoiceAdd,
  nodeChoiceDelete,
} = require("../controllers/admin.controller");
const { listImages, uploadImage } = require("../controllers/admin.controller");

const router = express.Router();
router.use(requireAdmin); // all admin routes are protected

// Dashboard
router.get("/", dashboard);

// Stories
router.get("/stories", storiesList);
router.get("/stories/add", storyAddForm);
router.post("/stories/add", storyAddPost);
router.get("/stories/:id/edit", storyEditForm);
router.post("/stories/:id/edit", storyEditPost);
router.post("/stories/:id/delete", storyDelete);

// Users
router.get("/users", usersList);
router.get("/users/add", userAddForm);
router.post("/users/add", userAddPost);
router.get("/users/:id", userDetail);
router.post("/users/:id", userUpdate);
router.post("/users/:id/reset-password", userResetPassword);
router.post("/users/:id/delete", userDelete);

// Nodes
router.get("/stories/:id/nodes/add", storyNodeAddForm);
router.post("/stories/:id/nodes/add", storyNodeAddPost);
router.get("/stories/:id/nodes/:nodeId/edit", storyNodeEditForm);
router.post("/stories/:id/nodes/:nodeId/edit", storyNodeEditPost);
router.post("/stories/:id/nodes/:nodeId/delete", storyNodeDelete);
router.post("/stories/:id/nodes/:nodeId/choices/add", nodeChoiceAdd);
router.post(
  "/stories/:id/nodes/:nodeId/choices/:choiceId/delete",
  nodeChoiceDelete
);

// Endings
router.get("/stories/:id/endings/add", storyEndingAddForm);
router.post("/stories/:id/endings/add", storyEndingAddPost);
router.get("/stories/:id/endings/:endingId/edit", storyEndingEditForm);
router.post("/stories/:id/endings/:endingId/edit", storyEndingEditPost);
router.post("/stories/:id/endings/:endingId/delete", storyEndingDelete);

// Image library
router.get("/stories/:id/images", listImages);
router.post("/stories/:id/images/upload", upload.single("image"), uploadImage);

module.exports = router;
