require("dotenv").config()

const users = require("../models/users")

const videos = require("../models/videos")

const channels = require("../models/channels")

const auth_me_controller = require("../middleware/auth_me.controller")

const jwt = require("jsonwebtoken")

const bcrypt = require("bcrypt")

const mongoose = require("mongoose");

const create_videos = async(req,res)=>{
    try{
        const title = req.body.title?.trim();

        const description = req.body.description?.trim();

        const category = req.body.category?.trim();

        const videoUrl = req.body.videoUrl?.trim();

        const thumbnailUrl = req.body.thumbnailUrl?.trim();

        if(!title||!description||!category||!videoUrl||!thumbnailUrl){
            return res.status(400).json({
                success: false,
                message: "title , category ,videoUrl ,thumbnailUrl and description are required"
            })
        }
        if (!req.cookies.channel_token) {
            return res.status(401).json({
                success: false,
                message: "Channel token is required"
            });
        }
        let decoded;

        try {
            decoded = jwt.verify(
                req.cookies.channel_token,
                process.env.JWT_PASSWORD
            );
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired channel token"
            });
        }
        if (!decoded.userId) {
            return res.status(401).json({
                success: false,
                message: "Invalid channel token"
            });
        }
        console.log("decoded:", decoded);
        console.log("userId:", decoded.userId);

        const channel = await channels.findOne({
            userId: decoded.userId
        });

        console.log("channel:", channel);

        if (!channel) {
            return res.status(404).json({
                success: false,
                message: "Channel not found"
            });
        }
        const new_video = new videos({
            title:title,
            channelId:decoded.userId,
            description:description,
            category:category,
            videoUrl:videoUrl,
            thumbnailUrl:thumbnailUrl,
            views:0,
            likes:0,
        })

        await new_video.save()

        return res.status(201).json({
            success: true,
            message: "Video created successfully",
            video: new_video
        })
    }
    catch(e){
            console.log(e.message)
            return res.status(500).json({
                success:false,
                message:"Internal server error",
                error:e.message
            })
    }
}

module.exports = create_videos