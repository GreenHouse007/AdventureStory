const Story = require("../models/story.model");
const User = require("../models/user.model");
const { updateUserMedals } = require("../utils/updateMedals");
const { getReturnPath } = require("../utils/navigation");
const { updateCommunityReaderTrophy, ensurePopupQueue } = require("../utils/authorRewards");

const STORY_STATUS_DISPLAY = {
  public: "Public",
  coming_soon: "Coming Soon",
  pending: "Pending Review",
  under_review: "Under Review",
  private: "Private",
  invisible: "Hidden",
};

const toStringId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.toString) return value.toString();
  try {
    return String(value);
  } catch (err) {
    return "";
  }
};

const isUserStory = (story) => story?.origin === "user";

const isStoryOwner = (story, user) => {
  if (!story || !user) return false;
  const authorId = toStringId(story.author?._id || story.author);
  return authorId && toStringId(user._id) === authorId;
};

const isAdminUser = (user) => user?.role === "admin";

const canViewStory = (story, user) => {
  if (!story) return false;
  const status = story.status || "invisible";
  if (isUserStory(story)) {
    if (status === "private") {
      return isStoryOwner(story, user) || isAdminUser(user);
    }
    return true; // pending/under_review/public visible to all
  }
  if (status === "invisible") {
    return isAdminUser(user);
  }
  return true;
};

const canPlayStory = (story, user) => {
  if (!story) return false;
  if (isUserStory(story)) {
    if (story.status === "public") return true;
    return isStoryOwner(story, user) || isAdminUser(user);
  }
  if (story.status === "public") return true;
  return isAdminUser(user);
};

const getCurrencyInfo = (story, user) => {
  if (isUserStory(story)) {
    return {
      field: "authorCurrency",
      balance: Number(user?.authorCurrency) || 0,
      label: "Your author gems",
      singular: "Author gem",
      plural: "Author gems",
      iconClass: "icon-author-gem",
    };
  }
  return {
    field: "currency",
    balance: Number(user?.currency) || 0,
    label: "Your gems",
    singular: "gem",
    plural: "gems",
    iconClass: "icon-gem",
  };
};

// Landing page for a story
exports.storyLanding = async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) return res.status(404).send("Story not found");

  if (!canViewStory(story, req.user)) {
    return res.status(403).render("public/403", {
      title: "Story Unavailable",
      user: req.user,
      backLink: getReturnPath(req),
    });
  }

  const startNodeId =
    story.startNodeId || (story.nodes.length > 0 ? story.nodes[0]._id : null);

  const canPlay = canPlayStory(story, req.user);
  const owner = isStoryOwner(story, req.user);
  const statusLabel =
    STORY_STATUS_DISPLAY[story.status] || STORY_STATUS_DISPLAY.invisible;

  const adminPreview = req.query.adminPreview === "1" || req.query.from === "admin";
  let adminReturnUrl = "/admin";
  if (adminPreview && typeof req.query.return === "string") {
    try {
      const decoded = decodeURIComponent(req.query.return);
      if (decoded.startsWith("/admin")) {
        adminReturnUrl = decoded;
      }
    } catch (err) {
      adminReturnUrl = "/admin";
    }
  }
  if (!adminReturnUrl.startsWith("/admin")) {
    adminReturnUrl = "/admin";
  }

  let continueNodeId = null;
  const totalEndings = Array.isArray(story.endings) ? story.endings.length : 0;
  let foundCount = 0;
  const totalLockedPaths = story.nodes.reduce((acc, node) => {
    const choices = Array.isArray(node.choices) ? node.choices : [];
    return (
      acc +
      choices.reduce((count, choice) => count + (choice.locked ? 1 : 0), 0)
    );
  }, 0);
  const lockedChoiceKeys = new Set();
  story.nodes.forEach((node) => {
    const nodeChoices = Array.isArray(node.choices) ? node.choices : [];
    nodeChoices
      .filter((choice) => choice.locked)
      .forEach((choice) => {
        lockedChoiceKeys.add(`${node._id}:${choice._id}`);
      });
  });
  let unlockedLockedPaths = 0;
  if (req.session?.userId) {
    const user = await User.findById(req.session.userId).select("progress");
    const p = user?.progress?.find(
      (pr) => String(pr.story) === String(story._id)
    );
    if (p?.lastNodeId) {
      const existsAsNode = story.nodes.some((n) => n._id === p.lastNodeId);
      if (existsAsNode) continueNodeId = p.lastNodeId;
    }
    if (Array.isArray(p?.endingsFound)) {
      const uniqueEndings = new Set(p.endingsFound.map((id) => String(id)));
      foundCount = uniqueEndings.size;
    }
    if (lockedChoiceKeys.size > 0 && Array.isArray(p?.unlockedChoices)) {
      unlockedLockedPaths = p.unlockedChoices.filter((key) =>
        lockedChoiceKeys.has(key)
      ).length;
    }
  }

  if (!canPlay) {
    continueNodeId = null;
  }

  res.render("user/storyLanding", {
    title: story.title,
    story,
    startNodeId,
    continueNodeId,
    user: req.user,
    progress: {
      foundCount,
      totalEndings,
    },
    lockedPaths: {
      total: totalLockedPaths,
      unlocked: unlockedLockedPaths,
    },
    storyAccess: {
      canPlay,
      isOwner: owner,
      isAdmin: isAdminUser(req.user),
      status: story.status,
      statusLabel,
      isUserStory: isUserStory(story),
    },
    adminPreview: adminPreview && isAdminUser(req.user),
    adminReturnUrl:
      adminPreview && isAdminUser(req.user) ? adminReturnUrl : null,
  });
};

