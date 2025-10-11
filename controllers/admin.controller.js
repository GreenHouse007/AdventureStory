const User = require("../models/user.model");
const Story = require("../models/story.model");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("node:crypto"); // built-in UUID
const { updateUserMedals } = require("../utils/updateMedals");
const { v2: cloudinary } = require("cloudinary");
const STORY_CATEGORIES = require("../utils/storyCategories");
const {
  updatePublishedAuthorTrophy,
} = require("../utils/authorRewards");

const ALLOWED_ENDING_TYPES = new Set(["true", "death", "other", "secret"]);
const ALLOWED_STORY_STATUSES = new Set([
  "public",
  "coming_soon",
  "invisible",
  "private",
  "pending",
  "under_review",
]);

const STORY_STATUS_LABELS = {
  public: "Public",
  coming_soon: "Coming Soon",
  invisible: "Hidden",
  private: "Private",
  pending: "Pending Review",
  under_review: "Under Review",
};

const commitSession = (req) =>
  new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

const setAdminFlash = async (req, flash) => {
  if (!req.session) return;
  req.session.adminFlash = flash;
  await commitSession(req);
};

const popAdminFlash = async (req) => {
  if (!req.session) return null;
  const flash = req.session.adminFlash || null;
  delete req.session.adminFlash;
  await commitSession(req);
  return flash;
};

const STORY_SEED_EXAMPLE = JSON.stringify(
  {
    title: "The Lantern Path",
    description: "A short mystery that guides readers through an enchanted forest.",
    startNodeId: "start",
    nodes: [
      {
        id: "start",
        text: "You arrive at the forest edge where pale lanterns hover above the moss.",
        choices: [
          { label: "Follow the lanterns", next: "clearing" },
          { label: "Turn back", next: "ending_lost" },
        ],
      },
      {
        id: "clearing",
        text: "A moonlit clearing opens up, revealing an ancient stone altar.",
        choices: [{ label: "Light the final lantern", next: "ending_true" }],
      },
    ],
    endings: [
      {
        id: "ending_true",
        label: "Guided Home",
        type: "true",
        text: "The spirits guide you safely back with newfound wisdom.",
      },
      {
        id: "ending_lost",
        label: "Lost to the Dark",
        type: "death",
        text: "You disappear into the fog, never to be seen again.",
      },
    ],
  },
  null,
  2
);

const buildStorySeedFromText = (rawText) => {
  if (typeof rawText !== "string" || !rawText.trim()) {
    return { error: "Enter the story seed using the required JSON format." };
  }

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch (err) {
    return {
      error: "The story seed must be valid JSON. Copy the example format and adjust it for your story.",
    };
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: "The story seed must be a JSON object." };
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (!title) {
    return { error: 'Include a non-empty "title" string.' };
  }

  const description =
    typeof payload.description === "string" ? payload.description.trim() : "";

  const nodesInput = Array.isArray(payload.nodes) ? payload.nodes : [];
  if (nodesInput.length === 0) {
    return { error: 'Provide at least one node in the "nodes" array.' };
  }

  const nodeIds = new Set();
  const nodes = [];
  for (let idx = 0; idx < nodesInput.length; idx++) {
    const node = nodesInput[idx];
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return { error: `Node #${idx + 1} must be an object.` };
    }

    const id = typeof node.id === "string" ? node.id.trim() : "";
    if (!id) {
      return { error: `Node #${idx + 1} is missing an "id".` };
    }
    if (nodeIds.has(id)) {
      return { error: `Duplicate node id "${id}" found.` };
    }
    nodeIds.add(id);

    const text = typeof node.text === "string" ? node.text.trim() : "";
    if (!text) {
      return { error: `Node "${id}" requires a "text" value.` };
    }

    const choicesInput = Array.isArray(node.choices) ? node.choices : [];
    const choices = [];
    for (let cIdx = 0; cIdx < choicesInput.length; cIdx++) {
      const choice = choicesInput[cIdx];
      if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
        return { error: `Choice #${cIdx + 1} on node "${id}" must be an object.` };
      }

      const label =
        typeof choice.label === "string" ? choice.label.trim() : "";
      const next = typeof choice.next === "string" ? choice.next.trim() : "";
      if (!label) {
        return { error: `Choice #${cIdx + 1} on node "${id}" needs a "label".` };
      }
      if (!next) {
        return { error: `Choice "${label}" on node "${id}" needs a "next" id.` };
      }

      choices.push({ label, nextNodeId: next });
    }

    nodes.push({
      _id: id,
      text,
      choices,
    });
  }

  const endingsInput = Array.isArray(payload.endings) ? payload.endings : [];
  if (endingsInput.length === 0) {
    return { error: 'Provide at least one ending in the "endings" array.' };
  }

  const endingIds = new Set();
  const endings = [];
  for (let idx = 0; idx < endingsInput.length; idx++) {
    const ending = endingsInput[idx];
    if (!ending || typeof ending !== "object" || Array.isArray(ending)) {
      return { error: `Ending #${idx + 1} must be an object.` };
    }

    const id = typeof ending.id === "string" ? ending.id.trim() : "";
    if (!id) {
      return { error: `Ending #${idx + 1} requires an "id".` };
    }
    if (endingIds.has(id)) {
      return { error: `Duplicate ending id "${id}" found.` };
    }
    endingIds.add(id);

    const label = typeof ending.label === "string" ? ending.label.trim() : "";
    if (!label) {
      return { error: `Ending "${id}" requires a "label".` };
    }

    const typeRaw =
      typeof ending.type === "string" ? ending.type.trim().toLowerCase() : "other";
    if (!ALLOWED_ENDING_TYPES.has(typeRaw)) {
      return {
        error: `Ending "${id}" has an invalid type. Use one of: ${Array.from(
          ALLOWED_ENDING_TYPES
        ).join(", ")}.`,
      };
    }

    const text = typeof ending.text === "string" ? ending.text.trim() : "";

    endings.push({
      _id: id,
      label,
      type: typeRaw,
      text,
    });
  }

  const requestedStart =
    typeof payload.startNodeId === "string" ? payload.startNodeId.trim() : "";
  const startNodeId = requestedStart || (nodes.length ? nodes[0]._id : null);
  if (!startNodeId || !nodeIds.has(startNodeId)) {
    return {
      error: 'The "startNodeId" must match one of the node ids.',
    };
  }

  return {
    storyDoc: {
      title,
      description,
      coverImage: null,
      status: "invisible",
      startNodeId,
      categories: [],
      nodes,
      endings,
    },
  };
};

