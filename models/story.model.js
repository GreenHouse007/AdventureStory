const mongoose = require("mongoose");

const choiceSchema = new mongoose.Schema({
  label: String,
  nextNodeId: String, // could be another node OR an ending
});

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

const storySchema = new mongoose.Schema({
  title: String,
  description: String,
  coverImage: String,
  nodes: [nodeSchema],
  endings: [endingSchema],
});

module.exports = mongoose.model("Story", storySchema);
