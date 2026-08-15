require("dotenv").config();

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const users = require("../models/users");

const auth_me = async (req, res) => {
    try {

        // 1. الحصول على التوكن من الـ Cookie
        const token = req.cookies.token;

        // لا يوجد توكن
        if (!token) {
            return res.status(401).json({
                authenticated: false,
                message: "Not authenticated"
            });
        }

        // 2. التحقق من التوكن
        let decoded;

        try {
            decoded = jwt.verify(
                token,
                process.env.JWT_PASSWORD
            );
        } catch (error) {
            return res.status(401).json({
                authenticated: false,
                message: "Invalid or expired token"
            });
        }

        // 3. التأكد أن الـ JWT يحتوي على ID بصيغة صحيحة
        //    (بيتحقق من الشكل قبل ما نضرب الداتابيز، عشان توكن متلاعب فيه
        //    أو ID مش صحيح الصيغة يرجع 401 بدل ما يعمل crash ويطلع 500)
        if (!decoded.id || !mongoose.Types.ObjectId.isValid(decoded.id)) {
            return res.status(401).json({
                authenticated: false,
                message: "Invalid token"
            });
        }

        // 4. البحث عن المستخدم في قاعدة البيانات (التحقق الفعلي من الوجود)
        const user = await users.findById(decoded.id).select(
            "_id name email"
        );

        // التوكن صحيح شكليًا لكن المستخدم غير موجود فعليًا في قاعدة البيانات
        // (ممكن يكون اتمسح الحساب بعد ما اتعمله توكن)
        if (!user) {
            return res.status(401).json({
                authenticated: false,
                message: "User not found"
            });
        }

        // 5. المستخدم موجود فعلاً في قاعدة البيانات والتوكن صحيح
        return res.status(200).json({
            authenticated: true,
            message: "User is authenticated",
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {

        console.log(error.message);

        return res.status(500).json({
            authenticated: false,
            message: "Internal server error"
        });
    }
};

module.exports = auth_me;