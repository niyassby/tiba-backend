import { User } from "../db/Model.js";
import bcript from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendMail, transporter } from "../Util/SendMail.js";
import dotenv from "dotenv";
import { notification } from "./NotifictionController.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { BUCKET, REGION, s3 } from "./CarController.js";
dotenv.config();

// login controller
const login = async (req, res) => {
  if (!req.body.email || !req.body.password) {
    res
      .status(400)
      .json({ success: false, message: "Please provide all fields" });
    return;
  }
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const isMatch = await bcript.compare(req.body.password, user.password);
    if (!isMatch)
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "10d",
    });

    try {
      
      res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite:"None", //process.env.NODE_ENV === "production" ? "lax" : "none",
        maxAge: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 10 days, // 10 days
      });
    }catch (err) {
      console.log(err);
      return res
        .status(500)
        .json({ success: false, message: "Error to set cookie" });
    }
    res
      .status(200)
      .json({
        success: true,
        message: "User logged in successfully",
        data: user,
      });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error to find user" });
  }
};

// create user controller
const createUser = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide all fields" });
  }

  // Create new user
  try {
    const user = await User.findOne({ email: email });
    if (user) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    const encryptedPassword = await bcript.hash(password, 10);
    if (!encryptedPassword) return res.status(400).json({ success: false, message: "Error to encript password" });

    // const otp = String(Math.floor(100000 + Math.random() * 900000));
    // const codeExpires = Date.now() + 5 * 60 * 1000; // 10 minutes
    const newUser = new User({ name, email, password: encryptedPassword });
    await newUser.save();
    await notification("newUser", true, 'New User Joined', `${name} has joined the platform`)

    if(!newUser) return res.status(400).json({ success: false, message: "Error to create user" })
    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: "10d",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite:"None", //process.env.NODE_ENV === "production" ? "lax" : "none",
      maxAge: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 10 days, // 10 days
    }); 
    
    const userObject = newUser.toObject(); 

    // Exclude the sensitive fields
    const { verificationCode, codeExpires, ...userData } = userObject;
    delete userData.password;
    
    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: userData,
    });
    // const mailOptions = {
    //   from: process.env.SEND_MAIL,
    //   to: email,
    //   subject: 'Welcome to our website',
    //   // text: `Welcome to our website ${name} your otp is ${otp}`,
    //   html: `<h4>Welcome to our website ${name}</h4><br><h3>Your otp is ${otp}</h3>`,    }
    // sendMail(mailOptions)
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ success: false, message: "Error creating user" });
  }
};

// logout controller
const logOut = async (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite:"None", // process.env.NODE_ENV === "production" ? "none" : "strict",
    });
    res.status(200).json({ success: true, message: "User logged out" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error to log out" });
  }
};

// verify user controller
const verifyUser = async (req, res) => {
  const { userId, otp } = req.body;
  if (!otp) {
    return res.status(400).json({ success: false, message: "Please provide all fields" });
  }else if (!userId) {
    return res.status(400).json({ success: false, message: "User not authenticated" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if(user.isVerified){
      return res.status(400).json({ success: false, message: "User already verified" });
    }
    if(user.codeExpires < Date.now()){
      user.verificationCode = '';
      user.codeExpires = 0;
      await user.save();
      return res.status(400).json({ success: false, message: "OTP expired" });
    }
    if (user.verificationCode === otp && user.codeExpires > Date.now()) {
      user.isVerified = true;
      user.verificationCode = '';
      user.codeExpires = 0;
      await user.save();
      return res.status(200).json({ success: true, message: "User verified successfully" });
    }else{
      return res.status(400).json({ success: false, message: "Invalid otp" });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: "Error to verify user" });
  }

}

// is Outh
const isOuth = async (req, res) => {
  if(!req.cookies.token){
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }
  try {
    const user = await User.findById(req.body.userId);
    const {password, ...other} = user._doc;
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.status(200).json({ success: true, message: "User authenticated" , data: other });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Error to authenticate user" });
  }
}

// fotgotpassword
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: "Please provide a email" });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const otp = Math.floor(100000 + Math.random() * 900000);
    user.verificationCode = otp;
    user.codeExpires = Date.now() + 3600000; // 1 hour
    await user.save();
    const mailOptions = {
      from: process.env.SEND_MAIL,
      to: email,
      subject: 'Reset Password',
      html: `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <h2 style="color: #4A90E2;">Password Reset Request</h2>
          <p>Your OTP is:</p>
          <p style="font-size: 24px; font-weight: bold; color: #D35400;">${otp}</p>
          <p>Please enter this code to reset your password.</p>
          <p>If you did not request this, please ignore this email.</p>
          <hr style="border: 1px solid #ddd;">
          <p style="font-size: 12px; color: #777;">This is an automated message, please do not reply.</p>
        </div>
      `
    };
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        return res.status(500).json({ success: false, message: "Error to send email" });
      }
      return res.status(200).json({ success: true, message: "Email sent successfully" });
    })
  }catch (err) {
    return res.status(500).json({ success: false, message: "Error to forgot password" });
  }
}

const verityOTP = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ success: false, message: "Please provide a email and otp" });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (user.verificationCode !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
    if (user.codeExpires < Date.now()) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }
    user.verificationCode = '';
    user.codeExpires = null;
    await user.save();
    return res.status(200).json({ success: true, message: "OTP verified successfully" });
  }catch (err) {
    return res.status(500).json({ success: false, message: "Error to verify OTP" });
  }
}

const changePassword = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Please provide a password" });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const encryptedPassword = await bcript.hash(password, 10);
    if (!encryptedPassword) return res.status(400).json({ success: false, message: "Error to encript password" });
    
    user.password = encryptedPassword;
    await user.save();
    return res.status(200).json({ success: true, message: "Password changed successfully" });
  }catch (err) {
    return res.status(500).json({ success: false, message: "Error to change password" });
  }
}

const editProfile = async (req, res) => {
  const { email, name, currentPassword, newPassword } = req.body;
  const file = req.file

  
  if (!email ) {
    return res.status(400).json({ success: false, message: "Please provide a email" });
  }

  try { 
    const user = await User.findOne({ email }); 

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if(currentPassword && newPassword){
      const isMatch = await bcript.compare(currentPassword, user.password);
      if(!isMatch) return res.status(400).json({ success: false, message: "Current password is incorrect" });
      const encryptedPassword = await bcript.hash(newPassword, 10);
      if (!encryptedPassword) return res.status(400).json({ success: false, message: "Error to encript password" });
      user.password = encryptedPassword;
    }

    if(file){
      // user.profileImg = `/public/${file.filename}`;
      const key = `uploads/${Date.now()}-${file.originalname}`;
  
          await s3.send(
            new PutObjectCommand({
              Bucket: BUCKET,
              Key: key,
              Body: file.buffer,
              ContentType: file.mimetype,
              // ACL: "public-read",             // 👈 makes URL permanent (optional)
            })
          );
  
          // permanent public URL
         user.profileImg = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
    }

    user.name = name;
    await user.save();
    return res.status(200).json({ success: true, message: "Profile updated successfully" });

  }catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Error to update profile" });
  }
}

export { login, createUser, logOut, verifyUser, isOuth, forgotPassword, verityOTP, changePassword, editProfile};