// Play a node (section)
exports.playNode = async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) return res.status(404).send("Story not found");

  if (!canPlayStory(story, req.user)) {
    return res.status(403).render("public/403", {
      title: "Story Unavailable",
      user: req.user,
      backLink: getReturnPath(req),
    });
  }

  const node = story.nodes.find((n) => n._id === req.params.nodeId);
  if (!node || node.type === "divider")
    return res.status(404).send("Node not found");

  const feedback = req.session.choiceUnlockFeedback || null;
  if (req.session.choiceUnlockFeedback) {
    delete req.session.choiceUnlockFeedback;
  }

  let unlockedSet = new Set();
  let currencyMeta = getCurrencyInfo(story, req.user);
  let userCurrency = currencyMeta.balance;

  // Save progress.lastNodeId so "Continue" works and gather unlocked choices
  if (req.session?.userId) {
    const user = await User.findById(req.session.userId);
    if (user) {
      let p = user.progress.find(
        (pr) => String(pr.story) === String(story._id)
      );
      let createdProgress = false;
      if (!p) {
        p = {
          story: story._id,
          endingsFound: [],
          trueEndingFound: false,
          deathEndingCount: 0,
          lastNodeId: node._id,
          unlockedChoices: [],
        };
        user.progress.push(p);
        createdProgress = true;
      } else {
        p.lastNodeId = node._id;
        if (!Array.isArray(p.unlockedChoices)) {
          p.unlockedChoices = [];
        }
      }
      unlockedSet = new Set(p.unlockedChoices || []);
      await user.save();
      if (createdProgress && story.origin === "user") {
        const trophyResult = await updateCommunityReaderTrophy(user, {
          session: req.session,
        });
        if (trophyResult.changed) {
          await user.save();
        }
      }
      currencyMeta = getCurrencyInfo(story, user);
      userCurrency = currencyMeta.balance;
      req.user = user;
      res.locals.user = user;
    }
  }

  const nodeData = node.toObject ? node.toObject({ depopulate: true }) : JSON.parse(JSON.stringify(node));
  nodeData.choices = (Array.isArray(nodeData.choices) ? nodeData.choices : []).map(
    (choice) => {
      const key = `${node._id}:${choice._id}`;
      const isLocked = Boolean(choice.locked);
      const parsedCost = Number(choice.unlockCost);
      const unlockCost = Number.isFinite(parsedCost) ? Math.max(parsedCost, 0) : 0;
      const isUnlocked = !isLocked || unlockedSet.has(key);
      return {
        ...choice,
        isLocked,
        unlockCost,
        isUnlocked,
        lockKey: key,
      };
    }
  );

  const showCurrency = nodeData.choices.some(
    (choice) => choice.isLocked && !choice.isUnlocked
  );
  const hasLockedChoices = nodeData.choices.some((choice) => choice.isLocked);

  res.render("user/playNode", {
    title: story.title,
    story,
    node: nodeData,
    user: req.user,
    currency: userCurrency,
    currencyMeta,
    showCurrency,
    hasLockedChoices,
    feedback,
    isUserStory: isUserStory(story),
  });
};

