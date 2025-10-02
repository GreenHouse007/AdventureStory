const mongoose = require("mongoose");

const choiceSchema = new mongoose.Schema(
  {
    label: String,
    nextNodeId: String,
  },
  { _id: true }
);

const nodeSchema = new mongoose.Schema({
  _id: String, // "start", "forest1"
  text: String,
  image: String,
  choices: [choiceSchema],
});

const endingSchema = new mongoose.Schema({
  _id: String, // "ending1"
  label: String,
  type: { type: String, enum: ["true", "death", "other"], default: "other" },
  text: String,
  image: String,
});

const storySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,
    coverImage: String,
    nodes: [nodeSchema],
    endings: [endingSchema],
    status: {
      type: String,
      enum: ["public", "coming_soon"],
      default: "coming_soon",
    },
    startNodeId: { type: String, default: null },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Story", storySchema);
