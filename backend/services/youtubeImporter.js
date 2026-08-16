const Video = require("../models/videos");

const YOUTUBE_API_URL =
    "https://www.googleapis.com/youtube/v3";

/*
|--------------------------------------------------------------------------
| Settings
|--------------------------------------------------------------------------
*/

const TARGET_VIDEOS = 200;

/*
    عدد فيديوهات القرآن التي نريدها تقريبًا.

    30 من أصل 200 ستكون للقرآن.
*/
const QURAN_TARGET = 30;


/*
|--------------------------------------------------------------------------
| Arabic categories
|--------------------------------------------------------------------------
*/

const categories = [
    {
        name: "تكنولوجيا",
        searches: [
            "تكنولوجيا عربي",
            "تقنية عربية",
            "أخبار التكنولوجيا عربي"
        ]
    },

    {
        name: "برمجة",
        searches: [
            "برمجة عربي",
            "تعلم البرمجة بالعربي",
            "تطوير المواقع بالعربي"
        ]
    },

    {
        name: "ذكاء اصطناعي",
        searches: [
            "ذكاء اصطناعي عربي",
            "AI بالعربي",
            "الذكاء الاصطناعي شرح عربي"
        ]
    },

    {
        name: "علوم",
        searches: [
            "علوم بالعربي",
            "معلومات علمية بالعربي",
            "تجارب علمية بالعربي"
        ]
    },

    {
        name: "تعليم",
        searches: [
            "تعليم عربي",
            "شرح تعليمي بالعربي",
            "دروس بالعربي"
        ]
    },

    {
        name: "تاريخ",
        searches: [
            "تاريخ عربي",
            "قصص تاريخية بالعربي",
            "تاريخ العالم بالعربي"
        ]
    },

    {
        name: "وثائقي",
        searches: [
            "وثائقي عربي",
            "فيلم وثائقي عربي",
            "وثائقيات بالعربي"
        ]
    },

    {
        name: "طبيعة",
        searches: [
            "طبيعة بالعربي",
            "الحياة البرية بالعربي",
            "حيوانات وطبيعة عربي"
        ]
    },

    {
        name: "فضاء",
        searches: [
            "الفضاء بالعربي",
            "علوم الفضاء بالعربي",
            "ناسا بالعربي"
        ]
    },

    {
        name: "سيارات",
        searches: [
            "سيارات بالعربي",
            "مراجعة سيارات عربي",
            "أخبار السيارات عربي"
        ]
    },

    {
        name: "سفر",
        searches: [
            "سفر بالعربي",
            "سياحة بالعربي",
            "أماكن سياحية بالعربي"
        ]
    },

    {
        name: "طبخ",
        searches: [
            "طبخ عربي",
            "وصفات عربية",
            "وصفات سهلة بالعربي"
        ]
    },

    {
        name: "رياضة",
        searches: [
            "رياضة بالعربي",
            "أخبار الرياضة عربي",
            "تحليل رياضي عربي"
        ]
    },

    {
        name: "كرة القدم",
        searches: [
            "كرة القدم بالعربي",
            "أخبار كرة القدم عربي",
            "تحليل مباريات عربي"
        ]
    },

    {
        name: "ألعاب",
        searches: [
            "ألعاب بالعربي",
            "جيمينج عربي",
            "ألعاب فيديو بالعربي"
        ]
    },

    {
        name: "موسيقى",
        searches: [
            "موسيقى عربية",
            "أغاني عربية",
            "موسيقى عربي"
        ]
    },

    {
        name: "كوميديا",
        searches: [
            "كوميديا عربية",
            "مقاطع مضحكة عربي",
            "ضحك عربي"
        ]
    },

    {
        name: "أخبار",
        searches: [
            "أخبار عربية",
            "أخبار مصر",
            "أخبار العالم بالعربي"
        ]
    },

    {
        name: "اقتصاد",
        searches: [
            "اقتصاد بالعربي",
            "اقتصاد مصر",
            "اقتصاد عربي"
        ]
    },

    {
        name: "أعمال",
        searches: [
            "ريادة الأعمال بالعربي",
            "مشاريع وأعمال بالعربي",
            "بيزنس بالعربي"
        ]
    },

    {
        name: "تصميم",
        searches: [
            "تصميم بالعربي",
            "جرافيك ديزاين عربي",
            "تعلم التصميم بالعربي"
        ]
    },

    {
        name: "تصوير",
        searches: [
            "تصوير فوتوغرافي بالعربي",
            "تعلم التصوير بالعربي",
            "تصوير احترافي عربي"
        ]
    },

    {
        name: "فن",
        searches: [
            "فن عربي",
            "رسم بالعربي",
            "تعلم الرسم بالعربي"
        ]
    },

    {
        name: "تطوير الذات",
        searches: [
            "تطوير الذات بالعربي",
            "تحفيز عربي",
            "تنمية بشرية بالعربي"
        ]
    },

    {
        name: "بودكاست",
        searches: [
            "بودكاست عربي",
            "بودكاست مصري",
            "بودكاست بالعربي"
        ]
    },

    {
        name: "مراجعات",
        searches: [
            "مراجعات منتجات بالعربي",
            "ريفيو عربي",
            "مراجعة منتجات عربي"
        ]
    },

    {
        name: "قصص",
        searches: [
            "قصص عربية",
            "قصص حقيقية بالعربي",
            "قصص وحكايات عربية"
        ]
    },

    {
        name: "معلومات عامة",
        searches: [
            "معلومات عامة بالعربي",
            "هل تعلم بالعربي",
            "حقائق بالعربي"
        ]
    }
];