const normalizeStatus = (value, fallback = "invisible") => {
  if (!value || typeof value !== "string") {
    return fallback ?? null;
  }
  const lowered = value.trim().toLowerCase();
  if (ALLOWED_STORY_STATUSES.has(lowered)) {
    return lowered;
  }
  return fallback ?? null;
};

const wantsJSON = (req) => {
  const acceptHeader = req.headers.accept || "";
  const contentType = req.headers["content-type"] || "";
  return (
    acceptHeader.includes("application/json") ||
    contentType.includes("application/json") ||
    req.xhr === true
  );
};

const respondWithStory = (req, res, story, redirectPath) => {
  if (wantsJSON(req)) {
    return res.json({
      success: true,
      story: story ? story.toObject({ depopulate: true }) : null,
    });
  }
  return res.redirect(redirectPath);
};

const normalizeCategories = (input) => {
  if (!input) return [];
  const rawValues = Array.isArray(input)
    ? input
    : typeof input === "string"
    ? input.split(",")
    : [];
  const sanitized = rawValues
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  const unique = Array.from(new Set(sanitized));
  const allowed = new Set(STORY_CATEGORIES);
  return unique.filter((cat) => allowed.has(cat));
};

const parseSearchTerm = (value) => {
  if (!value || typeof value !== "string") return "";
  return value.trim();
};

const matchesSearchFilter = (story, term) => {
  if (!term) return true;
  const haystack = `${story.title || ""} ${story.authorName || ""}`.toLowerCase();
  return haystack.includes(term.toLowerCase());
};

const matchesCategoryFilter = (story, categories) => {
  if (!Array.isArray(categories) || categories.length === 0) return true;
  const storyCategories = Array.isArray(story.categories) ? story.categories : [];
  return storyCategories.some((cat) => categories.includes(cat));
};

const sanitizeAdminReturnPath = (value, fallback = "/admin") => {
  if (!value || typeof value !== "string") return fallback;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch (err) {
    decoded = value;
  }
  if (!decoded.startsWith("/admin")) {
    return fallback;
  }
  return decoded;
};

const respondError = (req, res, statusCode, message) => {
  if (wantsJSON(req)) {
    return res.status(statusCode).json({ success: false, error: message });
  }
  return res.status(statusCode).send(message);
};

const parsePosition = (position, fallback = { x: 0, y: 0 }) => {
  if (!position) return { ...fallback };
  const rawX = position.x ?? position.left ?? position["x"] ?? position["left"];
  const rawY = position.y ?? position.top ?? position["y"] ?? position["top"];
  const x = Number(rawX);
  const y = Number(rawY);
  return {
    x: Number.isFinite(x) ? x : fallback.x,
    y: Number.isFinite(y) ? y : fallback.y,
  };
};

