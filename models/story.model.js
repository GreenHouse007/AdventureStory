const mongoose = require("mongoose");

const choiceSchema = new mongoose.Schema(
  {
    label: String,
    nextNodeId: String,
    locked: { type: Boolean, default: false },
    unlockCost: { type: Number, default: 0 },
  },
  { _id: true }
);

const nodeSchema = new mongoose.Schema({
  _id: String, // unique ID ("start", "forest1")
  text: String,
  image: String,
  notes: String, // private notes for each node
  color: { type: String, default: "twilight" }, // border accent color
  position: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
  },
  choices: [choiceSchema],
});

const endingSchema = new mongoose.Schema({
  _id: String, // "ending1"
  label: String,
  type: {
    type: String,
    enum: ["true", "death", "other", "secret"],
    default: "other",
  },
  text: String,
  image: String,
  notes: String, // private notes for ending
  position: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
  },
});

const storySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,
    coverImage: String,
    status: {
      type: String,
      enum: ["public", "coming_soon", "invisible"],
      default: "invisible",
    },
    startNodeId: { type: String, default: null },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    notes: String,

    categories: { type: [String], default: [] },

    nodes: [nodeSchema],
    endings: [endingSchema],

    images: { type: [require("mongoose").Schema.Types.Mixed], default: [] },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Story", storySchema);
