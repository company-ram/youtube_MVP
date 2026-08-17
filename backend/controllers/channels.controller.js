require("dotenv").config()

const users = require("../models/users")

const channels = require("../models/channels")

const auth_me_controller = require("../middleware/auth_me.controller")

const jwt = require("jsonwebtoken")

const bcrypt = require("bcrypt")

const mongoose = require("mongoose");

const create_channel = async(req,res)=>{
    try{
        const channel_name = req.body.name?.trim();

        const description = req.body.description?.trim();

        if(!channel_name||!description){
            return res.status(400).json({
                success: false,
                message: "Name and description are required"
            })
        }
        const decoded = jwt.verify(
            req.cookies.token,
            process.env.JWT_PASSWORD,
        );
        
        const new_channel = new channels({
                name:channel_name,
                userId:decoded.id,
                description:description,
        })

        await new_channel.save()

        const token = jwt.sign({
                channel_name:channel_name,
                description:description,
                userId:new_channel.userId
            },process.env.JWT_PASSWORD
        )
        res.cookie("channel_token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 30 * 24 * 60 * 60 * 1000
        });

        return res.status(201).json({
            success: true,
            message: "Channel created successfully",
            channel: new_channel
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

module.exports = create_channel
