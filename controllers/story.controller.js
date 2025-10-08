const Story = require("../models/story.model");
const User = require("../models/user.model");
const { updateUserMedals } = require("../utils/updateMedals");

// Landing page for a story
exports.storyLanding = async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) return res.status(404).send("Story not found");

  const startNodeId =
    story.startNodeId || (story.nodes.length > 0 ? story.nodes[0]._id : null);

  // Figure out if "Continue" should be shown
  let continueNodeId = null;
  if (req.session?.userId) {
    const user = await User.findById(req.session.userId).select("progress");
    const p = user?.progress?.find(
      (pr) => String(pr.story) === String(story._id)
    );
    if (p?.lastNodeId) {
      const existsAsNode = story.nodes.some((n) => n._id === p.lastNodeId);
      if (existsAsNode) continueNodeId = p.lastNodeId;
    }
  }

  res.render("user/storyLanding", {
    title: story.title,
    story,
    startNodeId,
    continueNodeId, // <-- view will hide button if null
    user: req.user,
  });
};

// Play a node (section)
exports.playNode = async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) return res.status(404).send("Story not found");

  const node = story.nodes.find((n) => n._id === req.params.nodeId);
  if (!node || node.type === "divider")
    return res.status(404).send("Node not found");

  // Save progress.lastNodeId so "Continue" works
  if (req.session?.userId) {
    const user = await User.findById(req.session.userId);
    if (user) {
      let p = user.progress.find(
        (pr) => String(pr.story) === String(story._id)
      );
      if (!p) {
        p = {
          story: story._id,
          endingsFound: [],
          trueEndingFound: false,
          deathEndingCount: 0,
          lastNodeId: node._id,
        };
        user.progress.push(p);
      } else {
        p.lastNodeId = node._id;
      }
      await user.save();
    }
  }

  res.render("user/playNode", {
    title: story.title,
    story,
    node,
    user: req.user,
  });
};

// Play an ending
exports.playEnding = async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) return res.status(404).send("Story not found");

  const ending = story.endings.find((e) => e._id === req.params.endingId);
  if (!ending) return res.status(404).send("Ending not found");

  // Update user progress minimally: clear lastNodeId so continue is hidden
  if (req.session?.userId) {
    const user = await User.findById(req.session.userId);
    if (user) {
      let p = user.progress.find(
        (pr) => String(pr.story) === String(story._id)
      );
      if (!p) {
        p = {
          story: story._id,
          endingsFound: [],
          trueEndingFound: false,
          deathEndingCount: 0,
          lastNodeId: null,
        };
        user.progress.push(p);
      } else {
        p.lastNodeId = null; // <-- key bit: they just hit an END
      }

      // (Optional) If you already track endingsFound/currency/trophies here,
      // keep your existing logic alongside this. The crucial part is clearing lastNodeId.

      await user.save();
    }
  }

  res.render("user/ending", {
    title: ending.label || ending._id,
    story,
    ending,
    user: req.user,
  });
};
