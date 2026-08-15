const express = require("express");

const app = express();

require("dotenv").config();

const cookie = require("cookie-parser")

const cors = require("cors");

const users = require("./models/users")

const categories = require("./models/categories")

const channels = require("./models/channels")

const videos = require("./models/videos")


const register_router = require("./routes/register.router")

const log_in_router = require("./routes/log_in.router")

const auth_me_router = require("./routes/auth_me.router");

const channel = require("./routes/channels.router");

const get_videos = require("./routes/get_videos.router");

const create_videos = require("./routes/create_videos.router");

const get_channels = require("./routes/get_channels.router");

const likes = require("./routes/likes.router");

const search = require("./routes/search.router");

const auth = require("./middleware/auth");

const mongoose = require("mongoose");

const url = process.env.MONGO_URI


mongoose.connect(url).then(()=>{
    console.log("connected")
}).catch((e)=>{
    console.log(e.message)
})

app.use(cors({
    origin: "https://hassangame994-bot.github.io",
    credentials: true
}));
console.log("✅ CORS CONFIG LOADED");
app.use(cookie())

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use(register_router);

app.use(log_in_router);

app.use(auth_me_router);

app.use(channel);

app.use(get_videos);

app.use(create_videos);

app.use(get_channels);

app.use(likes);

app.use(search);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found"
    });
});



app.listen(process.env.PORT, () => {
    console.log(`Server running on http://localhost:${process.env.PORT}`);
});
