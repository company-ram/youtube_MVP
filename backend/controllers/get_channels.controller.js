require("dotenv").config()

const users = require("../models/users")

const videos = require("../models/videos")

const channels = require("../models/channels")

const auth_me_controller = require("../middleware/auth_me.controller")

const jwt = require("jsonwebtoken")

const bcrypt = require("bcrypt")

const mongoose = require("mongoose");

const get_your_channels = async(req,res)=>{
    try{
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

        return res.status(200).json({
            success: true,
            message: "Channel get successfully",
            channel: channel
        });
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

module.exports = get_your_channels