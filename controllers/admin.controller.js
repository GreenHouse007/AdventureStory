const User = require("../models/user.model");
const Story = require("../models/story.model");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");

/* ------------------ DASHBOARD ------------------ */
exports.dashboard = async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const storyCount = await Story.countDocuments();

    res.render("admin/dashboard", {
      title: "Admin Dashboard",
      user: req.user,
      stats: { userCount, storyCount },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading dashboard");
  }
};

/* ------------------ USERS ------------------ */
// List users (with optional search)
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
      "username email role createdAt currency"
    );

    res.render("admin/users", { title: "Manage Users", users, q });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading users");
  }
};

// Show single user detail
exports.userDetail = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate("progress.story");
    if (!user) return res.status(404).send("User not found");

    res.render("admin/userDetail", { title: "User Detail", user });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading user detail");
  }
};

// Update user info + stats
exports.userUpdate = async (req, res) => {
  try {
    const {
      username,
      email,
      role,
      currency,
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

// Reset user password
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

// Delete user
exports.userDelete = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.redirect("/admin/users");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting user");
  }
};

// Show add user form
exports.userAddForm = (req, res) => {
  res.render("admin/userAdd", { title: "Add User" });
};

// Handle add user
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

// Toggle admin role
exports.toggleAdmin = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send("User not found");

    user.role = user.role === "admin" ? "user" : "admin";
    await user.save();

    res.redirect("/admin/users");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating role");
  }
};

/* ------------------ STORIES ------------------ */
// List stories
exports.storiesList = async (req, res) => {
  try {
    const stories = await Story.find().select(
      "title description coverImage createdAt"
    );
    res.render("admin/stories", { title: "Manage Stories", stories });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading stories");
  }
};

// Add story form
exports.storyAddForm = (req, res) => {
  res.render("admin/storyAdd", { title: "Add Story" });
};

// Handle add story
exports.storyAddPost = async (req, res) => {
  try {
    const { title, description, coverImage, status } = req.body;
    await Story.create({
      title,
      description,
      coverImage,
      status,
      nodes: [],
      endings: [],
    });
    res.redirect("/admin/stories");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating story");
  }
};

// Edit story form
exports.storyEditForm = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    res.render("admin/storyEdit", { title: "Edit Story", story });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading story");
  }
};

// Handle edit story
exports.storyEditPost = async (req, res) => {
  try {
    const { title, description, coverImage, status, startNodeId } = req.body;
    await Story.findByIdAndUpdate(req.params.id, {
      title,
      description,
      coverImage,
      status: (status || "coming_soon").toLowerCase(),
      startNodeId: startNodeId || null,
    });
    res.redirect("/admin/stories");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating story");
  }
};

// Delete story
exports.storyDelete = async (req, res) => {
  try {
    await Story.findByIdAndDelete(req.params.id);
    res.redirect("/admin/stories");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting story");
  }
};

/* ------------------ STORY NODES ------------------ */
exports.storyNodeAddForm = async (req, res) => {
  const story = await Story.findById(req.params.id);
  res.render("admin/nodeAdd", { title: "Add Node", story });
};

exports.storyNodeAddPost = async (req, res) => {
  const { _id, text, image } = req.body;
  await Story.findByIdAndUpdate(req.params.id, {
    $push: { nodes: { _id, text, image, choices: [] } },
  });
  res.redirect(`/admin/stories/${req.params.id}/edit`);
};

exports.storyNodeEditForm = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    const node = story.nodes.find((n) => n._id === req.params.nodeId);
    if (!node) return res.status(404).send("Node not found");

    res.render("admin/nodeEdit", { title: "Edit Node", story, node });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading node");
  }
};

