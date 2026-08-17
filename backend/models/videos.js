const mongoose = require("mongoose");

const schema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },

    channelId: String,

    description: String,

    category: String,

    videoUrl: String,

    thumbnailUrl: String,

    views: {
      type: Number,
      default: 0
    },

    likes: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Speeds up the ranking algorithm's catalog queries:
// - .sort({ createdAt: -1 }) when building the "recent uploads" pool
// - matching a video's category against the user's preferred categories
schema.index({ createdAt: -1 });
schema.index({ category: 1 });

module.exports = mongoose.model("video", schema);