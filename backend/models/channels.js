const mongoose = require("mongoose");

const schema = mongoose.Schema({
    name:String,
    userId:String,
    description:String,

}, {
    timestamps: true
})

module.exports = mongoose.model("channel",schema)