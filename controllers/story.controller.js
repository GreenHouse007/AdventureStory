const Story = require("../models/story.model");
const User = require("../models/user.model");

// Landing page for a story
exports.storyLanding = async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) return res.status(404).send("Story not found");

  // Fallback: if no startNodeId, default to the first node
  const startNodeId =
    story.startNodeId || (story.nodes.length > 0 ? story.nodes[0]._id : null);

  res.render("user/storyLanding", {
    title: story.title,
    story,
    startNodeId,
    user: req.user,
  });
};

// Play a node (section)
exports.playNode = async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) return res.status(404).send("Story not found");

  const node = story.nodes.find((n) => n._id === req.params.nodeId);
  if (!node) return res.status(404).send("Node not found");

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

  // TODO: update user progress (endingsFound, medals, currency)
  res.render("user/ending", {
    title: ending.label,
    story,
    ending,
    user: req.user,
  });
};
