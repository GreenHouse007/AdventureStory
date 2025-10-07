const User = require("../models/user.model");
const Story = require("../models/story.model");

exports.stats = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).populate(
      "progress.story"
    );

    // Compute "stories completed" = all endings found for that story
    const allStories = await Story.find().select("_id endings");
    let storiesCompleted = 0;

    user.progress.forEach((p) => {
      const st = allStories.find((s) => s._id.equals(p.story?._id || p.story));
      const total = st?.endings?.length || 0;
      const found = p.endingsFound?.length || 0;
      if (total > 0 && found >= total) storiesCompleted++;
    });

    // You can store it or just render it
    user.storiesRead = storiesCompleted; // reuse the field; it now means "completed"

    res.render("user/stats", {
      title: "My Stats",
      dbUser: user,
      storiesCompleted,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading stats");
  }
};

exports.library = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const stories = await Story.find()
      .sort({ displayOrder: 1, createdAt: -1 })
      .select("title description coverImage endings status displayOrder")
      .lean();

    const storyData = stories.map((story) => {
      const progress = user.progress.find((p) => p.story.equals(story._id));
      const totalEndings = Array.isArray(story.endings)
        ? story.endings.length
        : 0;
      const foundCount = Array.isArray(progress?.endingsFound)
        ? progress.endingsFound.length
        : 0;

      return {
        ...story,
        title: story.title || "Untitled Story",
        foundCount,
        totalEndings,
      };
    });

    // Read & clear trophy popups (session flash)
    const trophyPopups = Array.isArray(req.session.trophyPopups)
      ? req.session.trophyPopups
      : [];
    req.session.trophyPopups = [];

    // Persist the clear so popups don't reappear
    await new Promise((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );

    res.render("user/library", {
      title: "Library",
      stories: storyData,
      trophyPopups,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .render("user/library", {
        title: "Library",
        stories: [],
        trophyPopups: [],
      });
  }
};
