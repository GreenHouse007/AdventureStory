const Story = require("../models/story.model");
const User = require("../models/user.model");

const LEVEL_ORDER = ["none", "bronze", "silver", "gold", "platinum"];

const TROPHY_CONFIG = {
  storyBuilder: {
    thresholds: { bronze: 1, silver: 3, gold: 5, platinum: 10 },
    rewards: { bronze: 25, silver: 50, gold: 100, platinum: 200 },
    currencyLabel: "author gems",
    message: (level) => `Story Builder trophy reached ${titleCase(level)}!`,
  },
  publishedAuthor: {
    thresholds: { bronze: 1, silver: 3, gold: 5, platinum: 10 },
    rewards: { bronze: 40, silver: 80, gold: 160, platinum: 300 },
    currencyLabel: "author gems",
    message: (level) => `Published Author trophy reached ${titleCase(level)}!`,
  },
  communityReader: {
    thresholds: { bronze: 3, silver: 6, gold: 10, platinum: 20 },
    rewards: { bronze: 15, silver: 30, gold: 75, platinum: 150 },
    currencyLabel: "author gems",
    message: (level) => `Community Reader trophy reached ${titleCase(level)}!`,
  },
};

const titleCase = (value) => {
  if (!value) return "";
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};

const ensurePopupQueue = (session) => {
  if (!session) return null;
  if (!Array.isArray(session.trophyPopups)) {
    session.trophyPopups = [];
  }
  return session.trophyPopups;
};

const computeLevel = (value, thresholds) => {
  const amount = Number(value) || 0;
  if (!thresholds) return "none";
  if (amount >= thresholds.platinum) return "platinum";
  if (amount >= thresholds.gold) return "gold";
  if (amount >= thresholds.silver) return "silver";
  if (amount >= thresholds.bronze) return "bronze";
  return "none";
};

const ensureTrophyContainer = (user) => {
  if (!user.trophies) {
    user.trophies = {};
  }
  ["storyBuilder", "publishedAuthor", "communityReader"].forEach((key) => {
    if (!user.trophies[key]) {
      user.trophies[key] = "none";
    }
  });
};

const ensureUserDoc = async (userOrId) => {
  if (!userOrId) return null;
  if (typeof userOrId === "object" && typeof userOrId.save === "function") {
    return userOrId;
  }
  return User.findById(userOrId);
};

const applyTrophyProgress = ({ user, key, value, session }) => {
  if (!user) {
    return { changed: false, newLevel: "none", reward: 0, value: Number(value) || 0 };
  }

  const config = TROPHY_CONFIG[key];
  if (!config) {
    return { changed: false, newLevel: user.trophies?.[key] || "none", reward: 0, value: Number(value) || 0 };
  }

  ensureTrophyContainer(user);

  const numericValue = Number(value) || 0;
  const newLevel = computeLevel(numericValue, config.thresholds);
  const previousLevel = user.trophies[key] || "none";
  const previousIndex = LEVEL_ORDER.indexOf(previousLevel);
  const nextIndex = LEVEL_ORDER.indexOf(newLevel);

  if (nextIndex > previousIndex) {
    user.trophies[key] = newLevel;
    if (typeof user.markModified === "function") {
      user.markModified("trophies");
    }

    const reward = Number(config.rewards?.[newLevel]) || 0;
    if (reward > 0) {
      user.authorCurrency = (Number(user.authorCurrency) || 0) + reward;
    }

    const queue = ensurePopupQueue(session);
    if (queue && reward > 0) {
      queue.push({
        message: typeof config.message === "function"
          ? config.message(newLevel, numericValue)
          : `${titleCase(key.replace(/([A-Z])/g, " $1"))} trophy reached ${titleCase(newLevel)}!`,
        amount: reward,
        currencyLabel: config.currencyLabel || "coins",
      });
    }

    return { changed: true, newLevel, reward, value: numericValue };
  }

  return { changed: false, newLevel: previousLevel, reward: 0, value: numericValue };
};

const updateStoryBuilderTrophy = async (userOrId, { session } = {}) => {
  const user = await ensureUserDoc(userOrId);
  if (!user) return { changed: false, newLevel: "none", reward: 0, value: 0 };
  const count = await Story.countDocuments({ author: user._id, origin: "user" });
  const result = applyTrophyProgress({ user, key: "storyBuilder", value: count, session });
  return { ...result, user, value: count };
};

const updatePublishedAuthorTrophy = async (userOrId, { session } = {}) => {
  const user = await ensureUserDoc(userOrId);
  if (!user) return { changed: false, newLevel: "none", reward: 0, value: 0 };
  const count = await Story.countDocuments({
    author: user._id,
    origin: "user",
    status: "public",
  });
  const result = applyTrophyProgress({ user, key: "publishedAuthor", value: count, session });
  return { ...result, user, value: count };
};

const updateCommunityReaderTrophy = async (userOrId, { session } = {}) => {
  const user = await ensureUserDoc(userOrId);
  if (!user) return { changed: false, newLevel: "none", reward: 0, value: 0 };

  const progressEntries = Array.isArray(user.progress) ? user.progress : [];
  const storyIds = Array.from(
    new Set(
      progressEntries
        .map((entry) => {
          const story = entry?.story;
          if (!story) return null;
          return typeof story === "object" && story._id ? String(story._id) : String(story);
        })
        .filter(Boolean)
    )
  );

  if (storyIds.length === 0) {
    ensureTrophyContainer(user);
    return {
      changed: false,
      newLevel: user.trophies?.communityReader || "none",
      reward: 0,
      value: 0,
    };
  }

  const stories = await Story.find({ _id: { $in: storyIds } })
    .select("origin author")
    .lean();
  const userId = String(user._id);
  const count = stories.filter((story) => {
    if (!story || story.origin !== "user") return false;
    if (!story.author) return true;
    const authorId = typeof story.author === "object" && story.author._id
      ? String(story.author._id)
      : String(story.author);
    return authorId !== userId;
  }).length;

  const result = applyTrophyProgress({ user, key: "communityReader", value: count, session });
  return { ...result, user, value: count };
};

module.exports = {
  TROPHY_CONFIG,
  computeLevel,
  ensurePopupQueue,
  updateStoryBuilderTrophy,
  updatePublishedAuthorTrophy,
  updateCommunityReaderTrophy,
};
