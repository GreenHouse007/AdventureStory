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
  userResetPassword,
  userDelete,
  userAddForm,
  userAddPost,
} = require("../controllers/admin.controller");

const router = express.Router();
router.use(requireAdmin); // all admin routes are protected

console.log("Admin controller:", { userDelete });

router.get("/", dashboard);
router.get("/stories", storiesList);
router.get("/stories/new", newStoryGet);
router.post("/stories/new", newStoryPost);
router.get("/stories/:id/edit", editStoryGet);
router.post("/stories/:id/edit", editStoryPost);
router.get("/users", usersList);
router.get("/users/add", userAddForm);
router.post("/users/add", userAddPost);
router.get("/users/:id", userDetail);
router.post("/users/:id", userUpdate);
router.post("/users/:id/reset-password", userResetPassword);
router.post("/users/:id/delete", userDelete);

module.exports = router;
