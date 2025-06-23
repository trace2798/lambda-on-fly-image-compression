// import { Hono } from "hono";
// import { cors } from "hono/cors";
// import sharp from "sharp";

// const app = new Hono();
// app.use(cors());

// const routes = app
//   .get("/", (c) => c.text("Hello, Compress Route!"))
//   .post("/", async (c) => {
//     const { imageUrl } = await c.req.json();
//     console.log("Image compress url", imageUrl);
//     try {
//       const res = await fetch(imageUrl);
//       if (!res.ok) {
//         return c.text("Failed to fetch image", 400);
//       }
//       const arrayBuffer = await res.arrayBuffer();
//       const inputBuffer = Buffer.from(arrayBuffer);
//       console.log(`Original image size: ${inputBuffer.length} bytes`);

//       const outputBuffer = await sharp(inputBuffer)
//         .resize({ width: 800, withoutEnlargement: true })
//         .jpeg({ quality: 80 })
//         .toBuffer();
//       console.log(`Compressed image size: ${outputBuffer.length} bytes`);
//       return c.body(outputBuffer, 200, {
//         "Content-Type": "image/jpeg",
//         "Cache-Control": "public, max-age=31536000, immutable",
//       });
//     } catch (err) {
//       console.error("Compress error:", err);
//       return c.text("Internal Server Error", 500);
//     }
//   });

// export { routes as compressRoute };
// src/compress.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

const app = new Hono();
app.use(cors());

// Configure the AWS S3 client (make sure AWS creds + region are in env)
const s3 = new S3Client({});

app
  .get("/", (c) => c.text("Hello, Compress Route!"))
  .post("/", async (c) => {
    type Body = { key: string };
    const { key } = (await c.req.json()) as Body;
    if (!key) {
      return c.json({ error: "Missing key in request body" }, 400);
    }

    const bucket = process.env.UPLOAD_BUCKET!;
    const compressedKey = `compressed/${key}`;

    try {
      console.log("fetching image:", key);
      const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      console.log("fetched:", getCmd);
      const getRes = await s3.send(getCmd);
      console.log("getRes", getRes);
      if (!getRes.Body) {
        return c.json({ error: "Failed to download object" }, 500);
      }
      const inputBuffer = await getRes.Body.transformToByteArray();

      // 2) Compress with Sharp
      const outputBuffer = await sharp(Buffer.from(inputBuffer))
        .resize({ width: 800, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      // 3) Upload compressed back to S3
      const putCmd = new PutObjectCommand({
        Bucket: bucket,
        Key: compressedKey,
        Body: outputBuffer,
        ContentType: "image/jpeg",
        CacheControl: "max-age=31536000, immutable",
      });
      await s3.send(putCmd);

      // 4) Build the public URL (adjust if using a custom domain or signed URLs)
      // const publicUrl = `https://${bucket}.s3.amazonaws.com/${compressedKey}`;
      const publicUrl = `https://${bucket}.s3.${process.env.AWS_BUCKET_REGION}.amazonaws.com/${key}`;

      return c.json({ url: publicUrl }, 200);
    } catch (err) {
      console.error("Compress error:", err);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  });

export { app as compressRoute };
