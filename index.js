import express, { json, urlencoded } from "express";
const app = express();
import { dbConnection } from "./db/Connect.js";
import { router } from "./Routes/AuthRoutes.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import adminRouter from "./Routes/AdminRoutes.js";
import { carRoute } from "./Routes/CarDataRoutes.js";
import bookingRoute from "./Routes/bookingRoutes.js";
import notificationRoute from "./Routes/NotificationRoutes.js";
import userRoute from "./Routes/userRoutes.js";
import paymentRoute from "./Routes/paymentRoutes.js";
import { migrateurl } from "./Util/migrateUrl.js";
dotenv.config();

app.use(json());
app.use(urlencoded({ extended: true }));
app.use('/public', express.static('/mnt/public'));
app.use(cookieParser());
app.use(cors({
    // origin: process.env.FRONTEND_URL,
    origin: (origin, callback) => {
      const allowedOrigins = [
          'https://tibarentacar.com',
          'https://www.tibarentacar.com',
          'https://api.tibarentacar.com',
          'https://app.tibarentacar.com',
          'http://localhost:5173'
      ];
      
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
          return callback(null, true);
      }
      
      return callback(new Error(`Not allowed by CORS for origin: ${origin}`), false);
  },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
}))

app.use("/api/auth", router);
app.use("/api/admin", adminRouter)
app.use("/api/cars", carRoute)
app.use("/api/booking", bookingRoute)
app.use("/api/payment", paymentRoute)
app.use("/api/notification", notificationRoute)
app.use("/api/user", userRoute)
 


app.get("/", (req, res) => {
  res.send("App running successfull!");
});




const port = process.env.PORT || 3000;
app.listen(port, () => {
  dbConnection();
  // migrateurl()
  console.log("Server running 🚀");
});

