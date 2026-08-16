require("dotenv").config()

const users = require("../models/users")

const jwt = require("jsonwebtoken")

const bcrypt = require("bcrypt")

const mongoose = require("mongoose");

const log_in = async(req,res)=>{
    try{
            const email = req.body.email?.trim().toLowerCase();

            const password = req.body.password;

            if (!email || !password || password.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: "email are required"
                })
            }

            const find_log_in_user = await users.findOne({
                email: email,
            });

            if (!find_log_in_user) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid email or password"
                });
            }

            const passwordMatch = await bcrypt.compare(
                password,
                find_log_in_user.password
            );

            if (!passwordMatch) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid email or password"
                });
            }
            if(find_log_in_user && passwordMatch){
                const token = jwt.sign({
                    id:find_log_in_user._id
                },process.env.JWT_PASSWORD)
                
                res.cookie("token", token, {
                    httpOnly: true,
                    secure: true,
                    sameSite: "none",
                    maxAge: 30 * 24 * 60 * 60 * 1000
                });

                return res.status(200).json({
                    success:true,
                    message:"Log in successful"
                })
            }
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

module.exports = log_in
