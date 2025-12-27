// import multer from "multer";
// import fs from "fs";

// // Configure storage
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     const uploadDir = "/mnt/public"; // Railway Volume mount path
//     if (!fs.existsSync(uploadDir)) {
//       fs.mkdirSync(uploadDir, { recursive: true }); // Create the directory if it doesn't exist
//     }
//     cb(null, uploadDir);
//   },
//   filename: (req, file, cb) => {
//     cb(null, `${Date.now()}_${file.originalname}`);
//   },
// });

// const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
// // const upload = multer({ storage: multer.memoryStorage() });

// export { upload };

import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export { upload };