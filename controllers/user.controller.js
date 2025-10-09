const { v2: cloudinary } = require("cloudinary");
const User = require("../models/user.model");
const Story = require("../models/story.model");
const STORY_CATEGORIES = require("../utils/storyCategories");

const ALLOWED_ENDING_TYPES = new Set(["true", "death", "other", "secret"]);

const STORY_STATUS_LABELS = {
  public: "Play",
  coming_soon: "Coming Soon",
  pending: "Coming Soon",
  under_review: "Under Review",
  private: "Private",
  invisible: "Unavailable",
};

const normalizeToArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") {
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => value[key]);
  }
  return [value];
};

const parseCategories = (input) => {
  if (!input) return [];
  const raw = Array.isArray(input) ? input : String(input).split(",");
  const cleaned = raw
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(cleaned)];
};

const derivePublicIdFromUrl = (urlStr) => {
  if (!urlStr) return null;
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split("/");
    const uploadIndex = parts.indexOf("upload");
    if (uploadIndex === -1) return null;
    const pathParts = parts.slice(uploadIndex + 1);
    if (pathParts[0] && /^v\d+/.test(pathParts[0])) pathParts.shift();
    const filename = (pathParts.pop() || "").replace(/\.[^.]+$/, "");
    pathParts.push(filename);
    return pathParts.join("/");
  } catch (err) {
    return null;
  }
};

const deriveFilenameFromUrl = (urlStr) => {
  if (!urlStr) return "";
  try {
    const u = new URL(urlStr);
    const base = u.pathname.split("/").pop() || "";
    return decodeURIComponent(base.split("?")[0]);
  } catch (err) {
    const base = String(urlStr).split("/").pop() || String(urlStr);
    return decodeURIComponent(base.split("?")[0]);
  }
};

const mapStoryImages = (rawImages = []) => {
  if (!Array.isArray(rawImages)) return [];
  return rawImages
    .map((item) => {
      if (typeof item === "string") {
        return {
          url: item,
          publicId: derivePublicIdFromUrl(item),
          title: deriveFilenameFromUrl(item),
        };
      }
      const url = item?.url || item?.path || "";
      const publicId = item?.publicId || item?.filename || derivePublicIdFromUrl(url);
      const title =
        item?.title ||
        item?.displayName ||
        deriveFilenameFromUrl(url) ||
        publicId ||
        "";
      return {
        url,
        publicId,
        title,
      };
    })
    .filter((img) => Boolean(img.url));
};

const toBoolean = (value) =>
  value === true ||
  value === "true" ||
  value === "on" ||
  value === "1" ||
  value === 1;

const getProgressEntry = (user, storyId) => {
  if (!user || !Array.isArray(user.progress)) return null;
  return user.progress.find((progress) => {
    const value = progress.story?._id || progress.story;
    return value && String(value) === String(storyId);
  });
};

const mapStoryForLibrary = (story, user, { includeAuthor = false } = {}) => {
  const progress = getProgressEntry(user, story._id);
  const endings = Array.isArray(story.endings) ? story.endings : [];
  const totalEndings = endings.length;
  const foundCount = Array.isArray(progress?.endingsFound)
    ? progress.endingsFound.length
    : 0;
  const categories = Array.isArray(story.categories) ? story.categories : [];
  const status = story.status || "invisible";
  const actionLabel = STORY_STATUS_LABELS[status] || STORY_STATUS_LABELS.invisible;
  const actionType = status === "public" ? "play" : "label";

  const payload = {
    ...story,
    title: story.title || "Untitled Story",
    foundCount,
    totalEndings,
    categories,
    actionType,
    actionLabel,
  };

  if (includeAuthor) {
    payload.authorName =
      story.author?.username ||
      story.author?.displayName ||
      (typeof story.author === "string" ? story.author : null);
  }

  return payload;
};

