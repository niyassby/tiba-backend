import axios from "axios";
import { BUCKET, REGION, s3 } from "../Controller/CarController.js";
import { Cars } from "../db/Model.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

async function uploadImagesFromUrls(urls = []) {
    const results = [];
  
    for (const url of urls) {
      try {
        // 1️⃣ download as buffer
        const exatUrl = `https://api.tibarentacar.com${url}`
        const response = await axios.get(exatUrl, { responseType: "arraybuffer" });
  
        if(!response?.data){
            console.log(exatUrl);
          continue;
        }
        // 2️⃣ create unique key
        const ext = url.split(".").pop().split("?")[0];
        const key = `cars/${crypto.randomUUID()}.${ext}`;
  
        // 3️⃣ upload to S3
        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: Buffer.from(response.data),
            ContentType: response.headers["content-type"] || "image/jpeg",
          })
        );
  
        // 4️⃣ permanent URL
        const s3Url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
  
        results.push(s3Url);
      } catch (err) {
        console.error("Failed for:", url, err?.message);
      }
    }
  
    return results;
  }


  export const migrateurl = async ()=>{
    const cars = await Cars.find({images: { $gt: [] } });
    console.log('start');
    for(const car of cars){
      const urls = car.images;
      try{
        const images = await uploadImagesFromUrls(urls);
        if(images.length > 0){
            await Cars.findByIdAndUpdate(car._id, {images: images})
        }else{
            console.log("not file available");
        }
      }catch(err){
        console.log(err);
      }
    }
    console.log('end');
  }