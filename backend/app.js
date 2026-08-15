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

app.post("videos",(req,res)=>{
    const Video = require("./models/Video");

    const YOUTUBE_API_URL =
    "https://www.googleapis.com/youtube/v3";

    /*
        كلمات البحث التي سنستخدمها لتنويع النتائج.
        يمكنك تغييرها لاحقًا حسب نوع الموقع.
    */
    const searchQueries = [
    "technology",
    "science",
    "history",
    "education",
    "nature",
    "space",
    "programming",
    "cars",
    "travel",
    "documentary"
    ];


    /*
        خلط Array بطريقة Fisher-Yates
    */
    function shuffle(array) {
    const arr = [...array];

    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr;
    }


    /*
        GET /api/videos/import-youtube
    */
    exports.importYouTubeVideos = async (req, res) => {
    try {
        const apiKey = process.env.YOUTUBE_API_KEY;

        if (!apiKey) {
        return res.status(500).json({
            success: false,
            message: "YOUTUBE_API_KEY is missing from .env"
        });
        }

        /*
            العدد المطلوب.
            يمكن تغييره من الرابط:

            /api/videos/import-youtube?limit=200

            أو:

            /api/videos/import-youtube?limit=500
        */

        let limit = Number(req.query.limit) || 200;

        /*
            لا نسمح بأكثر من 500 في الطلب الواحد
            لتجنب استهلاك الـ API quota بشكل كبير.
        */

        if (limit > 500) {
        limit = 500;
        }

        if (limit < 1) {
        limit = 1;
        }


        /*
            سنجمع نتائج البحث هنا
        */

        let collectedVideos = [];

        /*
            نحتفظ بالـ IDs حتى لا نكرر الفيديو
        */

        const existingIds = new Set();


        /*
            نخلط كلمات البحث
            حتى لا نحصل دائمًا على نفس نوع الفيديوهات.
        */

        const queries = shuffle(searchQueries);


        /*
            YouTube search.list يسمح بحد أقصى 50 نتيجة
            في الطلب الواحد.
        */

        for (const query of queries) {
        if (collectedVideos.length >= limit) {
            break;
        }

        let nextPageToken = null;


        /*
            نأخذ صفحات من كل Query
        */

        while (collectedVideos.length < limit) {
            const params = new URLSearchParams({
            part: "snippet",
            type: "video",
            maxResults: "50",
            q: query,
            key: apiKey
            });

            if (nextPageToken) {
            params.set("pageToken", nextPageToken);
            }


            const response = await fetch(
            `${YOUTUBE_API_URL}/search?${params.toString()}`
            );


            if (!response.ok) {
            const errorText = await response.text();

            console.error("YouTube API Error:", errorText);

            return res.status(response.status).json({
                success: false,
                message: "YouTube API request failed",
                error: errorText
            });
            }


            const data = await response.json();


            /*
                استخراج الفيديوهات
            */

            for (const item of data.items || []) {
            const videoId = item.id?.videoId;

            if (!videoId) {
                continue;
            }

            /*
                منع التكرار
            */

            if (existingIds.has(videoId)) {
                continue;
            }

            existingIds.add(videoId);


            collectedVideos.push({
                videoId,

                title: item.snippet?.title || "",

                channelId: item.snippet?.channelId || "",

                description: item.snippet?.description || "",

                category: query,

                videoUrl:
                `https://www.youtube.com/watch?v=${videoId}`,

                thumbnailUrl:
                item.snippet?.thumbnails?.high?.url ||
                item.snippet?.thumbnails?.medium?.url ||
                item.snippet?.thumbnails?.default?.url ||
                ""
            });


            if (collectedVideos.length >= limit) {
                break;
            }
            }


            /*
                هل توجد صفحة أخرى؟
            */

            nextPageToken = data.nextPageToken;

            if (!nextPageToken) {
            break;
            }
        }
        }


        /*
            نخلط الفيديوهات قبل الحفظ
        */

        collectedVideos = shuffle(collectedVideos);


        /*
            الآن نحتاج معلومات المشاهدات والإعجابات.

            videos.list يستطيع أخذ حتى 50 ID في الطلب.
        */

        const videoIds = collectedVideos.map(video => video.videoId);

        const statisticsMap = new Map();


        for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);

        const params = new URLSearchParams({
            part: "statistics",
            id: batch.join(","),
            key: apiKey
        });


        const response = await fetch(
            `${YOUTUBE_API_URL}/videos?${params.toString()}`
        );


        if (!response.ok) {
            const errorText = await response.text();

            console.error("YouTube Statistics Error:", errorText);

            break;
        }


        const data = await response.json();


        for (const item of data.items || []) {
            statisticsMap.set(item.id, {
            views: Number(item.statistics?.viewCount || 0),

            likes: Number(item.statistics?.likeCount || 0)
            });
        }
        }


        /*
            إضافة views و likes إلى البيانات
        */

        for (const video of collectedVideos) {
        const stats = statisticsMap.get(video.videoId);

        video.views = stats?.views || 0;
        video.likes = stats?.likes || 0;
        }


        /*
            حفظ الفيديوهات في MongoDB

            updateOne + upsert يمنع تكرار الفيديو.
        */

        let inserted = 0;
        let updated = 0;


        for (const video of collectedVideos) {
        const result = await Video.updateOne(
            {
            videoId: video.videoId
            },

            {
            $set: {
                title: video.title,
                channelId: video.channelId,
                description: video.description,
                category: video.category,
                videoUrl: video.videoUrl,
                thumbnailUrl: video.thumbnailUrl,
                views: video.views,
                likes: video.likes
            }
            },

            {
            upsert: true
            }
        );


        if (result.upsertedCount > 0) {
            inserted++;
        } else if (result.modifiedCount > 0) {
            updated++;
        }
        }


        /*
            النتيجة
        */

        return res.json({
        success: true,

        message: "YouTube videos imported successfully",

        requested: limit,

        collected: collectedVideos.length,

        inserted,

        updated,

        videos: collectedVideos
        });

    } catch (error) {
        console.error("Import YouTube Videos Error:", error);

        return res.status(500).json({
        success: false,

        message: "Failed to import YouTube videos",

        error: error.message
        });
    }
    };
})

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found"
    });
});



app.listen(process.env.PORT, () => {
    console.log(`Server running on http://localhost:${process.env.PORT}`);
});
