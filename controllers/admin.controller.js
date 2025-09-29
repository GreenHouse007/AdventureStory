const User = require("../models/user.model");
const Story = require("../models/story.model");
const bcrypt = require("bcrypt");

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

exports.usersList = async (req, res) => {
  try {
    const q = req.query.q || ""; // search string
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

exports.storiesList = async (req, res) => {
  try {
    const stories = await Story.find().select(
      "title description endings createdAt"
    );
    res.render("admin/stories", { title: "Manage Stories", stories });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading stories");
  }
};

exports.userDetail = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate("progress.story"); // show story stats

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
    user.currency = Number(currency);
    user.totalEndingsFound = Number(totalEndingsFound);
    user.storiesRead = Number(storiesRead);
    user.medals.death = deathMedal;
    user.medals.trueEnding = trueMedal;

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

// show add user form
exports.userAddForm = (req, res) => {
  res.render("admin/userAdd", { title: "Add User" });
};

// handle add user form submission
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

exports.newStoryGet = (req, res) => {
  res.render("admin/newStory", { title: "New Story" });
};

exports.newStoryPost = (req, res) => {
  res.send("New story created (not implemented yet)");
};

exports.editStoryGet = (req, res) => {
  res.render("admin/editStory", { title: "Edit Story" });
};

exports.editStoryPost = (req, res) => {
  res.send("Story updated (not implemented yet)");
};
