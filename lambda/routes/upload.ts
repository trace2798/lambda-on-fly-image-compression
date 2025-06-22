import { Hono } from "hono";
import { cors } from "hono/cors";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import "dotenv/config";

const app = new Hono();
// app.use(cors());

app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept"],
  })
);

const s3 = new S3Client({ region: process.env.AWS_BUCKET_REGION });
const bucket = process.env.UPLOAD_BUCKET!;

app
  .get("/", (c) => c.text("Hello, Upload Route!"))
  .post("/", async (c) => {
    const contentType = c.req.header("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return c.json({ error: "Only image files allowed." }, 400);
    }
    console.log("contentType:", contentType);
    const arrayBuffer = await c.req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = contentType.split("/")[1];
    const key = `original/${Date.now()}_upload.${ext}`;

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );
      const url = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      return c.json({ message: "Upload successful", key, url }, 200);
    } catch (err) {
      console.error("S3 upload error:", err);
      return c.json({ error: "Failed to upload PDF" }, 500);
    }
  });

export { app as uploadRoute };
