import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.MONGODB_URI;
const name = process.env.DB_NAME;
const dev = process.env.NODE_ENV === "development";
const connectUrl = dev ? "mongodb://localhost:27017/myapp" : url;
export const dbConnection = async () => {
    try{
        await mongoose.connect(url)
            .then(() => console.log("Connected to DB ✨"))
            .catch((err) => console.log(err));
    }catch(err){
        console.log(err);
    }
} 