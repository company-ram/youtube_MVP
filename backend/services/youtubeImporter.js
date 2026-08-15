const Video = require("../models/videos");

const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";

/*
    الأصناف التي نريد جلب فيديوهات منها
*/
const categories = [
    "technology",
    "programming",
    "science",
    "education",
    "history",
    "documentary",
    "nature",
    "space",
    "cars",
    "motorcycles",
    "travel",
    "food",
    "cooking",
    "fitness",
    "sports",
    "football",
    "basketball",
    "gaming",
    "music",
    "movies",
    "comedy",
    "news",
    "business",
    "finance",
    "economics",
    "health",
    "animals",
    "photography",
    "art",
    "design",
    "fashion",
    "DIY",
    "reviews",
    "podcast",
    "vlogs",
    "adventure",
    "history documentary",
    "technology news",
    "AI artificial intelligence",
    "space documentary"
];


/*
    خلط النتائج
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
    جلب فيديوهات YouTube وحفظها في MongoDB
*/
async function importYouTubeVideos() {

    try {

        const apiKey = process.env.YOUTUBE_API_KEY;

        if (!apiKey) {

            console.log(
                "❌ YOUTUBE_API_KEY is missing"
            );

            return;
        }


        /*
            العدد النهائي المطلوب
        */
        const TARGET = 200;


        /*
            معرفة عدد الفيديوهات الموجودة
        */
        const currentCount =
            await Video.countDocuments();


        console.log(
            `📦 Videos currently in database: ${currentCount}`
        );


        /*
            إذا كان عندنا 200 فيديو أو أكثر
            لا نحتاج إلى إضافة شيء
        */
        if (currentCount >= TARGET) {

            console.log(
                "✅ Database already contains 200 videos"
            );

            return;
        }


        /*
            العدد الذي نحتاجه
        */
        const needed =
            TARGET - currentCount;


        console.log(
            `🎬 Need ${needed} more videos`
        );


        const collectedVideos = [];

        const collectedIds = new Set();


        /*
            خلط الأصناف
        */
        const shuffledCategories =
            shuffle(categories);


        /*
            نأخذ عددًا صغيرًا من كل صنف
            حتى تكون قاعدة البيانات متنوعة
        */
        const videosPerCategory =
            Math.ceil(needed / shuffledCategories.length);


        /*
            البحث في الأصناف
        */
        for (
            const category of shuffledCategories
        ) {

            if (
                collectedVideos.length >= needed
            ) {
                break;
            }


            console.log(
                `🔎 Searching category: ${category}`
            );


            const params =
                new URLSearchParams({

                    part: "snippet",

                    type: "video",

                    maxResults:
                        String(
                            Math.min(
                                videosPerCategory,
                                50
                            )
                        ),

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
                    "❌ YouTube API Error:",
                    error
                );

                continue;
            }


            const data =
                await response.json();


            /*
                معالجة النتائج
            */
            for (
                const item of data.items || []
            ) {

                const videoId =
                    item.id?.videoId;


                if (!videoId) {
                    continue;
                }


                /*
                    منع التكرار داخل الطلب الحالي
                */
                if (
                    collectedIds.has(videoId)
                ) {
                    continue;
                }


                /*
                    منع إضافة فيديو موجود مسبقًا
                    في MongoDB
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
                        item.snippet?.title ||
                        "",

                    channelId:
                        item.snippet?.channelId ||
                        "",

                    description:
                        item.snippet?.description ||
                        "",

                    category,

                    videoUrl:
                        `https://www.youtube.com/watch?v=${videoId}`,

                    thumbnailUrl:
                        item.snippet
                            ?.thumbnails
                            ?.high
                            ?.url ||

                        item.snippet
                            ?.thumbnails
                            ?.medium
                            ?.url ||

                        item.snippet
                            ?.thumbnails
                            ?.default
                            ?.url ||

                        "",

                    views: 0,

                    likes: 0
                });


                if (
                    collectedVideos.length >=
                    needed
                ) {
                    break;
                }
            }
        }


        /*
            خلط الفيديوهات
            حتى لا تكون مرتبة حسب الأصناف
        */
        const shuffledVideos =
            shuffle(collectedVideos);


        /*
            أخذ العدد المطلوب فقط
        */
        const videosToInsert =
            shuffledVideos.slice(
                0,
                needed
            );


        console.log(
            `🎬 Collected ${videosToInsert.length} videos`
        );


        /*
            حفظ الفيديوهات في MongoDB
        */
        if (
            videosToInsert.length > 0
        ) {

            await Video.insertMany(
                videosToInsert,
                {
                    ordered: false
                }
            );


            console.log(
                `✅ Added ${videosToInsert.length} videos to MongoDB`
            );
        }


        /*
            النتيجة في Logs فقط
            وليس Route أو صفحة
        */
        console.log(
            `📊 Database now has approximately ${
                currentCount +
                videosToInsert.length
            } videos`
        );


    } catch (error) {

        console.error(
            "❌ YouTube Import Error:",
            error
        );
    }
}


module.exports =
    importYouTubeVideos;
