const express = require("express");
const { requireAdmin } = require("../middleware/auth");
const {
  dashboard,
  storiesList,
  newStoryGet,
  newStoryPost,
  editStoryGet,
  editStoryPost,
  usersList,
  userDetail,
  userUpdate,
} = require("../controllers/admin.controller");
const { toggleAdmin } = require("../controllers/admin.controller");

const router = express.Router();
router.use(requireAdmin); // all admin routes are protected

router.get("/", dashboard);
router.get("/stories", storiesList);
router.get("/stories/new", newStoryGet);
router.post("/stories/new", newStoryPost);
router.get("/stories/:id/edit", editStoryGet);
router.post("/stories/:id/edit", editStoryPost);
router.get("/users", usersList);
router.get("/users/:id", userDetail);
router.post("/users/:id", userUpdate);
//router.post("/users/:id/toggle", toggleAdmin);

module.exports = router;
