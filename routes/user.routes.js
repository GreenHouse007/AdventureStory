const express = require("express");
const { requireAuth } = require("../middleware/auth");
const {
  library,
  stats,
  userStoriesLibrary,
  authorDashboard,
  authorStoryForm,
  authorStoryCreate,
  authorStoryUpdate,
  authorStorySubmit,
  authorStorySetPrivate,
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
router.get("/authors/stories/new", authorStoryForm);
router.get("/authors/stories/:id/edit", authorStoryForm);
router.post("/authors/stories", authorStoryCreate);
router.post("/authors/stories/:id", authorStoryUpdate);
router.post("/authors/stories/:id/submit", authorStorySubmit);
router.post("/authors/stories/:id/private", authorStorySetPrivate);
router.get("/story/:id", storyLanding);
router.get("/play/:id/:nodeId", playNode);
router.get("/play/:id/ending/:endingId", playEnding);
router.post(
  "/story/:id/nodes/:nodeId/choices/:choiceId/unlock",
  unlockChoice
);

module.exports = router;
