const Video = require("../models/videos");

const YOUTUBE_API_URL =
    "https://www.googleapis.com/youtube/v3";

const categories = [
    "technology",
    "programming",
    "science",
    "education",
    "gaming",
    "music",
    "sports",
    "football",
    "cars",
    "travel",
    "food",
    "cooking",
    "fitness",
    "history",
    "nature",
    "space",
    "comedy",
    "news",
    "business",
    "animals"
];

async function importYouTubeVideos() {

    try {

        const apiKey =
            process.env.YOUTUBE_API_KEY;

        if (!apiKey) {
            console.log("❌ YOUTUBE_API_KEY is missing");
            return;
        }

        const TARGET = 200;

        const currentCount =
            await Video.countDocuments();

        console.log(
            `📦 Current videos: ${currentCount}`
        );

        if (currentCount >= TARGET) {

            console.log(
                "✅ Already have 200 videos"
            );

            return;
        }

        const needed = TARGET - currentCount;

        /*
            200 ÷ 20 categories = 10 videos
            لكل قسم
        */
        const videosPerCategory =
            Math.ceil(needed / categories.length);

        console.log(
            `🎬 Need ${needed} videos`
        );

        console.log(
            `📚 ${videosPerCategory} videos per category`
        );

        const collectedVideos = [];

        const collectedIds = new Set();

        /*
            نمر على كل قسم
        */
        for (const category of categories) {

            if (collectedVideos.length >= needed) {
                break;
            }

            console.log(
                `🔎 Searching: ${category}`
            );

            const params =
                new URLSearchParams({

                    part: "snippet",

                    type: "video",

                    maxResults: "50",

                    q: category,

                    key: apiKey
                });

            const response =
                await fetch(
                    `${YOUTUBE_API_URL}/search?${params}`
                );

            if (!response.ok) {

                const error =
                    await response.text();

                console.log(
                    `❌ Error in ${category}:`,
                    error
                );

                continue;
            }

            const data =
                await response.json();

            let categoryCount = 0;

            for (const item of data.items || []) {

                if (
                    categoryCount >=
                    videosPerCategory
                ) {
                    break;
                }

                const videoId =
                    item.id?.videoId;

                if (!videoId) {
                    continue;
                }

                /*
                    منع التكرار داخل الطلب
                */
                if (collectedIds.has(videoId)) {
                    continue;
                }

                /*
                    التأكد أن الفيديو
                    غير موجود في MongoDB
                */
                const exists =
                    await Video.exists({
                        videoId
                    });

                if (exists) {
                    continue;
                }

                collectedIds.add(videoId);

                collectedVideos.push({

                    videoId,

                    title:
                        item.snippet?.title || "",

                    channelId:
                        item.snippet?.channelId || "",

                    description:
                        item.snippet?.description || "",

                    /*
                        هنا نضع القسم
                    */
                    category: category,

                    videoUrl:
                        `https://www.youtube.com/watch?v=${videoId}`,

                    thumbnailUrl:
                        item.snippet?.thumbnails?.high?.url ||
                        item.snippet?.thumbnails?.medium?.url ||
                        item.snippet?.thumbnails?.default?.url ||
                        "",

                    views: 0,

                    likes: 0
                });

                categoryCount++;

            }

            console.log(
                `✅ ${category}: ${categoryCount} videos`
            );
        }

        /*
            لا نحفظ أكثر من المطلوب
        */
        const videosToInsert =
            collectedVideos.slice(0, needed);

        console.log(
            `🎬 Total collected: ${videosToInsert.length}`
        );

        /*
            إضافة الفيديوهات إلى MongoDB
        */
        if (videosToInsert.length > 0) {

            await Video.insertMany(
                videosToInsert,
                {
                    ordered: false
                }
            );

            console.log(
                `✅ Added ${videosToInsert.length} videos`
            );
        }

        console.log(
            "🎉 YouTube import completed"
        );

    } catch (error) {

        console.error(
            "❌ YouTube import error:",
            error
        );
    }
}

module.exports =
    importYouTubeVideos;
