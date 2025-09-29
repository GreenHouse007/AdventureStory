const User = require("../models/user.model");
const Story = require("../models/story.model");

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
    const { username, email, role, currency } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send("User not found");

    user.username = username;
    user.email = email;
    user.role = role;
    user.currency = currency;

    await user.save();
    res.redirect(`/admin/users/${user._id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating user");
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
