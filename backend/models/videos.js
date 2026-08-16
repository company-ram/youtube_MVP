const mongoose = require("mongoose");

const schema = mongoose.Schema(
  {
    videoId: {
      type: String,
      unique: true,
      index: true
    },

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

module.exports = mongoose.model("video", schema);