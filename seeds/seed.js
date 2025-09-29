// seeds/seed.js
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

// ==== MODELS ====
const User = require("../models/user.model");
const Story = require("../models/story.model");

// ==== DB CONNECT ====
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/cyoaDB";
async function connect() {
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("✅ Connected to Mongo:", MONGO_URI);
}

// ==== DATA ====
const storiesData = [
  {
    title: "The Lantern in the Ashwood",
    description:
      "On a rainy night, you step into the Ashwood. Somewhere in the dark, a lantern burns with a strange light.",
    coverImage: "/images/ashwood.jpg",
    nodes: [
      {
        _id: "start",
        text: "The forest path twists ahead, slick with rain. A lantern flickers deeper inside.",
        image: "/images/story/ashwood/start.jpg",
        choices: [
          { label: "Approach the lantern", nextNodeId: "lantern" },
          { label: "Turn back to the road", nextNodeId: "ending1" },
        ],
      },
      {
        _id: "lantern",
        text: "The lantern hangs from a crooked branch. Its flame pulses like a heartbeat.",
        image: "/images/story/ashwood/lantern.jpg",
        choices: [
          { label: "Take the lantern", nextNodeId: "ending2" },
          { label: "Leave it and walk on", nextNodeId: "clearing" },
        ],
      },
      {
        _id: "clearing",
        text: "You enter a clearing. The trees are silent. A shadow moves at the edge of your vision.",
        image: "/images/story/ashwood/clearing.jpg",
        choices: [
          { label: "Follow the shadow", nextNodeId: "ending3" },
          { label: "Stand your ground", nextNodeId: "ending4" },
        ],
      },
    ],
    endings: [
      {
        _id: "ending1",
        label: "The Safe Path",
        type: "other",
        text: "You walk away. The Ashwood swallows its secrets, and you live to wonder another day.",
        image: "/images/story/ashwood/safe.jpg",
      },
      {
        _id: "ending2",
        label: "Lantern Consumed",
        type: "death",
        text: "The moment you touch the lantern, fire engulfs you. The Ashwood drinks your ashes.",
        image: "/images/story/ashwood/fire.jpg",
      },
      {
        _id: "ending3",
        label: "Hollow Stag",
        type: "death",
        text: "The shadow resolves into antlers. The Hollow Stag lowers its head and silence falls forever.",
        image: "/images/story/ashwood/stag.jpg",
      },
      {
        _id: "ending4",
        label: "True Ending: Keeper of the Flame",
        type: "true",
        text: "You stand unafraid. The lantern appears in your hand, burning steady. You are chosen as Keeper of the Flame.",
        image: "/images/story/ashwood/true.jpg",
      },
    ],
  },
];

// ==== RUN ====
(async () => {
  try {
    await connect();

    // Clear existing (safe for dev; remove if you want additive seed)
    //await Promise.all([User.deleteMany({}), Story.deleteMany({})]);
    await Promise.all([Story.deleteMany({})]);
    console.log("🧹 Cleared existing users & stories");

    /* Create admin
    const hash = await bcrypt.hash(adminUser.password, 12);
    const adminDoc = await User.create({
      username: adminUser.username,
      email: adminUser.email,
      passwordHash: hash,
      role: "admin",
    });
    console.log("👑 Admin created:", adminDoc.email);
    */

    // Create stories
    const createdStories = await Story.insertMany(storiesData);
    console.log(`📚 Seeded ${createdStories.length} stories`);

    console.log("✅ Seed complete");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }
})();
