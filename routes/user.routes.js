const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { library, stats } = require("../controllers/user.controller");
const {
  storyLanding,
  playNode,
  playEnding,
} = require("../controllers/story.controller");

const router = express.Router();

router.use(requireAuth); // everything requires login
router.get("/library", library);
router.get("/stats", stats);
router.get("/story/:id", storyLanding);
router.get("/play/:id/:nodeId", playNode);
router.get("/play/:id/ending/:endingId", playEnding);

module.exports = router;
