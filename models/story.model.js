const mongoose = require("mongoose");

const choiceSchema = new mongoose.Schema(
  {
    label: String,
    nextNodeId: String,
  },
  { _id: true }
);

const nodeSchema = new mongoose.Schema({
  _id: String, // unique ID ("start", "forest1", "divider_xxx")
  type: { type: String, enum: ["node", "divider"], default: "node" },
  label: String, // used for dividers
  text: String, // story text (nodes only)
  image: String,
  notes: String, // private notes for each node
  choiceNotes: String, // shared notes for the choices section
  color: { type: String, default: "gray" }, // divider color
  choices: [choiceSchema], // choices only apply if type === "node"
});

const endingSchema = new mongoose.Schema({
  _id: String, // "ending1"
  label: String,
  type: { type: String, enum: ["true", "death", "other"], default: "other" },
  text: String,
  image: String,
  notes: String, // private notes for ending
});

const storySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,
    coverImage: String,
    status: {
      type: String,
      enum: ["public", "coming_soon"],
      default: "coming_soon",
    },
    startNodeId: { type: String, default: null },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    notes: String,

    nodes: [nodeSchema],
    endings: [endingSchema],

    images: { type: [require("mongoose").Schema.Types.Mixed], default: [] },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Story", storySchema);
