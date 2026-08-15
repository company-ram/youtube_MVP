const mongoose = require("mongoose");

const schema = mongoose.Schema({
    title:String,
    channelId:String,
    description:String,
    category:String,
    videoUrl:String,
    thumbnailUrl:String,
    views:Number,
    likes:Number

}, {
    timestamps: true
})

module.exports = mongoose.model("video",schema)