/*
|--------------------------------------------------------------------------
| Quran category
|--------------------------------------------------------------------------
*/

const quranCategory = {
    name: "القرآن الكريم",

    searches: [
        "القرآن الكريم",
        "تلاوة القرآن الكريم",
        "قرآن كريم",
        "سور القرآن الكريم",
        "تلاوات القرآن",
        "حفظ القرآن الكريم",
        "تفسير القرآن الكريم"
    ]
};


/*
|--------------------------------------------------------------------------
| Shuffle
|--------------------------------------------------------------------------
*/

function shuffle(array) {

    const arr = [...array];

    for (
        let i = arr.length - 1;
        i > 0;
        i--
    ) {

        const j =
            Math.floor(
                Math.random() * (i + 1)
            );

        [
            arr[i],
            arr[j]
        ] = [
            arr[j],
            arr[i]
        ];
    }

    return arr;
}


/*
|--------------------------------------------------------------------------
| Check if text contains Arabic characters
|--------------------------------------------------------------------------
*/

function containsArabic(text) {

    if (!text) {
        return false;
    }

    return /[\u0600-\u06FF]/.test(text);
}


/*
|--------------------------------------------------------------------------
| Check if video looks Arabic
|--------------------------------------------------------------------------
*/

function looksArabic(item) {

    const title =
        item.snippet?.title || "";

    const description =
        item.snippet?.description || "";

    const combined =
        `${title} ${description}`;

    return containsArabic(combined);
}


/*
|--------------------------------------------------------------------------
| Check if video already exists
|--------------------------------------------------------------------------
*/

async function videoExists(videoId) {

    const exists =
        await Video.exists({
            videoId
        });

    return !!exists;
}


/*
|--------------------------------------------------------------------------
| Search YouTube
|--------------------------------------------------------------------------
*/

async function searchYouTube(
    searchQuery,
    limit
) {

    const apiKey =
        process.env.YOUTUBE_API_KEY;


    const params =
        new URLSearchParams({

            part: "snippet",

            type: "video",

            maxResults:
                String(
                    Math.min(limit, 50)
                ),

            q: searchQuery,

            /*
                اللغة العربية
            */
            hl: "ar",

            /*
                مصر
            */
            regionCode: "EG",

            key: apiKey
        });


    const response =
        await fetch(
            `${YOUTUBE_API_URL}/search?${params}`
        );


    if (!response.ok) {

        const error =
            await response.text();

        throw new Error(
            `YouTube API error: ${error}`
        );
    }


    const data =
        await response.json();


    return data.items || [];
}


/*
|--------------------------------------------------------------------------
| Import videos
|--------------------------------------------------------------------------
*/