exports.storyNodeEditPost = async (req, res) => {
  try {
    const { _id: newId, text, image } = req.body;
    const oldId = req.params.nodeId;

    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    const node = story.nodes.find((n) => n._id === oldId);
    if (!node) return res.status(404).send("Node not found");

    // Update node fields
    node._id = newId;
    node.text = text;
    node.image = image;

    // Cascade: update all choices pointing to oldId
    story.nodes.forEach((n) => {
      n.choices.forEach((ch) => {
        if (ch.nextNodeId === oldId) ch.nextNodeId = newId;
      });
    });

    // Update startNodeId if it was the oldId
    if (story.startNodeId === oldId) story.startNodeId = newId;

    await story.save();
    res.redirect(`/admin/stories/${req.params.id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating node");
  }
};

exports.storyNodeDelete = async (req, res) => {
  await Story.findByIdAndUpdate(req.params.id, {
    $pull: { nodes: { _id: req.params.nodeId } },
  });
  res.redirect(`/admin/stories/${req.params.id}/edit`);
};

exports.nodeChoiceAdd = async (req, res) => {
  const { label, nextNodeId } = req.body;
  await Story.updateOne(
    { _id: req.params.id, "nodes._id": req.params.nodeId },
    { $push: { "nodes.$.choices": { label, nextNodeId } } }
  );
  res.redirect(
    `/admin/stories/${req.params.id}/nodes/${req.params.nodeId}/edit`
  );
};

/* ------------------ STORY ENDINGS ------------------ */
exports.storyEndingAddForm = async (req, res) => {
  const story = await Story.findById(req.params.id);
  res.render("admin/endingAdd", { title: "Add Ending", story });
};

exports.storyEndingAddPost = async (req, res) => {
  const { _id, label, type, text, image } = req.body;
  await Story.findByIdAndUpdate(req.params.id, {
    $push: { endings: { _id, label, type, text, image } },
  });
  res.redirect(`/admin/stories/${req.params.id}/edit`);
};

exports.storyEndingEditForm = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    const ending = story.endings.find((e) => e._id === req.params.endingId);
    if (!ending) return res.status(404).send("Ending not found");

    res.render("admin/endingEdit", { title: "Edit Ending", story, ending });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading ending");
  }
};

exports.storyEndingEditPost = async (req, res) => {
  try {
    const { _id: newId, label, type, text, image } = req.body;
    const oldId = req.params.endingId;

    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    const ending = story.endings.find((e) => e._id === oldId);
    if (!ending) return res.status(404).send("Ending not found");

    // Update ending fields
    ending._id = newId;
    ending.label = label;
    ending.type = type;
    ending.text = text;
    ending.image = image;

    // Cascade: update all choices pointing to old ending id
    story.nodes.forEach((n) => {
      n.choices.forEach((ch) => {
        if (ch.nextNodeId === oldId) ch.nextNodeId = newId;
      });
    });

    await story.save();
    res.redirect(`/admin/stories/${req.params.id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating ending");
  }
};

exports.storyEndingDelete = async (req, res) => {
  await Story.findByIdAndUpdate(req.params.id, {
    $pull: { endings: { _id: req.params.endingId } },
  });
  res.redirect(`/admin/stories/${req.params.id}/edit`);
};

exports.nodeChoiceDelete = async (req, res) => {
  await Story.updateOne(
    { _id: req.params.id, "nodes._id": req.params.nodeId },
    { $pull: { "nodes.$.choices": { _id: req.params.choiceId } } }
  );
  res.redirect(
    `/admin/stories/${req.params.id}/nodes/${req.params.nodeId}/edit`
  );
};

// List images for a story
exports.listImages = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    const dir = path.join(
      __dirname,
      "..",
      "public",
      "uploads",
      "stories",
      story._id.toString()
    );
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const files = fs.readdirSync(dir);
    const images = files.map((f) => `/uploads/stories/${story._id}/${f}`);

    res.render("admin/storyImages", { title: "Image Library", story, images });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading images");
  }
};

// Handle upload
exports.uploadImage = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    // File is saved by multer, we just redirect
    res.redirect(`/admin/stories/${story._id}/images`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error uploading image");
  }
};
