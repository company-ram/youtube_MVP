require("dotenv").config()

const users = require("../models/users")

const jwt = require("jsonwebtoken")

const bcrypt = require("bcrypt")

const mongoose = require("mongoose");



const register = async(req,res)=>{
    try{
            const user_name = req.body.name?.trim();

            const email = req.body.email?.trim().toLowerCase();

            const password = req.body.password;

            if (!user_name || !email || !password || password.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: "Name, email are required and password must be at least 8 characters"
                })
            }
            const find_user = await users.findOne({
                email:email,
            })

            if(find_user){
                return res.status(400).json({
                    success:false,
                    message:"This email address is already in use."
                })
            }

            const passwordHash =  await bcrypt.hash(password,12); //Password encryption

            const new_user = new users({
                name:user_name,
                email:email,
                password:passwordHash,
            })

            await new_user.save()

            const token = jwt.sign({
                id:new_user._id
            },process.env.JWT_PASSWORD)

            res.cookie("token", token, {
                httpOnly: true,
                secure: true,
                sameSite: "none",
                maxAge: 30 * 24 * 60 * 60 * 1000
            });

            return res.status(201).json({
                success:true,
                message:"Registration successful"
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

module.exports = register
