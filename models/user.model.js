const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },

    // Track story progress
    progress: [
      {
        story: { type: mongoose.Schema.Types.ObjectId, ref: "Story" },
        endingsFound: [{ type: String }],
        trueEndingFound: { type: Boolean, default: false },
        deathEndingCount: { type: Number, default: 0 },
        lastNodeId: { type: String, default: null },
        unlockedChoices: [{ type: String }],
      },
    ],

    // Aggregate stats
    totalEndingsFound: { type: Number, default: 0 },
    storiesRead: { type: Number, default: 0 },
    medals: {
      death: {
        type: String,
        enum: ["none", "bronze", "silver", "gold", "platinum"],
        default: "none",
      },
      trueEnding: {
        type: String,
        enum: ["none", "bronze", "silver", "gold", "platinum"],
        default: "none",
      },
    },

    // Currency system
    currency: { type: Number, default: 0 },
    authorCurrency: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