const parseStoryPayload = (body = {}) => {
  const errors = [];

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) errors.push("Title is required.");

  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const coverImage =
    typeof body.coverImage === "string" ? body.coverImage.trim() : "";
  const categories = parseCategories(body.categoriesRaw || body.categories);

  const rawNodes = normalizeToArray(body.nodes);
  const nodes = [];
  const nodeIds = new Set();

  rawNodes.forEach((node, index) => {
    const id =
      typeof node?._id === "string" && node._id.trim()
        ? node._id.trim()
        : typeof node?.id === "string" && node.id.trim()
        ? node.id.trim()
        : "";
    if (!id) {
      errors.push(`Node #${index + 1} must include an id.`);
      return;
    }
    if (nodeIds.has(id)) {
      errors.push(`Duplicate node id "${id}" detected.`);
      return;
    }
    nodeIds.add(id);

    const text = typeof node?.text === "string" ? node.text.trim() : "";
    if (!text) {
      errors.push(`Node "${id}" requires passage text.`);
    }

    const image = typeof node?.image === "string" ? node.image.trim() : "";
    const nodeNotes = typeof node?.notes === "string" ? node.notes.trim() : "";
    const color =
      typeof node?.color === "string" && node.color.trim()
        ? node.color.trim()
        : "twilight";

    const positionX = Number(node?.position?.x ?? node?.position?.X ?? node?.posX);
    const positionY = Number(node?.position?.y ?? node?.position?.Y ?? node?.posY);
    const position = {
      x: Number.isFinite(positionX) ? positionX : 0,
      y: Number.isFinite(positionY) ? positionY : 0,
    };

    const rawChoices = normalizeToArray(node?.choices);
    const choices = [];

    rawChoices.forEach((choice, choiceIndex) => {
      const label =
        typeof choice?.label === "string" ? choice.label.trim() : "";
      const nextNodeId =
        typeof choice?.nextNodeId === "string"
          ? choice.nextNodeId.trim()
          : typeof choice?.next === "string"
          ? choice.next.trim()
          : "";

      if (!label || !nextNodeId) {
        errors.push(
          `Choice #${choiceIndex + 1} on node "${id}" requires a label and destination.`
        );
        return;
      }

      const locked = toBoolean(choice?.locked);
      const unlockCostRaw = Number(choice?.unlockCost);
      const unlockCost = locked
        ? Number.isFinite(unlockCostRaw)
          ? Math.max(unlockCostRaw, 0)
          : 0
        : 0;

      const choiceDoc = {
        label,
        nextNodeId,
        locked,
        unlockCost,
      };

      const existingChoiceId =
        typeof choice?._id === "string" ? choice._id.trim() : "";
      if (existingChoiceId) choiceDoc._id = existingChoiceId;

      choices.push(choiceDoc);
    });

    nodes.push({
      _id: id,
      text,
      image,
      notes: nodeNotes,
      color,
      position,
      choices,
    });
  });

  const rawEndings = normalizeToArray(body.endings);
  const endings = [];
  const endingIds = new Set();

  rawEndings.forEach((ending, index) => {
    const id =
      typeof ending?._id === "string" && ending._id.trim()
        ? ending._id.trim()
        : typeof ending?.id === "string" && ending.id.trim()
        ? ending.id.trim()
        : "";
    if (!id) {
      errors.push(`Ending #${index + 1} must include an id.`);
      return;
    }
    if (endingIds.has(id)) {
      errors.push(`Duplicate ending id "${id}" detected.`);
      return;
    }
    endingIds.add(id);

    const label =
      typeof ending?.label === "string" && ending.label.trim()
        ? ending.label.trim()
        : id;
    const typeRaw =
      typeof ending?.type === "string"
        ? ending.type.trim().toLowerCase()
        : "other";
    const type = ALLOWED_ENDING_TYPES.has(typeRaw) ? typeRaw : "other";
    const text = typeof ending?.text === "string" ? ending.text.trim() : "";
    const endingNotes =
      typeof ending?.notes === "string" ? ending.notes.trim() : "";
    const image = typeof ending?.image === "string" ? ending.image.trim() : "";

    const endPosX = Number(ending?.position?.x ?? ending?.position?.X ?? ending?.posX);
    const endPosY = Number(ending?.position?.y ?? ending?.position?.Y ?? ending?.posY);
    const endingPosition = {
      x: Number.isFinite(endPosX) ? endPosX : 0,
      y: Number.isFinite(endPosY) ? endPosY : 0,
    };

    endings.push({
      _id: id,
      label,
      type,
      text,
      image,
      notes: endingNotes,
      position: endingPosition,
    });
  });

  if (!nodes.length) {
    errors.push("Add at least one passage to your story.");
  }

  if (!endings.length) {
    errors.push("Add at least one ending to your story.");
  }

  const startNodeIdInput =
    typeof body.startNodeId === "string" ? body.startNodeId.trim() : "";
  let startNodeId = null;
  if (startNodeIdInput && nodeIds.has(startNodeIdInput)) {
    startNodeId = startNodeIdInput;
  } else if (nodes.length) {
    startNodeId = nodes[0]._id;
  }

  if (!startNodeId) {
    errors.push("Select a starting passage.");
  }

  return {
    errors,
    storyDoc: {
      title,
      description,
      notes,
      coverImage: coverImage || undefined,
      categories,
      nodes,
      endings,
      startNodeId,
    },
  };
};