// Play an ending
exports.playEnding = async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) return res.status(404).send("Story not found");

  if (!canPlayStory(story, req.user)) {
    return res.status(403).render("public/403", {
      title: "Story Unavailable",
      user: req.user,
      backLink: getReturnPath(req),
    });
  }

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
          unlockedChoices: [],
        };
        user.progress.push(p);
      } else {
        p.lastNodeId = null; // <-- key bit: they just hit an END
        if (!Array.isArray(p.unlockedChoices)) {
          p.unlockedChoices = [];
        }
      }

      const endingId = String(ending._id);
      if (!Array.isArray(p.endingsFound)) {
        p.endingsFound = [];
      }
      const alreadyFound = p.endingsFound.some((id) => String(id) === endingId);
      if (!alreadyFound) {
        p.endingsFound.push(endingId);
        user.totalEndingsFound = (Number(user.totalEndingsFound) || 0) + 1;
        if (ending.type === "true") {
          p.trueEndingFound = true;
        }
        if (ending.type === "death") {
          p.deathEndingCount = (Number(p.deathEndingCount) || 0) + 1;
        }
        if (story.origin === "user") {
          const reward = 5;
          user.authorCurrency = (Number(user.authorCurrency) || 0) + reward;
          const queue = ensurePopupQueue(req.session);
          if (queue) {
            queue.push({
              message: "You earned author gems for discovering a new ending!",
              amount: reward,
              currencyLabel: "author gems",
            });
          }
        }
      }

      updateUserMedals(user);

      await user.save();
      req.user = user;
      res.locals.user = user;
    }
  }

  res.render("user/ending", {
    title: ending.label || ending._id,
    story,
    ending,
    user: req.user,
  });
};

exports.unlockChoice = async (req, res) => {
  const { id, nodeId, choiceId } = req.params;
  const redirectUrl = `/u/play/${id}/${nodeId}`;

  if (!req.session?.userId) {
    req.session.choiceUnlockFeedback = {
      type: "error",
      message: "Please sign in to unlock this choice.",
    };
    return res.redirect(redirectUrl);
  }

  const story = await Story.findById(id);
  if (!story) {
    req.session.choiceUnlockFeedback = {
      type: "error",
      message: "Story not found.",
    };
    return res.redirect(redirectUrl);
  }

  if (!canPlayStory(story, req.user)) {
    req.session.choiceUnlockFeedback = {
      type: "error",
      message: "This story is not available to play right now.",
    };
    return res.redirect(redirectUrl);
  }

  const node = story.nodes.find((n) => n._id === nodeId);
  if (!node) {
    req.session.choiceUnlockFeedback = {
      type: "error",
      message: "Passage not found.",
    };
    return res.redirect(redirectUrl);
  }

  const choice = node.choices.id(choiceId);
  if (!choice) {
    req.session.choiceUnlockFeedback = {
      type: "error",
      message: "Choice not found.",
    };
    return res.redirect(redirectUrl);
  }

  if (!choice.locked) {
    req.session.choiceUnlockFeedback = {
      type: "info",
      message: "This choice is already available.",
    };
    return res.redirect(redirectUrl);
  }

  const user = await User.findById(req.session.userId);
  if (!user) {
    req.session.choiceUnlockFeedback = {
      type: "error",
      message: "User not found.",
    };
    return res.redirect(redirectUrl);
  }

  const currencyMeta = getCurrencyInfo(story, user);
  const balanceBefore = Number(user[currencyMeta.field]) || 0;

  let progressEntry = user.progress.find(
    (pr) => String(pr.story) === String(story._id)
  );
  if (!progressEntry) {
    progressEntry = {
      story: story._id,
      endingsFound: [],
      trueEndingFound: false,
      deathEndingCount: 0,
      lastNodeId: node._id,
      unlockedChoices: [],
    };
    user.progress.push(progressEntry);
  } else {
    progressEntry.lastNodeId = node._id;
    if (!Array.isArray(progressEntry.unlockedChoices)) {
      progressEntry.unlockedChoices = [];
    }
  }

  const key = `${node._id}:${choice._id}`;
  const alreadyUnlocked = progressEntry.unlockedChoices.includes(key);
  if (alreadyUnlocked) {
    req.session.choiceUnlockFeedback = {
      type: "info",
      message: "You have already unlocked this choice.",
    };
    return res.redirect(redirectUrl);
  }

  const cost = Math.max(Number(choice.unlockCost) || 0, 0);
  if (balanceBefore < cost) {
    const unitsLabel = cost === 1 ? currencyMeta.singular : currencyMeta.plural;
    req.session.choiceUnlockFeedback = {
      type: "error",
      message: `You need ${cost} ${unitsLabel.toLowerCase()} to unlock this choice.`,
    };
    return res.redirect(redirectUrl);
  }

  user[currencyMeta.field] = balanceBefore - cost;
  progressEntry.unlockedChoices.push(key);

  await user.save();
  req.user = user;
  res.locals.user = user;

  const successMessage =
    cost > 0
      ? `Unlocked "${choice.label}" for ${cost} ${
          cost === 1 ? currencyMeta.singular.toLowerCase() : currencyMeta.plural.toLowerCase()
        }!`
      : `Unlocked "${choice.label}"!`;

  req.session.choiceUnlockFeedback = {
    type: "success",
    message: successMessage,
  };

  return res.redirect(redirectUrl);
};
