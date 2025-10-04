const User = require("../models/user.model");
const Story = require("../models/story.model");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("node:crypto"); // built-in UUID

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

/* ------------------ STORIES ------------------ */
exports.storiesList = async (req, res) => {
  try {
    const q = req.query.q || "";
    const query = q ? { title: { $regex: q, $options: "i" } } : {};
    const stories = await Story.find(query)
      .sort({ displayOrder: 1, createdAt: -1 })
      .select("title description coverImage status displayOrder");
    res.render("admin/stories", { title: "Story Collection", stories, q });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading stories");
  }
};

exports.storyAddForm = (req, res) =>
  res.render("admin/storyAdd", { title: "Add Story" });

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

exports.storyEditForm = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    // Ensure existing stories have IDs for nodes/endings
    let changed = false;
    story.nodes.forEach((n) => {
      if (!n._id || n._id.trim() === "") {
        n._id =
          (n.type === "divider" ? "divider_" : "node_") +
          randomUUID().slice(0, 8);
        changed = true;
      }
    });
    story.endings.forEach((e) => {
      if (!e._id || e._id.trim() === "") {
        e._id = "ending_" + randomUUID().slice(0, 8);
        changed = true;
      }
    });
    if (changed) await story.save();

    res.render("admin/storyEditor", { title: "Story Editor", story });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading story");
  }
};

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
    const { title, description, coverImage, status, startNodeId, notes } =
      req.body;
    await Story.findByIdAndUpdate(req.params.id, {
      title,
      description,
      coverImage,
      status: (status || "coming_soon").toLowerCase(),
      startNodeId: startNodeId || null,
      notes: notes || "",
    });
    res.redirect(`/admin/stories/${req.params.id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating story info");
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

/* ------------------ NODES ------------------ */
exports.storyNodeAddPost = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    const id = req.body._id || "node_" + randomUUID().slice(0, 8);
    // unshift to place at the top
    story.nodes.unshift({
      _id: id,
      type: "node",
      text: req.body.text || "",
      image: req.body.image || "",
      notes: "",
      choiceNotes: "",
      choices: [],
    });

    await story.save();
    res.redirect(`/admin/stories/${story._id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error adding node");
  }
};