const prepareStoryFormData = (story = {}) => ({
  title: story.title || "",
  description: story.description || "",
  notes: story.notes || "",
  coverImage: story.coverImage || "",
  startNodeId: story.startNodeId || "",
  categories: Array.isArray(story.categories) ? story.categories : [],
  nodes: Array.isArray(story.nodes)
    ? story.nodes.map((node) => ({
        _id: node._id || "",
        text: node.text || "",
        image: node.image || "",
        notes: node.notes || "",
        color: node.color || "twilight",
        position: {
          x: Number(node.position?.x) || 0,
          y: Number(node.position?.y) || 0,
        },
        choices: Array.isArray(node.choices)
          ? node.choices.map((choice) => ({
              _id: choice._id || "",
              label: choice.label || "",
              nextNodeId: choice.nextNodeId || "",
              locked: Boolean(choice.locked),
              unlockCost: Number(choice.unlockCost) || 0,
            }))
          : [],
      }))
    : [],
  endings: Array.isArray(story.endings)
    ? story.endings.map((ending) => ({
        _id: ending._id || "",
        label: ending.label || "",
        type: ending.type || "other",
        text: ending.text || "",
        image: ending.image || "",
        notes: ending.notes || "",
        position: {
          x: Number(ending.position?.x) || 0,
          y: Number(ending.position?.y) || 0,
        },
      }))
    : [],
});

const commitSession = (req) =>
  new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

const setAuthorFlash = async (req, flash) => {
  if (!req.session) return;
  req.session.authorFlash = flash;
  await commitSession(req);
};

