const User = require("../models/user.model");
const Story = require("../models/story.model");
const STORY_CATEGORIES = require("../utils/storyCategories");

exports.stats = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).populate(
      "progress.story"
    );

    if (!user) {
      return res.status(404).render("user/stats", {
        title: "My Stats",
        dbUser: null,
        storiesCompleted: 0,
        overview: {
          totalEndingsFound: 0,
          storiesStarted: 0,
          storiesCreated: 0,
          trueEndingsFound: 0,
          deathEndingsFound: 0,
          secretEndingsFound: 0,
          pathsUnlocked: 0,
        },
        trophies: [],
        trophyRequirements: [],
      });
    }

    const allStories = await Story.find().select("_id endings");
    const storyMap = new Map(
      allStories.map((story) => [String(story._id), story])
    );

    const storiesStarted = user.progress.filter((p) => Boolean(p.story)).length;
    let storiesCompleted = 0;
    let totalEndingsFound = 0;
    let trueEndingsFound = 0;
    let deathEndingsFound = 0;
    let secretEndingsFound = 0;
    let pathsUnlocked = 0;

    user.progress.forEach((p) => {
      const storyId = String(p.story?._id || p.story || "");
      const story = storyMap.get(storyId);
      const endings = Array.isArray(story?.endings) ? story.endings : [];
      const endingsById = new Map(
        endings.map((ending) => [String(ending._id), ending])
      );

      const foundSet = new Set((p.endingsFound || []).map((id) => String(id)));
      totalEndingsFound += foundSet.size;

      if (endings.length > 0 && foundSet.size >= endings.length) {
        storiesCompleted += 1;
      }

      foundSet.forEach((endingId) => {
        const ending = endingsById.get(endingId);
        if (!ending) return;
        if (ending.type === "true") trueEndingsFound += 1;
        if (ending.type === "death") deathEndingsFound += 1;
        if (ending.type === "secret") secretEndingsFound += 1;
      });

      if (Array.isArray(p.unlockedChoices)) {
        pathsUnlocked += p.unlockedChoices.length;
      }
    });

    user.storiesRead = storiesCompleted; // reuse the field to reflect completions

    const storiesCreated = 0; // placeholder until authoring stats are tracked

    const gradeTrophy = (value, thresholds) => {
      if (value >= thresholds.platinum) return "platinum";
      if (value >= thresholds.gold) return "gold";
      if (value >= thresholds.silver) return "silver";
      if (value >= thresholds.bronze) return "bronze";
      return "none";
    };

    const trophyLevels = {
      storiesCompleted: gradeTrophy(storiesCompleted, {
        bronze: 1,
        silver: 3,
        gold: 5,
        platinum: 10,
      }),
      secretEndings: gradeTrophy(secretEndingsFound, {
        bronze: 1,
        silver: 3,
        gold: 5,
        platinum: 10,
      }),
      storyBuilder: "none",
      bigSpender: gradeTrophy(pathsUnlocked, {
        bronze: 1,
        silver: 5,
        gold: 10,
        platinum: 20,
      }),
    };

    const formatLevel = (level) =>
      level === "none"
        ? "No trophy yet"
        : `${level.charAt(0).toUpperCase()}${level.slice(1)}`;

    const trophies = [
      {
        key: "storiesCompleted",
        label: "Stories Completed",
        level: trophyLevels.storiesCompleted,
        levelLabel: formatLevel(trophyLevels.storiesCompleted),
        progressText:
          storiesCompleted === 1
            ? "1 story finished"
            : `${storiesCompleted} stories finished`,
      },
      {
        key: "secretEndings",
        label: "Secret Endings",
        level: trophyLevels.secretEndings,
        levelLabel: formatLevel(trophyLevels.secretEndings),
        progressText:
          secretEndingsFound === 1
            ? "1 secret ending discovered"
            : `${secretEndingsFound} secret endings discovered`,
      },
      {
        key: "storyBuilder",
        label: "Story Builder",
        level: trophyLevels.storyBuilder,
        levelLabel: "Coming soon",
        progressText: "Create and publish adventures to earn this trophy.",
      },
      {
        key: "bigSpender",
        label: "Big Spender",
        level: trophyLevels.bigSpender,
        levelLabel: formatLevel(trophyLevels.bigSpender),
        progressText:
          pathsUnlocked === 1
            ? "1 path unlocked"
            : `${pathsUnlocked} paths unlocked`,
      },
    ];

    const trophyRequirements = [
      {
        label: "Stories Completed Trophy",
        requirements: [
          "Bronze: Finish 1 story",
          "Silver: Finish 3 stories",
          "Gold: Finish 5 stories",
          "Platinum: Finish 10 stories",
        ],
      },
      {
        label: "Secret Endings Trophy",
        requirements: [
          "Bronze: Find 1 secret ending",
          "Silver: Find 3 secret endings",
          "Gold: Find 5 secret endings",
          "Platinum: Find 10 secret endings",
        ],
      },
      {
        label: "Story Builder Trophy",
        requirements: [
          "Bronze: Publish your first story (coming soon)",
          "Silver: Publish 3 stories (coming soon)",
          "Gold: Publish 5 stories (coming soon)",
          "Platinum: Publish 10 stories (coming soon)",
        ],
      },
      {
        label: "Big Spender Trophy",
        requirements: [
          "Bronze: Unlock 1 path",
          "Silver: Unlock 5 paths",
          "Gold: Unlock 10 paths",
          "Platinum: Unlock 20 paths",
        ],
      },
    ];

    res.render("user/stats", {
      title: "My Stats",
      dbUser: user,
      storiesCompleted,
      overview: {
        totalEndingsFound,
        storiesStarted,
        storiesCreated,
        trueEndingsFound,
        deathEndingsFound,
        secretEndingsFound,
        pathsUnlocked,
      },
      trophies,
      trophyRequirements,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading stats");
  }
};

exports.library = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const stories = await Story.find({ status: { $ne: "invisible" } })
      .sort({ displayOrder: 1, createdAt: -1 })
      .select(
        "title description coverImage endings status displayOrder categories"
      )
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
        categories: Array.isArray(story.categories) ? story.categories : [],
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
      categories: STORY_CATEGORIES,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .render("user/library", {
        title: "Library",
        stories: [],
        trophyPopups: [],
        categories: STORY_CATEGORIES,
      });
  }
};
