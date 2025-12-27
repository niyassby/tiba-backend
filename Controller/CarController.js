import { Cars, User } from "../db/Model.js";
import crypto from "crypto";

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

export const BUCKET = process.env.AWS_BUCKET_NAME;
export const REGION =process.env.AWS_REGION

export const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
// add cars
const addCars = async (req, res) => {
  const files = req.files;
  const {
    make, model, year, color, mileage, transmission, fuel_type,
    seats, daily_rate, category, available, showroomId, userId,
    monthly_rate, weekly_rate, type, addOnCharge,features
  } = req.body;
// return console.log(req.body); 
  try {
    if (
      !make ||
      !model ||
      !year ||
      !transmission ||
      !fuel_type ||
      !daily_rate ||
      !monthly_rate ||
      !weekly_rate
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Please fill all fields" });
    }

    let images = [];

    if(files){
      const uploads = await Promise.all(
        files?.map(async (file) => {
          const key = `uploads/${crypto.randomUUID()}-${file.originalname}`;
  
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
          const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
          images.push(url);
          return { key, url };
        })
      );
    }

    
    const newCar = new Cars({
      make,
      model,
      year,
      color,
      mileage,
      transmission,
      fuel_type,
      seats,
      daily_rate,
      monthly_rate,
      weekly_rate,
      showroomId,
      images,
      available,
      category,
      type,
      addOnCharge,
      features,
      admin_id: userId,
    }); 
    await newCar.save();
    res
      .status(201)
      .json({ success: true, message: "Car added successfully", newCar });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Internal server error", err });
  }
};

const editCar = async (req, res) => {
  const { _id, make, model, year, color, mileage,
    transmission, fuel_type, seats, daily_rate,
    monthly_rate, weekly_rate, category, images,type,addOnCharge,features,
    available, deleteImages } = req.body;
    const {files}= req;
  try {
    
    if ( !make || !model ||
      !year || !transmission ||
      !fuel_type || !daily_rate ||
      !monthly_rate || !weekly_rate ) {

      return res
        .status(400)
        .json({ success: false, message: "Please fill all fields" }); }

        // --------------------------
    // 1️⃣ DELETE IMAGES FROM S3
    // --------------------------
    if (deleteImages && deleteImages.length > 0) {
      const toDelete = Array.isArray(deleteImages) ? deleteImages : [deleteImages];

      await Promise.all(
        toDelete.map(async (url) => {
          // extract key from URL
          const key = url.split(".amazonaws.com/")[1];

          if (!key) return;

          await s3.send(
            new DeleteObjectCommand({
              Bucket: BUCKET,
              Key: key,
            })
          );
        })
      );
    }

    // --------------------------
    // 2️⃣ UPLOAD NEW FILES TO S3
    // --------------------------
    let newImages = [];

    if (files && files.length > 0) {
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const key = `uploads/${crypto.randomUUID()}-${file.originalname}`;

          await s3.send(
            new PutObjectCommand({
              Bucket: BUCKET,
              Key: key,
              Body: file.buffer,
              ContentType: file.mimetype,
            })
          );

          // permanent public URL (bucket policy required)
          const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
          return url;
        })
      );

      if (images) {
        newImages = Array.isArray(images) ? [...images, ...uploaded] : [images, ...uploaded];
      } else {
        newImages = uploaded;
      }
    } else if (images) {
      newImages = Array.isArray(images) ? images : [images];
    }


        const filtedFeat = features ? features.filter(feature => feature !== "") : []
    // const newImages = [...images, ...imagesLink];
    const newObj = {
      make,
      model,
      year,
      color,
      mileage,
      transmission,
      fuel_type,
      seats,
      daily_rate,
      monthly_rate,
      weekly_rate,
      images: newImages,
      available,
      category,
      type,
      addOnCharge,
      features: filtedFeat
    };

    const newCar = await Cars.findByIdAndUpdate(_id, newObj, { new: true });
    if (!newCar) {
      return res.status(404).json({ success: false, message: "Car not found" });
    }
    res
      .status(201)
      .json({ success: true, message: "Car data edited successfully", newCar });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Internal server error", err });
  }
};

const allCars = async (req, res) => {
  const { userId } = req.body;

  const page = req.query.page || 1;
  const limit = req.query.limit || 10;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    let bookingFilter = {};

    if (user.role === "subadmin") {
      if (!user.showroomId) {
        return res.status(400).json({ success: false, message: "Showroom ID not assigned to subadmin" });
      }
      bookingFilter = { showroomId: user.showroomId }; // Filter bookings by showroomId
    } else if (user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const cars = await Cars.find(bookingFilter)
      .populate({
          path: 'showroomId',
          model: 'showroom',
          select: 'name email'
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit);
    const totalCars = await Cars.countDocuments();
    const totalPages = Math.ceil(totalCars / limit);
    if (page > totalPages) {
      return res
        .status(404)
        .json({ success: false, message: "Page not found" });
    }

    if (!cars) {
      return res
        .status(404)
        .json({ success: false, message: "No cars found" });
    }
    return res
      .status(200)
      .json({
        success: true,
        data: cars,
        totalPages,
        currentPage: page,
        totalCars,
      });
    
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const allCarsUser = async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 10;
  try {
    const cars = await Cars.find()
      .sort({ available: -1 })
      .sort({ make: 1 })
      .populate({
          path: 'showroomId',
          model: 'showroom',
      })
      .limit(limit)
      .skip((page - 1) * limit);
    const totalCars = await Cars.countDocuments();
    const totalPages = Math.ceil(totalCars / limit);

    if (page > totalPages) {
      return res
        .status(404)
        .json({ success: false, message: "Page not found" });
    }
    if (!cars) {
      return res.status(404).json({ success: false, message: "No cars found" });
    }
    return res
      .status(200)
      .json({
        success: true,
        data: cars,
        totalPages,
        currentPage: page,
        totalCars,
      });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const oneCar = async (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide car id" });
  }
  try {
    const car = await Cars.findById(id)
        .populate({
          path: 'showroomId',
          model: 'showroom',
          // select: 'name email'
        })
    if (!car) {
      return res.status(404).json({ success: false, message: "Car not found" });
    }
    return res
      .status(200)
      .json({ success: true, message: "Car found", data: car });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Internal server error", err });
  }
};

const deleteCar = async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide car id" });
  }
  try {
    const car = await Cars.findByIdAndDelete(id);
    if (!car) {
      return res.status(404).json({ success: false, message: "Car not found" });
    }
    return res
      .status(200)
      .json({ success: true, message: "Car deleted successfully" });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Internal server error", err });
  }
};

const changeStatus = async (req, res) => {
  const { id, status } = req.body;

  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide car id" });
  }
  try {
    const car = await Cars.findByIdAndUpdate(id, { available: !status });
    if (!car) {
      return res.status(404).json({ success: false, message: "Car not found" });
    }
    return res.status(200).json({ success: true, message: "Car status changed" });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Internal server error", err });
  }
}


export { addCars, allCars, deleteCar, oneCar, allCarsUser, editCar, changeStatus };