const popAuthorFlash = async (req) => {
  if (!req.session) return null;
  const flash = req.session.authorFlash || null;
  delete req.session.authorFlash;
  await commitSession(req);
  return flash;
};

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

    const storiesCreated = await Story.countDocuments({
      author: user._id,
      origin: "user",
    });

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
      trueEndings: gradeTrophy(trueEndingsFound, {
        bronze: 1,
        silver: 3,
        gold: 5,
        platinum: 10,
      }),
      deathEndings: gradeTrophy(deathEndingsFound, {
        bronze: 1,
        silver: 5,
        gold: 10,
        platinum: 20,
      }),
      secretEndings: gradeTrophy(secretEndingsFound, {
        bronze: 1,
        silver: 3,
        gold: 5,
        platinum: 10,
      }),
      storyBuilder: gradeTrophy(storiesCreated, {
        bronze: 1,
        silver: 3,
        gold: 5,
        platinum: 10,
      }),
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
        key: "trueEndings",
        label: "True Endings",
        level: trophyLevels.trueEndings,
        levelLabel: formatLevel(trophyLevels.trueEndings),
        progressText:
          trueEndingsFound === 1
            ? "1 true ending discovered"
            : `${trueEndingsFound} true endings discovered`,
      },
      {
        key: "deathEndings",
        label: "Death Endings",
        level: trophyLevels.deathEndings,
        levelLabel: formatLevel(trophyLevels.deathEndings),
        progressText:
          deathEndingsFound === 1
            ? "1 death ending uncovered"
            : `${deathEndingsFound} death endings uncovered`,
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
        levelLabel: formatLevel(trophyLevels.storyBuilder),
        progressText:
          storiesCreated === 1
            ? "1 story created"
            : `${storiesCreated} stories created`,
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
        label: "True Endings Trophy",
        requirements: [
          "Bronze: Discover 1 true ending",
          "Silver: Discover 3 true endings",
          "Gold: Discover 5 true endings",
          "Platinum: Discover 10 true endings",
        ],
      },
      {
        label: "Death Endings Trophy",
        requirements: [
          "Bronze: Uncover 1 death ending",
          "Silver: Uncover 5 death endings",
          "Gold: Uncover 10 death endings",
          "Platinum: Uncover 20 death endings",
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
    const stories = await Story.find({
      status: { $in: ["public", "coming_soon"] },
      $or: [{ origin: { $exists: false } }, { origin: { $ne: "user" } }],
    })
      .sort({ displayOrder: 1, createdAt: -1 })
      .select(
        "title description coverImage endings status displayOrder categories origin"
      )
      .lean();

    const storyData = stories.map((story) =>
      mapStoryForLibrary(story, user, { includeAuthor: false })
    );

    const trophyPopups = Array.isArray(req.session?.trophyPopups)
      ? req.session.trophyPopups
      : [];

    if (req.session) {
      req.session.trophyPopups = [];
      await commitSession(req);
    }

    res.render("user/library", {
      title: "Library",
      stories: storyData,
      trophyPopups,
      categories: STORY_CATEGORIES,
      libraryType: "official",
      libraryLinks: [
        {
          href: "/u/library/user-stories",
          label: "Browse User Created Stories",
        },
      ],
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("user/library", {
      title: "Library",
      stories: [],
      trophyPopups: [],
      categories: STORY_CATEGORIES,
      libraryType: "official",
      libraryLinks: [
        {
          href: "/u/library/user-stories",
          label: "Browse User Created Stories",
        },
      ],
    });
  }
};

exports.userStoriesLibrary = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const stories = await Story.find({
      origin: "user",
      status: { $in: ["public", "pending", "under_review"] },
    })
      .sort({ createdAt: -1 })
      .select(
        "title description coverImage endings status categories origin author"
      )
      .populate("author", "username")
      .lean();

    const storyData = stories.map((story) =>
      mapStoryForLibrary(story, user, { includeAuthor: true })
    );

    res.render("user/library", {
      title: "User Created Stories",
      stories: storyData,
      trophyPopups: [],
      categories: STORY_CATEGORIES,
      libraryType: "user",
      libraryLinks: [
        { href: "/u/library", label: "Back to Main Library" },
        { href: "/u/authors", label: "Go to My Author Dashboard" },
      ],
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("user/library", {
      title: "User Created Stories",
      stories: [],
      trophyPopups: [],
      categories: STORY_CATEGORIES,
      libraryType: "user",
      libraryLinks: [
        { href: "/u/library", label: "Back to Main Library" },
        { href: "/u/authors", label: "Go to My Author Dashboard" },
      ],
    });
  }
};

exports.authorDashboard = async (req, res) => {
  try {
    const stories = await Story.find({
      author: req.user._id,
      origin: "user",
    })
      .sort({ updatedAt: -1 })
      .lean();

    const flash = await popAuthorFlash(req);

    const storyCards = stories.map((story) => ({
      _id: story._id,
      title: story.title || "Untitled Story",
      status: story.status || "private",
      statusLabel:
        STORY_STATUS_LABELS[story.status] || STORY_STATUS_LABELS.invisible,
      updatedAt: story.updatedAt,
      createdAt: story.createdAt,
      submittedAt: story.submittedAt,
      publishedAt: story.publishedAt,
      isPending: story.status === "pending",
      isPublic: story.status === "public",
      isPrivate: story.status === "private",
      isUnderReview: story.status === "under_review",
    }));

    res.render("user/authorDashboard", {
      title: "My Author Library",
      stories: storyCards,
      flash,
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("user/authorDashboard", {
      title: "My Author Library",
      stories: [],
      flash: { type: "error", message: "Unable to load your author library." },
    });
  }
};

exports.authorStoryCreateDraft = async (req, res) => {
  try {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const title = `Author Story ${randomSuffix}`;

    const story = await Story.create({
      title,
      description: "",
      notes: "",
      coverImage: null,
      author: req.user._id,
      origin: "user",
      status: "private",
      categories: [],
      nodes: [],
      endings: [],
      startNodeId: null,
      images: [],
    });

    await setAuthorFlash(req, {
      type: "success",
      message: `Draft "${story.title}" created. Time to start building!`,
    });

    res.redirect(`/u/authors/stories/${story._id}/edit`);
  } catch (err) {
    console.error(err);
    await setAuthorFlash(req, {
      type: "error",
      message: "We couldn't start a new story. Please try again.",
    });
    res.redirect("/u/authors");
  }
};

exports.authorStoryForm = async (req, res) => {
  try {
    const storyId = req.params.id;
    if (!storyId) {
      await setAuthorFlash(req, {
        type: "error",
        message: "Select a story to edit before opening the builder.",
      });
      return res.redirect("/u/authors");
    }

    const story = await Story.findOne({
      _id: storyId,
      author: req.user._id,
      origin: "user",
    }).lean();

    if (!story) {
      await setAuthorFlash(req, { type: "error", message: "Story not found." });
      return res.redirect("/u/authors");
    }

    const formData = prepareStoryFormData(story);
    const imageOptions = mapStoryImages(story.images);

    res.render("user/storyBuilder", {
      title: `Edit ${story.title || "Story"}`,
      builderMode: "edit",
      storyId,
      formData,
      errors: [],
      availableCategories: STORY_CATEGORIES,
      storyStatus: story.status || "private",
      imageOptions,
      imageLibraryUrl: `/u/authors/stories/${storyId}/images`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("user/authorDashboard", {
      title: "My Author Library",
      stories: [],
      flash: { type: "error", message: "Unable to open the story builder." },
    });
  }
};

exports.authorStoryImages = async (req, res) => {
  try {
    const story = await Story.findOne({
      _id: req.params.id,
      author: req.user._id,
      origin: "user",
    }).lean();

    if (!story) {
      await setAuthorFlash(req, { type: "error", message: "Story not found." });
      return res.redirect("/u/authors");
    }

    const flash = await popAuthorFlash(req);
    const images = mapStoryImages(story.images);

    res.render("user/authorImages", {
      title: `Image Library for ${story.title || "Story"}`,
      story,
      images,
      flash,
    });
  } catch (err) {
    console.error(err);
    await setAuthorFlash(req, {
      type: "error",
      message: "We couldn't load the image library. Please try again.",
    });
    res.redirect("/u/authors");
  }
};

exports.authorStoryImageUpload = async (req, res) => {
  const storyId = req.params.id;
  try {
    const story = await Story.findOne({
      _id: storyId,
      author: req.user._id,
      origin: "user",
    });

    if (!story) {
      await setAuthorFlash(req, { type: "error", message: "Story not found." });
      return res.redirect("/u/authors");
    }

    if (!req.file || !req.file.path) {
      await setAuthorFlash(req, {
        type: "error",
        message: "Upload failed. Please choose an image file.",
      });
      return res.redirect(`/u/authors/stories/${storyId}/images`);
    }

    const url = req.file.path;
    const publicId = req.file.filename || req.file.public_id || null;

    story.images = Array.isArray(story.images) ? story.images : [];
    story.images.unshift({
      url,
      publicId,
      title: deriveFilenameFromUrl(url),
    });

    await story.save();

    await setAuthorFlash(req, {
      type: "success",
      message: "Image uploaded successfully.",
    });

    res.redirect(`/u/authors/stories/${storyId}/images`);
  } catch (err) {
    console.error(err);
    await setAuthorFlash(req, {
      type: "error",
      message: "We couldn't upload that image. Please try again.",
    });
    res.redirect(`/u/authors/stories/${storyId}/images`);
  }
};

exports.authorStoryImageDelete = async (req, res) => {
  const storyId = req.params.id;
  try {
    const story = await Story.findOne({
      _id: storyId,
      author: req.user._id,
      origin: "user",
    });

    if (!story) {
      await setAuthorFlash(req, { type: "error", message: "Story not found." });
      return res.redirect("/u/authors");
    }

    let { publicId = "", url = "" } = req.body;
    publicId = typeof publicId === "string" ? publicId.trim() : "";
    url = typeof url === "string" ? url.trim() : "";
    if (!publicId && url) {
      publicId = derivePublicIdFromUrl(url) || "";
    }

    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.warn("[Author image delete]", err?.message || err);
      }
    }

    const before = Array.isArray(story.images) ? story.images.length : 0;
    story.images = (Array.isArray(story.images) ? story.images : []).filter((item) => {
      if (typeof item === "string") {
        return url ? item !== url : true;
      }
      const matchesId = publicId && item?.publicId === publicId;
      const matchesUrl = url && item?.url === url;
      return !(matchesId || matchesUrl);
    });

    await story.save();

    const removed = story.images.length < before;
    await setAuthorFlash(req, {
      type: removed ? "success" : "error",
      message: removed
        ? "Image removed from your library."
        : "We couldn't find that image in your library.",
    });

    res.redirect(`/u/authors/stories/${storyId}/images`);
  } catch (err) {
    console.error(err);
    await setAuthorFlash(req, {
      type: "error",
      message: "We couldn't remove that image. Please try again.",
    });
    res.redirect(`/u/authors/stories/${storyId}/images`);
  }
};

exports.authorStoryCreate = async (req, res) => {
  const { errors, storyDoc } = parseStoryPayload(req.body);
  if (errors.length) {
    return res.status(400).render("user/storyBuilder", {
      title: "Create a New Story",
      builderMode: "create",
      storyId: null,
      formData: prepareStoryFormData(storyDoc),
      errors,
      availableCategories: STORY_CATEGORIES,
      storyStatus: "private",
      imageOptions: [],
      imageLibraryUrl: null,
    });
  }

  try {
    const story = new Story({
      ...storyDoc,
      author: req.user._id,
      origin: "user",
      status: "private",
    });
    await story.save();

    await setAuthorFlash(req, {
      type: "success",
      message: "Story saved as a private draft.",
    });

    res.redirect("/u/authors");
  } catch (err) {
    console.error(err);
    res.status(500).render("user/storyBuilder", {
      title: "Create a New Story",
      builderMode: "create",
      storyId: null,
      formData: prepareStoryFormData(storyDoc),
      errors: ["We couldn't save your story. Please try again."],
      availableCategories: STORY_CATEGORIES,
      storyStatus: "private",
      imageOptions: [],
      imageLibraryUrl: null,
    });
  }
};

exports.authorStoryUpdate = async (req, res) => {
  let storyDoc = null;
  let story;
  try {
    story = await Story.findOne({
      _id: req.params.id,
      author: req.user._id,
      origin: "user",
    });

    if (!story) {
      await setAuthorFlash(req, {
        type: "error",
        message: "Story not found.",
      });
      return res.redirect("/u/authors");
    }

    const parsed = parseStoryPayload(req.body);
    storyDoc = parsed.storyDoc;
    if (parsed.errors.length) {
      const imageOptions = mapStoryImages(story.images);
      return res.status(400).render("user/storyBuilder", {
        title: `Edit ${story.title || "Story"}`,
        builderMode: "edit",
        storyId: String(story._id),
        formData: prepareStoryFormData({ ...storyDoc, _id: story._id }),
        errors: parsed.errors,
        availableCategories: STORY_CATEGORIES,
        storyStatus: story.status,
        imageOptions,
        imageLibraryUrl: `/u/authors/stories/${story._id}/images`,
      });
    }

    story.title = storyDoc.title;
    story.description = storyDoc.description;
    story.notes = storyDoc.notes;
    story.coverImage = storyDoc.coverImage || undefined;
    story.categories = storyDoc.categories;
    story.nodes = storyDoc.nodes;
    story.endings = storyDoc.endings;
    story.startNodeId = storyDoc.startNodeId;

    await story.save();

    await setAuthorFlash(req, {
      type: "success",
      message: "Story updated.",
    });

    res.redirect("/u/authors");
  } catch (err) {
    console.error(err);
    const fallbackImages = story ? mapStoryImages(story.images) : [];
    res.status(500).render("user/storyBuilder", {
      title: story ? `Edit ${story.title || "Story"}` : "Edit Story",
      builderMode: "edit",
      storyId: req.params.id,
      formData: prepareStoryFormData(storyDoc || {}),
      errors: ["We couldn't update your story. Please try again."],
      availableCategories: STORY_CATEGORIES,
      storyStatus: story?.status || "private",
      imageOptions: fallbackImages,
      imageLibraryUrl: story ? `/u/authors/stories/${story._id}/images` : null,
    });
  }
};

exports.authorStorySubmit = async (req, res) => {
  try {
    const story = await Story.findOne({
      _id: req.params.id,
      author: req.user._id,
      origin: "user",
    });

    if (!story) {
      await setAuthorFlash(req, {
        type: "error",
        message: "Story not found.",
      });
      return res.redirect("/u/authors");
    }

    story.status = "pending";
    story.submittedAt = new Date();
    await story.save();

    await setAuthorFlash(req, {
      type: "success",
      message: "Story submitted for review.",
    });

    res.redirect("/u/authors");
  } catch (err) {
    console.error(err);
    await setAuthorFlash(req, {
      type: "error",
      message: "We couldn't submit your story. Please try again.",
    });
    res.redirect("/u/authors");
  }
};

exports.authorStorySetPrivate = async (req, res) => {
  try {
    const story = await Story.findOne({
      _id: req.params.id,
      author: req.user._id,
      origin: "user",
    });

    if (!story) {
      await setAuthorFlash(req, {
        type: "error",
        message: "Story not found.",
      });
      return res.redirect("/u/authors");
    }

    story.status = "private";
    story.publishedAt = null;
    await story.save();

    await setAuthorFlash(req, {
      type: "success",
      message: "Story moved back to your private library.",
    });

    res.redirect("/u/authors");
  } catch (err) {
    console.error(err);
    await setAuthorFlash(req, {
      type: "error",
      message: "We couldn't update the story status.",
    });
    res.redirect("/u/authors");
  }
};
