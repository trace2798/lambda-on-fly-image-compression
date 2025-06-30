import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { db } from "../../drizzle";
import { image } from "../../drizzle/schema";
import { nanoid } from "nanoid";
import { extname, dirname, join, basename } from "path";
import { posix as pathPosix } from "path";

const app = new Hono();
app.use(cors());

const s3 = new S3Client({});

app
  .get("/", (c) => c.text("Hello, Compress Route!"))
  .post("/", async (c) => {
    type Body = { key: string; workspaceId: string; imgType: string };
    const { key, workspaceId, imgType } = (await c.req.json()) as Body;
    if (!key) {
      return c.json({ error: "Missing key in request body" }, 400);
    }
    console.log("ORIGNIAL KEY:", key);
    const originalExt = extname(key);
    console.log("ORIGINAL EXT", originalExt);
    const originalName = basename(key, originalExt);
    const originalDir = dirname(key);
    const compressedDir = originalDir.replace("/original", "/compressed");
    const bucket = process.env.UPLOAD_BUCKET!;
    const compressedKey = pathPosix.join(compressedDir, `${originalName}.webp`);
    console.log("ompressed Key", compressedKey);
    try {
      console.log("fetching image:", key);
      const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      console.log("fetched:", getCmd);
      const getRes = await s3.send(getCmd);
      // console.log("getRes", getRes);
      if (!getRes.Body) {
        return c.json({ error: "Failed to download object" }, 500);
      }
      const inputBuffer = await getRes.Body.transformToByteArray();
      const origMeta = await sharp(inputBuffer).metadata();
      console.log(
        "Original image —",
        `width: ${origMeta.width}px`,
        `height: ${origMeta.height}px`,
        `size: ${inputBuffer.byteLength} bytes`
      );
      const compressor = sharp(inputBuffer).webp({ quality: 80 });
      const outputBuffer = await compressor.toBuffer();
      const compMeta = await compressor.metadata();
      console.log(
        "Compressed image —",
        `width: ${compMeta.width}px`,
        `height: ${compMeta.height}px`,
        `size: ${outputBuffer.byteLength} bytes`
      );
      const putCmd = new PutObjectCommand({
        Bucket: bucket,
        Key: compressedKey,
        Body: outputBuffer,
        ContentType: "image/webp",
        CacheControl: "max-age=31536000, immutable",
      });
      await s3.send(putCmd);

      const publicId = nanoid();
      await db
        .insert(image)
        .values({
          publicId: publicId,
          workspaceId: workspaceId,
          originalImageKey: key,
          compressImageKey: compressedKey,
          imgType: imgType,
          originalWidth: origMeta.width!,
          originalHeight: origMeta.height!,
          originalSize: inputBuffer.byteLength,
          compressedSize: outputBuffer.byteLength,
          alt: "",
          updatedAt: new Date(),
          createdAt: new Date(),
        })
        .returning({ id: image.id });

      return c.json({ message: "Done" }, 200);
    } catch (err) {
      console.error("Compress error:", err);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  });

export { app as compressRoute };
