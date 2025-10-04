const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { requireAdmin } = require("../middleware/auth");
const controller = require("../controllers/admin.controller");

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
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

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

/* ---------------- Nodes ---------------- */
router.post("/stories/:id/nodes/add", controller.storyNodeAddPost);
router.post(
  "/stories/:id/nodes/:nodeId/update-inline",
  controller.storyNodeUpdateInline
);
router.post("/stories/:id/nodes/:nodeId/delete", controller.storyNodeDelete);

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

/* Ending Reorder */
router.post("/stories/:id/endings/reorder", controller.endingsReorder);

/* ---------------- Images ---------------- */
router.get("/stories/:id/images", controller.listImages);
router.post(
  "/stories/:id/images/upload",
  upload.single("image"),
  controller.uploadImage
);

module.exports = router;
