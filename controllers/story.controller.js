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

  res.render("user/storyLanding", {
    title: story.title,
    story,
    startNodeId,
    continueNodeId, // <-- view will hide button if null
    user: req.user,
    progress: {
      foundCount,
      totalEndings,
    },
    lockedPaths: {
      total: totalLockedPaths,
      unlocked: unlockedLockedPaths,
    },
  });
};

// Play a node (section)
exports.playNode = async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) return res.status(404).send("Story not found");

  const node = story.nodes.find((n) => n._id === req.params.nodeId);
  if (!node || node.type === "divider")
    return res.status(404).send("Node not found");

  const feedback = req.session.choiceUnlockFeedback || null;
  if (req.session.choiceUnlockFeedback) {
    delete req.session.choiceUnlockFeedback;
  }

  let unlockedSet = new Set();
  let userCurrency = req.user?.currency ?? 0;

  // Save progress.lastNodeId so "Continue" works and gather unlocked choices
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
          unlockedChoices: [],
        };
        user.progress.push(p);
      } else {
        p.lastNodeId = node._id;
        if (!Array.isArray(p.unlockedChoices)) {
          p.unlockedChoices = [];
        }
      }
      unlockedSet = new Set(p.unlockedChoices || []);
      await user.save();
      userCurrency = user.currency;
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
    showCurrency,
    hasLockedChoices,
    feedback,
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
          unlockedChoices: [],
        };
        user.progress.push(p);
      } else {
        p.lastNodeId = null; // <-- key bit: they just hit an END
        if (!Array.isArray(p.unlockedChoices)) {
          p.unlockedChoices = [];
        }
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
  if (user.currency < cost) {
    req.session.choiceUnlockFeedback = {
      type: "error",
      message: `You need ${cost} gems to unlock this choice.`,
    };
    return res.redirect(redirectUrl);
  }

  user.currency -= cost;
  progressEntry.unlockedChoices.push(key);

  await user.save();
  req.user = user;
  res.locals.user = user;

  const successMessage =
    cost > 0
      ? `Unlocked "${choice.label}" for ${cost} gems!`
      : `Unlocked "${choice.label}"!`;

  req.session.choiceUnlockFeedback = {
    type: "success",
    message: successMessage,
  };

  return res.redirect(redirectUrl);
};