exports.storyNodeUpdateInline = async (req, res) => {
  try {
    const { _id: newId, text, image, notes, choiceNotes } = req.body;
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    const node = story.nodes.find((n) => n._id === req.params.nodeId);
    if (!node) return res.status(404).send("Node not found");

    const oldId = node._id;
    node._id = newId;
    node.text = text;
    node.image = image;
    node.notes = notes;
    node.choiceNotes = choiceNotes;

    // Cascade: fix all choices pointing to the old node id
    story.nodes.forEach((n) =>
      n.choices.forEach((ch) => {
        if (ch.nextNodeId === oldId) ch.nextNodeId = newId;
      })
    );
    if (story.startNodeId === oldId) story.startNodeId = newId;

    await story.save();
    res.redirect(`/admin/stories/${req.params.id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating node");
  }
};

exports.storyNodeDelete = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    const targetId = req.params.nodeId;
    story.nodes = story.nodes.filter((n) => n._id !== targetId);

    // Remove broken links from choices and clear startNodeId if needed
    story.nodes.forEach((n) => {
      n.choices = n.choices.filter((ch) => ch.nextNodeId !== targetId);
    });
    if (story.startNodeId === targetId) story.startNodeId = null;

    await story.save();
    res.redirect(`/admin/stories/${req.params.id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting node");
  }
};

/* ------------------ ENDINGS ------------------ */
exports.storyEndingAddPost = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    const id = req.body._id || "ending_" + randomUUID().slice(0, 8);
    story.endings.unshift({
      _id: id,
      label: req.body.label || "New Ending",
      type: req.body.type || "other",
      text: req.body.text || "",
      image: req.body.image || "",
      notes: "",
    });

    await story.save();
    res.redirect(`/admin/stories/${story._id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error adding ending");
  }
};

exports.storyEndingUpdateInline = async (req, res) => {
  try {
    const { _id: newId, label, type, text, image, notes } = req.body;
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    const ending = story.endings.find((e) => e._id === req.params.endingId);
    if (!ending) return res.status(404).send("Ending not found");

    const oldId = ending._id;
    ending._id = newId;
    ending.label = label;
    ending.type = type;
    ending.text = text;
    ending.image = image;
    ending.notes = notes;

    // Cascade: fix choices pointing to this ending
    story.nodes.forEach((n) =>
      n.choices.forEach((ch) => {
        if (ch.nextNodeId === oldId) ch.nextNodeId = newId;
      })
    );

    await story.save();
    res.redirect(`/admin/stories/${req.params.id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating ending");
  }
};

exports.storyEndingDelete = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    const targetId = req.params.endingId;
    story.endings = story.endings.filter((e) => e._id !== targetId);

    // Remove broken links from choices
    story.nodes.forEach((n) => {
      n.choices = n.choices.filter((ch) => ch.nextNodeId !== targetId);
    });

    await story.save();
    res.redirect(`/admin/stories/${req.params.id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting ending");
  }
};

/* ------------------ CHOICES ------------------ */
exports.nodeChoiceAddInline = async (req, res) => {
  try {
    const { label, nextNodeId } = req.body;
    await Story.updateOne(
      { _id: req.params.id, "nodes._id": req.params.nodeId },
      { $push: { "nodes.$.choices": { label, nextNodeId } } }
    );
    res.redirect(`/admin/stories/${req.params.id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error adding choice");
  }
};

exports.nodeChoiceUpdateInline = async (req, res) => {
  try {
    const { label, nextNodeId } = req.body;
    await Story.updateOne(
      {
        _id: req.params.id,
        "nodes._id": req.params.nodeId,
        "nodes.choices._id": req.params.choiceId,
      },
      {
        $set: {
          "nodes.$[node].choices.$[choice].label": label,
          "nodes.$[node].choices.$[choice].nextNodeId": nextNodeId,
        },
      },
      {
        arrayFilters: [
          { "node._id": req.params.nodeId },
          { "choice._id": req.params.choiceId },
        ],
      }
    );
    res.redirect(`/admin/stories/${req.params.id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating choice");
  }
};

exports.nodeChoiceDelete = async (req, res) => {
  try {
    await Story.updateOne(
      { _id: req.params.id, "nodes._id": req.params.nodeId },
      { $pull: { "nodes.$.choices": { _id: req.params.choiceId } } }
    );
    res.redirect(`/admin/stories/${req.params.id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting choice");
  }
};

/* ------------------ DIVIDERS ------------------ */
exports.storyNodeAddDivider = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");

    const id = "divider_" + randomUUID().slice(0, 8);
    story.nodes.unshift({
      _id: id,
      type: "divider",
      label: "Divider",
      color: "gray",
    });

    await story.save();
    res.redirect(`/admin/stories/${story._id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error adding divider");
  }
};

exports.storyNodeUpdateDivider = async (req, res) => {
  try {
    const { label, color } = req.body;
    await Story.updateOne(
      { _id: req.params.id, "nodes._id": req.params.nodeId },
      { $set: { "nodes.$.label": label, "nodes.$.color": color } }
    );
    res.redirect(`/admin/stories/${req.params.id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating divider");
  }
};

exports.storyNodeDeleteDivider = async (req, res) => {
  try {
    await Story.findByIdAndUpdate(req.params.id, {
      $pull: { nodes: { _id: req.params.nodeId, type: "divider" } },
    });
    res.redirect(`/admin/stories/${req.params.id}/edit`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting divider");
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
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const files = fs.readdirSync(dir);
    const images = files.map((f) => `/uploads/stories/${story._id}/${f}`);
    res.render("admin/storyImages", { title: "Image Library", story, images });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading images");
  }
};

exports.uploadImage = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).send("Story not found");
    res.redirect(`/admin/stories/${story._id}/images`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error uploading image");
  }
};
