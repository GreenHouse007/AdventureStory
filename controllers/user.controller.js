const User = require("../models/user.model");
const Story = require("../models/story.model");

exports.stats = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).populate(
      "progress.story"
    );
    res.render("user/stats", { title: "My Stats", dbUser: user });
    // note: still passing dbUser if you need progress data
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading stats");
  }
};

exports.library = async (req, res) => {
  try {
    const stories = await Story.find().select(
      "title description coverImage endings"
    );
    res.render("user/library", { title: "Library", stories });
  } catch (err) {
    console.error(err);
    res.status(500).render("user/library", { title: "Library", stories: [] });
  }
};
