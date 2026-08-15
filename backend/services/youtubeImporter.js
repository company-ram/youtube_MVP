const Video = require("../models/videos");

const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";

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

function shuffle(array) {
    const arr = [...array];

    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr;
}

async function importYouTubeVideos() {

    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
        console.log("❌ YOUTUBE_API_KEY is missing");
        return;
    }

    // عدد الفيديوهات التي نريدها
    const TARGET = 200;

    // عدد الفيديوهات الموجودة حاليًا
    const currentCount = await Video.countDocuments();

    console.log(`📦 Videos in database: ${currentCount}`);

    // لو عندنا 200 أو أكثر، لا نفعل شيئًا
    if (currentCount >= TARGET) {
        console.log("✅ Database already has 200 videos");
        return;
    }

    // عدد الفيديوهات التي نحتاجها
    const needed = TARGET - currentCount;

    console.log(`🎬 Need ${needed} more videos`);

    const collectedVideos = [];
    const videoIds = new Set();

    const queries = shuffle(searchQueries);

    for (const query of queries) {

        if (collectedVideos.length >= needed) {
            break;
        }

        let pageToken = null;

        while (collectedVideos.length < needed) {

            const params = new URLSearchParams({
                part: "snippet",
                type: "video",
                maxResults: "50",
                q: query,
                key: apiKey
            });

            if (pageToken) {
                params.set("pageToken", pageToken);
            }

            const response = await fetch(
                `${YOUTUBE_API_URL}/search?${params}`
            );

            if (!response.ok) {

                const error = await response.text();

                console.log("❌ YouTube API Error:", error);

                return;
            }

            const data = await response.json();

            for (const item of data.items || []) {

                const videoId = item.id?.videoId;

                if (!videoId) {
                    continue;
                }

                // منع التكرار
                const alreadyExists = await Video.exists({
                    videoId
                });

                if (alreadyExists) {
                    continue;
                }

                if (videoIds.has(videoId)) {
                    continue;
                }

                videoIds.add(videoId);

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
                        "",

                    views: 0,

                    likes: 0
                });

                if (collectedVideos.length >= needed) {
                    break;
                }
            }

            pageToken = data.nextPageToken;

            if (!pageToken) {
                break;
            }
        }
    }

    console.log(
        `🎬 Collected ${collectedVideos.length} videos`
    );

    // حفظ الفيديوهات
    if (collectedVideos.length > 0) {

        await Video.insertMany(
            collectedVideos,
            {
                ordered: false
            }
        );

        console.log(
            `✅ Added ${collectedVideos.length} videos to MongoDB`
        );
    }
}

module.exports = importYouTubeVideos;