/* ------------------ DASHBOARD ------------------ */
exports.dashboard = async (req, res) => {
  try {
    const [userCount, storyCount, reviewStories] = await Promise.all([
      User.countDocuments(),
      Story.countDocuments(),
      Story.find({
        origin: "user",
        status: { $in: ["pending", "public", "under_review"] },
      })
        .populate("author", "username email")
        .sort({ submittedAt: -1, updatedAt: -1 })
        .lean(),
    ]);

    const filters = {
      pending: {
        search: parseSearchTerm(req.query.pendingSearch),
        categories: normalizeCategories(req.query.pendingCategories),
      },
      underReview: {
        search: parseSearchTerm(req.query.underReviewSearch),
        categories: normalizeCategories(req.query.underReviewCategories),
      },
      published: {
        search: parseSearchTerm(req.query.publishedSearch),
        categories: normalizeCategories(req.query.publishedCategories),
      },
    };

    const mappedStories = reviewStories.map((story) => {
      const status = story.status || "pending";
      const categories = Array.isArray(story.categories) ? story.categories : [];
      const authorName =
        story.author?.username ||
        story.author?.email ||
        (typeof story.author === "string" ? story.author : "Unknown author");
      return {
        ...story,
        categories,
        status,
        statusLabel: STORY_STATUS_LABELS[status] || status,
        authorName,
        reviewNote: story.reviewNote || "",
      };
    });

    const applyFilters = (list, filter) =>
      list.filter(
        (story) =>
          matchesSearchFilter(story, filter.search) &&
          matchesCategoryFilter(story, filter.categories)
      );

    const pendingStories = applyFilters(
      mappedStories.filter((story) => story.status === "pending"),
      filters.pending
    );
    const underReviewStories = applyFilters(
      mappedStories.filter((story) => story.status === "under_review"),
      filters.underReview
    );
    const publishedStories = applyFilters(
      mappedStories.filter((story) => story.status === "public"),
      filters.published
    );

    const flash = await popAdminFlash(req);
    const currentQuery = req.originalUrl || "/admin";
    const encodedReturnTo = encodeURIComponent(currentQuery);

    res.render("admin/dashboard", {
      title: "Admin Dashboard",
      user: req.user,
      stats: { userCount, storyCount },
      pendingStories,
      underReviewStories,
      publishedStories,
      filters,
      categories: STORY_CATEGORIES,
      flash,
      currentQuery,
      encodedReturnTo,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading dashboard");
  }
};

/* ------------------ USERS ------------------ */
exports.usersList = async (req, res) => {
  try {
    const q = req.query.q || "";
    const query = q
      ? {
          $or: [
            { username: { $regex: q, $options: "i" } },
            { email: { $regex: q, $options: "i" } },
          ],
        }
      : {};
    const users = await User.find(query).select(
      "username email role createdAt currency authorCurrency"
    );
    res.render("admin/users", { title: "Manage Users", users, q });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading users");
  }
};

exports.userDetail = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate("progress.story");
    if (!user) return res.status(404).send("User not found");
    res.render("admin/userDetail", {
      title: "User Detail",
      user,
      authUser: req.user,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading user detail");
  }
};

exports.userAuthorLibrary = async (req, res) => {
  try {
    const author = await User.findById(req.params.id).select("username email");
    if (!author) return res.status(404).send("User not found");

    const stories = await Story.find({
      author: author._id,
      origin: "user",
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const mappedStories = stories.map((story) => {
      const status = story.status || "private";
      return {
        ...story,
        status,
        coverImage: story.coverImage || "",
        statusLabel: STORY_STATUS_LABELS[status] || status,
        isPrivate: status === "private",
        isPending: status === "pending",
        isUnderReview: status === "under_review",
        isPublic: status === "public",
        reviewNote: story.reviewNote || "",
      };
    });

    const currentQuery = req.originalUrl || `/admin/users/${author._id}/library`;
    const encodedReturnTo = encodeURIComponent(currentQuery);

    res.render("admin/userLibrary", {
      title: `${author.username}'s Author Library`,
      author,
      stories: mappedStories,
      adminUser: req.user,
      currentQuery,
      encodedReturnTo,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading author library");
  }
};

exports.userUpdate = async (req, res) => {
  try {
    const {
      username,
      email,
      role,
      currency,
      authorCurrency,
      totalEndingsFound,
      storiesRead,
      deathMedal,
      trueMedal,
    } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send("User not found");

    user.username = username;
    user.email = email;
    user.role = role;
    user.currency = Number(currency) || 0;
    user.authorCurrency = Number(authorCurrency) || 0;
    user.totalEndingsFound = Number(totalEndingsFound) || 0;
    user.storiesRead = Number(storiesRead) || 0;
    user.medals.death = deathMedal || "none";
    user.medals.trueEnding = trueMedal || "none";

    await user.save();
    res.redirect(`/admin/users/${user._id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating user");
  }
};

exports.userResetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send("User not found");

    const hash = await bcrypt.hash(newPassword, 12);
    user.passwordHash = hash;
    await user.save();
    res.redirect(`/admin/users/${user._id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error resetting password");
  }
};

exports.userDelete = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.redirect("/admin/users");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting user");
  }
};

exports.userAddForm = (req, res) =>
  res.render("admin/userAdd", { title: "Add User" });

exports.userAddPost = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    const hash = await bcrypt.hash(password, 12);
    await User.create({ username, email, passwordHash: hash, role });
    res.redirect("/admin/users");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating user");
  }
};

/*---------helper -----------*/
async function recomputeUserDerived(user) {
  // Normalize endingsFound to strings and gather storyIds we need
  const storyIdSet = new Set();
  user.progress.forEach((p) => {
    if (!p) return;
    if (p.story) storyIdSet.add(String(p.story._id || p.story));
    p.endingsFound = (p.endingsFound || []).map((v) =>
      typeof v === "string" ? v : String(v)
    );
  });

  const storyIds = Array.from(storyIdSet);
  const stories = await Story.find({ _id: { $in: storyIds } })
    .select("_id endings title")
    .lean();
  const storyMap = new Map(stories.map((s) => [String(s._id), s]));

  // Recompute per-story tallies
  user.totalEndingsFound = 0;

  user.progress.forEach((p) => {
    const s = p.story ? storyMap.get(String(p.story._id || p.story)) : null;
    const endingsArr = Array.isArray(s?.endings) ? s.endings : [];

    const endingTypeById = new Map(endingsArr.map((e) => [e._id, e.type]));

    // Deduplicate endingsFound just in case
    const uniqueFound = Array.from(new Set(p.endingsFound || []));
    p.endingsFound = uniqueFound;

    // Per-story counts
    p.trueEndingFound = uniqueFound.some(
      (id) => endingTypeById.get(id) === "true"
    );
    p.deathEndingCount = uniqueFound.reduce(
      (acc, id) => acc + (endingTypeById.get(id) === "death" ? 1 : 0),
      0
    );

    user.totalEndingsFound += uniqueFound.length;
  });

  // Recompute medals
  updateUserMedals(user);

  // (Optional) If you want "storiesRead" to reflect "stories completed"
  // calculate it here so Admin UI can also see the up-to-date number.
  const storiesCompleted = user.progress.reduce((acc, p) => {
    const s = p.story ? storyMap.get(String(p.story._id || p.story)) : null;
    const total = Array.isArray(s?.endings) ? s.endings.length : 0;
    const found = Array.isArray(p.endingsFound) ? p.endingsFound.length : 0;
    return acc + (total > 0 && found >= total ? 1 : 0);
  }, 0);
  user.storiesRead = storiesCompleted; // reusing field as "completed"
}

/* ------------------ STORIES ------------------ */
exports.storiesList = async (req, res) => {
  try {
    const q = req.query.q || "";
    const query = { origin: { $ne: "user" } };
    if (q) {
      query.title = { $regex: q, $options: "i" };
    }
    const stories = await Story.find(query)
      .sort({ displayOrder: 1, createdAt: -1 })
      .select("title description coverImage status displayOrder");
    res.render("admin/stories", { title: "Story Collection", stories, q });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading stories");
  }
};

exports.storyQuickCreate = async (req, res) => {
  try {
    const displayOrder = await Story.countDocuments();
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const title = `New Story ${randomSuffix}`;

    const story = await Story.create({
      title,
      description: "",
      coverImage: null,
      status: "invisible",
      categories: [],
      nodes: [],
      endings: [],
      displayOrder,
    });

    res.redirect(`/admin/stories/${story._id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating story");
  }
};

exports.storySeedForm = (req, res) => {
  res.render("admin/storySeed", {
    title: "Story Seeds",
    user: req.user,
    seedExample: STORY_SEED_EXAMPLE,
    formValue: "",
    error: null,
    success: null,
  });
};

exports.storySeedCreate = async (req, res) => {
  const seedText = req.body?.seedText || "";
  const { storyDoc, error } = buildStorySeedFromText(seedText);

  if (error) {
    return res.status(400).render("admin/storySeed", {
      title: "Story Seeds",
      user: req.user,
      seedExample: STORY_SEED_EXAMPLE,
      formValue: seedText,
      error,
      success: null,
    });
  }

  try {
    const displayOrder = await Story.countDocuments();
    const story = await Story.create({
      ...storyDoc,
      displayOrder,
    });

    return res.render("admin/storySeed", {
      title: "Story Seeds",
      user: req.user,
      seedExample: STORY_SEED_EXAMPLE,
      formValue: "",
      error: null,
      success: `Seed story "${story.title}" added successfully.`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).render("admin/storySeed", {
      title: "Story Seeds",
      user: req.user,
      seedExample: STORY_SEED_EXAMPLE,
      formValue: seedText,
      error: "We couldn't save that story. Please try again.",
      success: null,
    });
  }
};

exports.storyEditForm = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    // Ensure existing stories have IDs and positions for nodes/endings
    let changed = false;
    const beforeCount = story.nodes.length;
    story.nodes = story.nodes.filter((n) => n.type !== "divider");
    if (story.nodes.length !== beforeCount) {
      changed = true;
    }
    story.nodes.forEach((n) => {
      if (!n._id || n._id.trim() === "") {
        n._id = "node_" + randomUUID().slice(0, 8);
        changed = true;
      }
      if (!n.color) {
        n.color = "twilight";
        changed = true;
      }
    });
    story.endings.forEach((e) => {
      if (!e._id || e._id.trim() === "") {
        e._id = "ending_" + randomUUID().slice(0, 8);
        changed = true;
      }
    });

    const spacingX = 240;
    const spacingY = 200;
    story.nodes.forEach((n, idx) => {
      if (
        !n.position ||
        typeof n.position.x !== "number" ||
        typeof n.position.y !== "number"
      ) {
        n.position = {
          x: 160 + (idx % 5) * spacingX,
          y: 160 + Math.floor(idx / 5) * spacingY,
        };
        changed = true;
      }
    });

    const nodeRows = Math.max(1, Math.ceil(story.nodes.length / 5));
    const endingsBaseY = 160 + nodeRows * spacingY + spacingY;
    story.endings.forEach((e, idx) => {
      if (
        !e.position ||
        typeof e.position.x !== "number" ||
        typeof e.position.y !== "number"
      ) {
        e.position = {
          x: 160 + (idx % 4) * spacingX,
          y: endingsBaseY + Math.floor(idx / 4) * spacingY,
        };
        changed = true;
      }
    });

    if (changed) await story.save();

    res.render("admin/storyEditor", {
      title: "Story Editor",
      story,
      categories: STORY_CATEGORIES,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading story");
  }
};

exports.storyEditPost = async (req, res) => {
  try {
    const { title, description, coverImage, status, startNodeId, categories } =
      req.body;
    const update = {
      title,
      description,
      coverImage,
      startNodeId: startNodeId || null,
      categories: normalizeCategories(categories),
    };

    const normalizedStatus = normalizeStatus(status, null);
    if (normalizedStatus) {
      update.status = normalizedStatus;
    }

    await Story.findByIdAndUpdate(req.params.id, update);
    res.redirect("/admin/stories");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating story");
  }
};

exports.storyDelete = async (req, res) => {
  try {
    await Story.findByIdAndDelete(req.params.id);
    res.redirect("/admin/stories");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting story");
  }
};

exports.storyUpdateInline = async (req, res) => {
  try {
    const {
      title,
      description,
      coverImage,
      status,
      startNodeId,
      notes,
      categories,
    } = req.body;
    const update = {
      title,
      description,
      coverImage,
      startNodeId: startNodeId || null,
      notes: notes || "",
      categories: normalizeCategories(categories),
    };

    const normalizedStatus = normalizeStatus(status, null);
    if (normalizedStatus) {
      update.status = normalizedStatus;
    }

    const story = await Story.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });
    if (!story)
      return respondError(req, res, 404, "Story not found for update");
    return respondWithStory(
      req,
      res,
      story,
      `/admin/stories/${req.params.id}/edit`
    );
  } catch (err) {
    console.error(err);
    return respondError(req, res, 500, "Error updating story info");
  }
};

exports.updateStoriesOrder = async (req, res) => {
  try {
    const { order } = req.body; // [storyId,...]
    if (Array.isArray(order)) {
      for (let i = 0; i < order.length; i++) {
        await Story.findByIdAndUpdate(order[i], { displayOrder: i });
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Error saving order" });
  }
};

const ensureUserStory = async (id) => {
  const story = await Story.findById(id);
  if (!story || story.origin !== "user") return null;
  return story;
};

exports.approveUserStory = async (req, res) => {
  try {
    const story = await ensureUserStory(req.params.id);
    if (!story) {
      await setAdminFlash(req, {
        type: "error",
        message: "User story not found.",
      });
      return res.redirect("/admin");
    }

    story.status = "public";
    story.publishedAt = new Date();
    if (!story.submittedAt) {
      story.submittedAt = new Date();
    }
    await story.save();

    if (story.author) {
      const authorUser = await User.findById(story.author);
      if (authorUser) {
        const trophyResult = await updatePublishedAuthorTrophy(authorUser);
        if (trophyResult.changed) {
          await authorUser.save();
        }
      }
    }

    await setAdminFlash(req, {
      type: "success",
      message: `Approved "${story.title}".`,
    });

    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    await setAdminFlash(req, {
      type: "error",
      message: "Unable to approve story.",
    });
    res.redirect("/admin");
  }
};

exports.rejectUserStory = async (req, res) => {
  try {
    const story = await ensureUserStory(req.params.id);
    if (!story) {
      await setAdminFlash(req, {
        type: "error",
        message: "User story not found.",
      });
      return res.redirect("/admin");
    }

    story.status = "private";
    story.submittedAt = null;
    story.publishedAt = null;
    await story.save();

    await setAdminFlash(req, {
      type: "success",
      message: `Rejected "${story.title}" and returned it to private.`,
    });

    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    await setAdminFlash(req, {
      type: "error",
      message: "Unable to reject story.",
    });
    res.redirect("/admin");
  }
};

exports.markUserStoryUnderReview = async (req, res) => {
  try {
    const story = await ensureUserStory(req.params.id);
    if (!story) {
      await setAdminFlash(req, {
        type: "error",
        message: "User story not found.",
      });
      return res.redirect("/admin");
    }

    story.status = "under_review";
    await story.save();

    await setAdminFlash(req, {
      type: "success",
      message: `Marked "${story.title}" as under review.`,
    });

    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    await setAdminFlash(req, {
      type: "error",
      message: "Unable to update story status.",
    });
    res.redirect("/admin");
  }
};

exports.removeUserStory = async (req, res) => {
  try {
    const story = await ensureUserStory(req.params.id);
    if (!story) {
      await setAdminFlash(req, {
        type: "error",
        message: "User story not found.",
      });
      return res.redirect("/admin");
    }

    story.status = "private";
    story.publishedAt = null;
    await story.save();

    await setAdminFlash(req, {
      type: "success",
      message: `Removed "${story.title}" from the public library.`,
    });

    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    await setAdminFlash(req, {
      type: "error",
      message: "Unable to remove story.",
    });
    res.redirect("/admin");
  }
};

exports.updateUserStoryNote = async (req, res) => {
  const redirectTarget = sanitizeAdminReturnPath(req.body.returnTo);
  try {
    const story = await ensureUserStory(req.params.id);
    if (!story) {
      await setAdminFlash(req, {
        type: "error",
        message: "User story not found.",
      });
      return res.redirect(redirectTarget);
    }

    const clearNote = Boolean(req.body.clearNote);
    const rawNote = typeof req.body.reviewNote === "string" ? req.body.reviewNote : "";
    story.reviewNote = clearNote ? "" : rawNote.trim();
    await story.save();

    await setAdminFlash(req, {
      type: "success",
      message: story.reviewNote
        ? `Saved review note for "${story.title}".`
        : `Removed the review note for "${story.title}".`,
    });

    res.redirect(redirectTarget);
  } catch (err) {
    console.error(err);
    await setAdminFlash(req, {
      type: "error",
      message: "Unable to update the review note.",
    });
    res.redirect(redirectTarget);
  }
};

/* ------------------ NODES ------------------ */
exports.storyNodeAddPost = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return respondError(req, res, 404, "Story not found");

    const id = req.body._id || "node_" + randomUUID().slice(0, 8);
    const position = parsePosition(req.body.position, {
      x: 200,
      y: 200,
    });
    // unshift to place at the top
    story.nodes.unshift({
      _id: id,
      text: req.body.text || "",
      image: req.body.image || "",
      color: req.body.color || "twilight",
      position,
      choices: [],
    });

    await story.save();
    return respondWithStory(
      req,
      res,
      story,
      `/admin/stories/${story._id}/edit`
    );
  } catch (err) {
    console.error(err);
    return respondError(req, res, 500, "Error adding node");
  }
};

exports.storyNodeUpdateInline = async (req, res) => {
  try {
    const { _id: newId, text, image, color } = req.body;
    const story = await Story.findById(req.params.id);
    if (!story) return respondError(req, res, 404, "Story not found");

    const node = story.nodes.find((n) => n._id === req.params.nodeId);
    if (!node) return respondError(req, res, 404, "Node not found");

    const oldId = node._id;
    node._id = newId;
    node.text = text;
    node.image = image;
    const allowedColors = ["twilight", "ember", "moss", "dusk", "rose", "slate"];
    node.color = allowedColors.includes(color) ? color : node.color || "twilight";

    // Cascade: fix all choices pointing to the old node id
    story.nodes.forEach((n) =>
      n.choices.forEach((ch) => {
        if (ch.nextNodeId === oldId) ch.nextNodeId = newId;
      })
    );
    if (story.startNodeId === oldId) story.startNodeId = newId;

    await story.save();
    return respondWithStory(
      req,
      res,
      story,
      `/admin/stories/${req.params.id}/edit`
    );
  } catch (err) {
    console.error(err);
    return respondError(req, res, 500, "Error updating node");
  }
};

exports.storyNodeDelete = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return respondError(req, res, 404, "Story not found");

    const targetId = req.params.nodeId;
    story.nodes = story.nodes.filter((n) => n._id !== targetId);

    // Remove broken links from choices and clear startNodeId if needed
    story.nodes.forEach((n) => {
      n.choices = n.choices.filter((ch) => ch.nextNodeId !== targetId);
    });
    if (story.startNodeId === targetId) story.startNodeId = null;

    await story.save();
    return respondWithStory(
      req,
      res,
      story,
      `/admin/stories/${req.params.id}/edit`
    );
  } catch (err) {
    console.error(err);
    return respondError(req, res, 500, "Error deleting node");
  }
};

exports.storyNodeUpdatePosition = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return respondError(req, res, 404, "Story not found");

    const node = story.nodes.find((n) => n._id === req.params.nodeId);
    if (!node) return respondError(req, res, 404, "Node not found");

    node.position = parsePosition(req.body, node.position || { x: 0, y: 0 });

    await story.save();
    return respondWithStory(
      req,
      res,
      story,
      `/admin/stories/${req.params.id}/edit`
    );
  } catch (err) {
    console.error(err);
    return respondError(req, res, 500, "Error updating node position");
  }
};

/* ------------------ ENDINGS ------------------ */
exports.storyEndingAddPost = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return respondError(req, res, 404, "Story not found");

    const id = req.body._id || "ending_" + randomUUID().slice(0, 8);
    const position = parsePosition(req.body.position, {
      x: 400,
      y: 400,
    });
    story.endings.unshift({
      _id: id,
      label: req.body.label || "",
      type: req.body.type || "other",
      text: req.body.text || "",
      image: req.body.image || "",
      position,
    });

    await story.save();
    return respondWithStory(
      req,
      res,
      story,
      `/admin/stories/${story._id}/edit`
    );
  } catch (err) {
    console.error(err);
    return respondError(req, res, 500, "Error adding ending");
  }
};

exports.storyEndingUpdateInline = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return respondError(req, res, 404, "Story not found");

    const ending = story.endings.find((e) => e._id === req.params.endingId);
    if (!ending) return respondError(req, res, 404, "Ending not found");

    const { _id: newId, type, text, image } = req.body;
    const label = req.body.label ?? ending.label;

    const oldId = ending._id;
    ending._id = newId;
    ending.label = label;
    ending.type = type;
    ending.text = text;
    ending.image = image;

    // Cascade: fix choices pointing to this ending
    story.nodes.forEach((n) =>
      n.choices.forEach((ch) => {
        if (ch.nextNodeId === oldId) ch.nextNodeId = newId;
      })
    );

    await story.save();
    return respondWithStory(
      req,
      res,
      story,
      `/admin/stories/${req.params.id}/edit`
    );
  } catch (err) {
    console.error(err);
    return respondError(req, res, 500, "Error updating ending");
  }
};

exports.storyEndingDelete = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return respondError(req, res, 404, "Story not found");

    const targetId = req.params.endingId;
    story.endings = story.endings.filter((e) => e._id !== targetId);

    // Remove broken links from choices
    story.nodes.forEach((n) => {
      n.choices = n.choices.filter((ch) => ch.nextNodeId !== targetId);
    });

    await story.save();
    return respondWithStory(
      req,
      res,
      story,
      `/admin/stories/${req.params.id}/edit`
    );
  } catch (err) {
    console.error(err);
    return respondError(req, res, 500, "Error deleting ending");
  }
};

exports.storyEndingUpdatePosition = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return respondError(req, res, 404, "Story not found");

    const ending = story.endings.find((e) => e._id === req.params.endingId);
    if (!ending) return respondError(req, res, 404, "Ending not found");

    ending.position = parsePosition(req.body, ending.position || { x: 0, y: 0 });

    await story.save();
    return respondWithStory(
      req,
      res,
      story,
      `/admin/stories/${req.params.id}/edit`
    );
  } catch (err) {
    console.error(err);
    return respondError(req, res, 500, "Error updating ending position");
  }
};

/* ------------------ CHOICES ------------------ */
exports.nodeChoiceAddInline = async (req, res) => {
  try {
    const { label, nextNodeId } = req.body;
    const locked = Boolean(req.body.locked);
    const parsedCost = Number(req.body.unlockCost);
    const unlockCost = Number.isFinite(parsedCost) ? Math.max(parsedCost, 0) : 0;
    const story = await Story.findById(req.params.id);
    if (!story) return respondError(req, res, 404, "Story not found");

    const node = story.nodes.find((n) => n._id === req.params.nodeId);
    if (!node) return respondError(req, res, 404, "Node not found");

    node.choices.push({
      label,
      nextNodeId,
      locked,
      unlockCost: locked ? unlockCost : 0,
    });
    await story.save();
    return respondWithStory(
      req,
      res,
      story,
      `/admin/stories/${req.params.id}/edit`
    );
  } catch (err) {
    console.error(err);
    return respondError(req, res, 500, "Error adding choice");
  }
};

exports.nodeChoiceUpdateInline = async (req, res) => {
  try {
    const { label, nextNodeId } = req.body;
    const locked = Boolean(req.body.locked);
    const parsedCost = Number(req.body.unlockCost);
    const unlockCost = Number.isFinite(parsedCost) ? Math.max(parsedCost, 0) : 0;
    const story = await Story.findById(req.params.id);
    if (!story) return respondError(req, res, 404, "Story not found");

    const node = story.nodes.find((n) => n._id === req.params.nodeId);
    if (!node) return respondError(req, res, 404, "Node not found");

    const choice = node.choices.id(req.params.choiceId);
    if (!choice) return respondError(req, res, 404, "Choice not found");

    choice.label = label;
    choice.nextNodeId = nextNodeId;
    choice.locked = locked;
    choice.unlockCost = locked ? unlockCost : 0;

    await story.save();
    return respondWithStory(
      req,
      res,
      story,
      `/admin/stories/${req.params.id}/edit`
    );
  } catch (err) {
    console.error(err);
    return respondError(req, res, 500, "Error updating choice");
  }
};

exports.nodeChoiceDelete = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return respondError(req, res, 404, "Story not found");

    const node = story.nodes.find((n) => n._id === req.params.nodeId);
    if (!node) return respondError(req, res, 404, "Node not found");

    node.choices = node.choices.filter((c) => String(c._id) !== req.params.choiceId);

    await story.save();
    return respondWithStory(
      req,
      res,
      story,
      `/admin/stories/${req.params.id}/edit`
    );
  } catch (err) {
    console.error(err);
    return respondError(req, res, 500, "Error deleting choice");
  }
};

/* ------------------ REORDER ------------------ */
exports.nodesReorder = async (req, res) => {
  try {
    // EJS JS sends { idsInOrder }
    const { idsInOrder } = req.body;
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    story.nodes = idsInOrder
      .map((id) => story.nodes.find((n) => n._id === id))
      .filter(Boolean);
    await story.save();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

exports.endingsReorder = async (req, res) => {
  try {
    const { idsInOrder } = req.body;
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    story.endings = idsInOrder
      .map((id) => story.endings.find((e) => e._id === id))
      .filter(Boolean);
    await story.save();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

/* ------------------ IMAGES ------------------ */
// Helper: derive Cloudinary public_id from a delivery URL (fallback for legacy strings)
function derivePublicIdFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split("/"); // ["", "cloud_name", "image", "upload", "v123", "stories", "<id>", "file.ext"]
    const idx = parts.indexOf("upload");
    if (idx === -1) return null;
    const pathParts = parts.slice(idx + 1);
    if (pathParts[0] && /^v\d+/.test(pathParts[0])) pathParts.shift(); // drop version
    const last = pathParts.pop();
    const base = last.replace(/\.[^.]+$/, ""); // remove extension
    pathParts.push(base);
    return pathParts.join("/"); // e.g. "stories/656a.../1699999999-filename"
  } catch {
    return null;
  }
}

function deriveFilenameFromUrl(urlStr) {
  if (!urlStr) return "";
  try {
    const u = new URL(urlStr);
    const path = u.pathname.split("/").pop() || "";
    return path.split("?")[0];
  } catch {
    return urlStr.split("/").pop() || urlStr;
  }
}

// Render images page (now using story.images as [{url, publicId}] or strings)
exports.listImages = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    const raw = Array.isArray(story.images) ? story.images : [];
    const images = raw.map((item) => {
      if (typeof item === "string") {
        const url = item;
        return {
          url,
          publicId: derivePublicIdFromUrl(url),
          title: deriveFilenameFromUrl(url),
        };
      }
      const url = item.url || item.path || "";
      const publicId = item.publicId || item.filename || derivePublicIdFromUrl(url);
      const title =
        item.title ||
        item.displayName ||
        deriveFilenameFromUrl(url) ||
        publicId ||
        "";
      return {
        url,
        publicId,
        title,
      };
    });

    res.render("admin/storyImages", { title: "Image Library", story, images });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading images");
  }
};

// After Cloudinary upload, save URL + publicId
exports.uploadImage = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    if (!req.file || !req.file.path) {
      return res.status(400).send("No image uploaded");
    }

    const url = req.file.path; // secure CDN URL
    const publicId = req.file.filename || req.file.public_id || null;

    story.images = story.images || [];
    // Prefer storing as object going forward
    story.images.unshift({
      url,
      publicId,
      title: deriveFilenameFromUrl(url),
    });

    await story.save();
    res.redirect(`/admin/stories/${story._id}/images`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error uploading image");
  }
};

// NEW: Delete image (from Cloudinary + Mongo)
exports.deleteImage = async (req, res) => {
  try {
    const { id: storyId } = req.params;
    const { publicId, url } = req.body; // either publicId or url (fallback) is fine

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).send("Story not found");

    let pid = publicId && publicId.trim();
    if (!pid && url) pid = derivePublicIdFromUrl(url);

    // Try to delete from Cloudinary if we have a publicId
    if (pid) {
      try {
        await cloudinary.uploader.destroy(pid);
      } catch (e) {
        // Not fatal if it already disappeared; log and continue
        console.warn("[Cloudinary destroy] ", e?.message || e);
      }
    }

    // Remove from Mongo (supports both object and string entries)
    const before = story.images.length;
    story.images = (story.images || []).filter((item) => {
      if (typeof item === "string") {
        // legacy string URL
        return item !== url;
      }
      // object with url/publicId
      const sameByPid = pid && item && item.publicId === pid;
      const sameByUrl = url && item && item.url === url;
      return !(sameByPid || sameByUrl);
    });

    if (story.images.length === before) {
      console.warn("[Image delete] No entry matched; nothing removed.");
    }

    await story.save();
    res.redirect(`/admin/stories/${story._id}/images`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting image");
  }
};

// POST /admin/users/:id/progress/:storyId/remove-endings
exports.userProgressRemoveEndings = async (req, res) => {
  try {
    const { id, storyId } = req.params;
    let { endingIds = [], adjustCurrency } = req.body;

    if (!Array.isArray(endingIds)) endingIds = [endingIds];

    const user = await User.findById(id);
    if (!user) return res.status(404).send("User not found");

    const p = user.progress.find(
      (pr) =>
        String(pr.story) === String(storyId) || pr.story?.equals?.(storyId)
    );
    if (!p) return res.redirect(`/admin/users/${id}`);

    // Normalize existing endingsFound to strings
    p.endingsFound = (p.endingsFound || []).map((v) =>
      typeof v === "string" ? v : String(v)
    );

    // Remove selected endings
    const removeSet = new Set(endingIds.map((v) => String(v)));
    const beforeLen = p.endingsFound.length;
    p.endingsFound = p.endingsFound.filter(
      (eid) => !removeSet.has(String(eid))
    );
    const removedCount = Math.max(0, beforeLen - p.endingsFound.length);

    // Optional currency adjustment (admin decides amount ±)
    const delta = Number(adjustCurrency);
    if (!Number.isNaN(delta) && delta !== 0) {
      user.currency = (user.currency || 0) + delta;
    }

    // Recompute from authoritative progress
    await recomputeUserDerived(user);
    await user.save();

    res.redirect(`/admin/users/${id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error removing endings");
  }
};

// POST /admin/users/:id/progress/:storyId/clear
exports.userProgressClearStory = async (req, res) => {
  try {
    const { id, storyId } = req.params;
    const { adjustCurrency } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).send("User not found");

    const p = user.progress.find(
      (pr) =>
        String(pr.story) === String(storyId) || pr.story?.equals?.(storyId)
    );
    if (p) {
      p.endingsFound = [];
      p.lastNodeId = null;
      p.trueEndingFound = false;
      p.deathEndingCount = 0;
    }

    const delta = Number(adjustCurrency);
    if (!Number.isNaN(delta) && delta !== 0) {
      user.currency = (user.currency || 0) + delta;
    }

    await recomputeUserDerived(user);
    await user.save();

    res.redirect(`/admin/users/${id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error clearing story progress");
  }
};

// POST /admin/users/:id/recompute
exports.userRecomputeTotals = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).send("User not found");

    await recomputeUserDerived(user);
    await user.save();

    res.redirect(`/admin/users/${id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error recomputing user totals");
  }
};
