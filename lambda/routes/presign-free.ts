import { Hono } from "hono";
import { cors } from "hono/cors";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import "dotenv/config";
import { nanoid } from "nanoid";

const app = new Hono();
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

app.post("/", async (c) => {
  const { filename, contentType } = await c.req.json<{
    filename: string;
    contentType: string;
  }>();
  console.log("Inside pre sign url route");
  console.log("filename", filename);
  const randomId = nanoid();
  if (!filename || !contentType) {
    return c.json({ error: "filename and contentType are required" }, 400);
  }

  const ext = contentType.split("/")[1] || "bin";
  const key = `free/${Date.now()}-${randomId}.${ext}`;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 300 });

  return c.json({ key, url });
});

export { app as presignFreeRoute };