async function importYouTubeVideos() {

    try {

        /*
        ------------------------------------------------------------------
        | API KEY
        ------------------------------------------------------------------
        */

        const apiKey =
            process.env.YOUTUBE_API_KEY;


        if (!apiKey) {

            console.log(
                "❌ YOUTUBE_API_KEY is missing"
            );

            return;
        }


        /*
        ------------------------------------------------------------------
        | Current database count
        ------------------------------------------------------------------
        */

        const currentCount =
            await Video.countDocuments();


        console.log(
            `📦 Videos currently in database: ${currentCount}`
        );


        /*
        ------------------------------------------------------------------
        | Already enough videos
        ------------------------------------------------------------------
        */

        if (
            currentCount >=
            TARGET_VIDEOS
        ) {

            console.log(
                `✅ Database already has ${TARGET_VIDEOS} videos`
            );

            return;
        }


        /*
        ------------------------------------------------------------------
        | How many videos do we need?
        ------------------------------------------------------------------
        */

        const needed =
            TARGET_VIDEOS -
            currentCount;


        console.log(
            `🎬 Need ${needed} more videos`
        );


        /*
        ------------------------------------------------------------------
        | Storage
        ------------------------------------------------------------------
        */

        const collectedVideos = [];

        const collectedIds =
            new Set();


        /*
        ------------------------------------------------------------------
        | First: Quran
        |
        | We try to collect approximately 30 Quran videos.
        ------------------------------------------------------------------
        */

        const quranNeeded =
            Math.min(
                QURAN_TARGET,
                needed
            );


        console.log(
            `📖 Quran target: ${quranNeeded}`
        );


        if (
            quranNeeded > 0
        ) {

            const quranSearches =
                shuffle(
                    quranCategory.searches
                );


            for (
                const searchQuery
                of quranSearches
            ) {

                if (
                    collectedVideos.length >=
                    quranNeeded
                ) {
                    break;
                }


                console.log(
                    `🔎 Quran search: ${searchQuery}`
                );


                try {

                    const items =
                        await searchYouTube(
                            searchQuery,
                            50
                        );


                    for (
                        const item
                        of items
                    ) {

                        if (
                            collectedVideos.length >=
                            quranNeeded
                        ) {
                            break;
                        }


                        const videoId =
                            item.id?.videoId;


                        if (!videoId) {
                            continue;
                        }


                        if (
                            collectedIds.has(
                                videoId
                            )
                        ) {
                            continue;
                        }


                        /*
                            التأكد أن النتيجة
                            تحتوي على العربية
                        */
                        if (
                            !looksArabic(item)
                        ) {
                            continue;
                        }


                        if (
                            await videoExists(
                                videoId
                            )
                        ) {
                            continue;
                        }


                        collectedIds.add(
                            videoId
                        );


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

                            category:
                                quranCategory.name,

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
                    }


                } catch (error) {

                    console.log(
                        `⚠️ Quran search failed: ${searchQuery}`,
                        error.message
                    );
                }
            }
        }


        /*
        ------------------------------------------------------------------
        | Remaining videos
        ------------------------------------------------------------------
        */

        const remaining =
            needed -
            collectedVideos.length;


        console.log(
            `🎬 Remaining normal videos: ${remaining}`
        );


        if (
            remaining > 0
        ) {

            /*
                خلط الأقسام
            */
            const shuffledCategories =
                shuffle(categories);


            /*
                نحاول توزيع الفيديوهات
                بالتساوي تقريبًا
            */
            const videosPerCategory =
                Math.max(
                    1,
                    Math.ceil(
                        remaining /
                        shuffledCategories.length
                    )
                );


            for (
                const category
                of shuffledCategories
            ) {

                if (
                    collectedVideos.length >=
                    needed
                ) {
                    break;
                }


                console.log(
                    `🔎 Category: ${category.name}`
                );


                /*
                    اختيار بحث عشوائي
                    من هذا القسم
                */
                const searchQuery =
                    category
                        .searches[
                            Math.floor(
                                Math.random() *
                                category.searches.length
                            )
                        ];


                try {

                    const items =
                        await searchYouTube(
                            searchQuery,
                            50
                        );


                    let categoryCount = 0;


                    for (
                        const item
                        of items
                    ) {

                        if (
                            collectedVideos.length >=
                            needed
                        ) {
                            break;
                        }


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
                            منع التكرار
                        */
                        if (
                            collectedIds.has(
                                videoId
                            )
                        ) {
                            continue;
                        }


                        /*
                            التأكد من وجود
                            نص عربي في النتيجة
                        */
                        if (
                            !looksArabic(item)
                        ) {
                            continue;
                        }


                        /*
                            التأكد من MongoDB
                        */
                        if (
                            await videoExists(
                                videoId
                            )
                        ) {
                            continue;
                        }


                        collectedIds.add(
                            videoId
                        );


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

                            category:
                                category.name,

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


                        categoryCount++;
                    }


                    console.log(
                        `✅ ${category.name}: ${categoryCount} videos`
                    );


                } catch (error) {

                    console.log(
                        `⚠️ Failed category: ${category.name}`,
                        error.message
                    );
                }
            }
        }


        /*
        ------------------------------------------------------------------
        | If we did not reach 200
        |
        | Try again with other Arabic searches.
        ------------------------------------------------------------------
        */

        if (
            collectedVideos.length <
            needed
        ) {

            console.log(
                "🔄 Trying additional Arabic searches..."
            );


            const extraSearches = shuffle([

                "فيديوهات عربية",

                "محتوى عربي",

                "قناة عربية",

                "شرح بالعربي",

                "معلومات بالعربي",

                "أفضل فيديوهات عربية",

                "محتوى عربي مفيد",

                "فيديو عربي",

                "محتوى عربي جديد",

                "تعلم بالعربي"
            ]);


            for (
                const searchQuery
                of extraSearches
            ) {

                if (
                    collectedVideos.length >=
                    needed
                ) {
                    break;
                }


                console.log(
                    `🔎 Extra search: ${searchQuery}`
                );


                try {

                    const items =
                        await searchYouTube(
                            searchQuery,
                            50
                        );


                    for (
                        const item
                        of items
                    ) {

                        if (
                            collectedVideos.length >=
                            needed
                        ) {
                            break;
                        }


                        const videoId =
                            item.id?.videoId;


                        if (!videoId) {
                            continue;
                        }


                        if (
                            collectedIds.has(
                                videoId
                            )
                        ) {
                            continue;
                        }


                        if (
                            !looksArabic(item)
                        ) {
                            continue;
                        }


                        if (
                            await videoExists(
                                videoId
                            )
                        ) {
                            continue;
                        }


                        collectedIds.add(
                            videoId
                        );


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

                            category:
                                "محتوى عربي",

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
                    }


                } catch (error) {

                    console.log(
                        `⚠️ Extra search failed: ${searchQuery}`,
                        error.message
                    );
                }
            }
        }


        /*
        ------------------------------------------------------------------
        | Final list
        ------------------------------------------------------------------
        */

        const videosToInsert =
            shuffle(
                collectedVideos
            ).slice(
                0,
                needed
            );


        console.log(
            `🎬 Final videos collected: ${videosToInsert.length}`
        );


        /*
        ------------------------------------------------------------------
        | Save to MongoDB
        ------------------------------------------------------------------
        */

        if (
            videosToInsert.length > 0
        ) {

            try {

                await Video.insertMany(
                    videosToInsert,
                    {
                        ordered: false
                    }
                );


                console.log(
                    `✅ Added ${videosToInsert.length} videos to MongoDB`
                );


            } catch (error) {

                console.error(
                    "❌ MongoDB insert error:",
                    error.message
                );
            }
        }


        /*
        ------------------------------------------------------------------
        | Category statistics
        ------------------------------------------------------------------
        */

        const categoryStats = {};


        for (
            const video
            of videosToInsert
        ) {

            categoryStats[
                video.category
            ] =
                (
                    categoryStats[
                        video.category
                    ] || 0
                ) + 1;
        }


        console.log(
            "📊 Imported categories:"
        );


        console.log(
            categoryStats
        );


        console.log(
            "🎉 YouTube import completed"
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