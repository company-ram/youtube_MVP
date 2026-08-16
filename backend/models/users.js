const mongoose = require("mongoose");

const schema = mongoose.Schema({
    name: String,

    password: String,

    email: String,

    // الأقسام التي أحبها المستخدم عن طريق Like
    your_category: [String],

    // الأقسام التي بحث عنها المستخدم
    search_categories: [String]

}, {
    timestamps: true
});

module.exports = mongoose.model("user", schema);