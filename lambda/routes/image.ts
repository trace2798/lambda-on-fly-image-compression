import {
  GetObjectCommand,
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Readable } from "stream";
import { db } from "../../drizzle";
import { image, workspace } from "../../drizzle/schema";
import sharp from "sharp";

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
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

app
  .get("/", (c) => c.text("Hello, Image Route!"))
  .get("/:workspaceId/:imageId", async (c) => {
    const { workspaceId, imageId } = c.req.param();
    console.log("WorkspaceId:", workspaceId, "Image Id:", imageId);
    const result = await db
      .select()
      .from(image)
      .innerJoin(workspace, eq(image.workspaceId, workspace.id))
      .where(
        and(eq(workspace.publicId, workspaceId), eq(image.publicId, imageId))
      )
      .limit(1)
      .get();

    console.log("Result", result);
    if (!result) {
      return c.json({ error: "Image not found" }, 404);
    }
    const cfUrl = `https://d2gzjap71bv2ph.cloudfront.net/${result.image.compressImageKey}`;
    return c.redirect(cfUrl);
  })
  .get("/:workspaceId/:imageId/:transforms", async (c) => {
    const { workspaceId, imageId, transforms: transformsRaw } = c.req.param();
    const rawParts = transformsRaw
      .split(/[,&]/)
      .map((p) => p.trim())
      .filter(Boolean);
    console.log("OPS Raw", rawParts);

    const ops: string[] = [];
    // const ops: string[] = [];
    for (const part of rawParts) {
      // a) bare “grayscale” turns it on
      if (part === "grayscale") {
        ops.push("e_grayscale");
        continue;
      }

      if (part.includes("=")) {
        const [key, rawValue] = part.split("=");
        if (!rawValue) continue;

        if (key === "grayscale" && rawValue === "false") {
          continue;
        }

        switch (key) {
          case "format":
            if (["avif", "webp", "jpg", "jpeg", "png"].includes(rawValue)) {
              ops.push(`format_${rawValue}`);
            }
            break;
          case "width":
          case "w": {
            const w = parseInt(rawValue, 10);
            if (!isNaN(w) && w > 0) ops.push(`w_${w}`);
            break;
          }
          case "height":
          case "h": {
            const h = parseInt(rawValue, 10);
            if (!isNaN(h) && h > 0) ops.push(`h_${h}`);
            break;
          }
          case "crop":
            if (
              ["cover", "contain", "fill", "inside", "outside"].includes(
                rawValue
              )
            ) {
              ops.push(`c_${rawValue}`);
            }
            break;
          case "gravity":
            if (
              [
                "north",
                "northeast",
                "east",
                "southeast",
                "south",
                "southwest",
                "west",
                "northwest",
                "center",
                "centre",
              ].includes(rawValue)
            ) {
              ops.push(`g_${rawValue}`);
            }
            break;
          case "blur": {
            const sigma = parseFloat(rawValue);
            if (!isNaN(sigma)) ops.push(`e_blur:${sigma}`);
            break;
          }
          case "sharpen": {
            const sigma = parseFloat(rawValue);
            if (!isNaN(sigma)) ops.push(`e_sharpen:${sigma}`);
            break;
          }
          case "grayscale":
            if (rawValue === "true") {
              ops.push("e_grayscale");
            }
            break;
          default:
            break;
        }
      } else {
        ops.push(part);
      }
    }
    console.log("OPS", ops);
    const uniqOps = Array.from(new Set(ops));
    console.log("OPS", uniqOps);
    const result = await db
      .select()
      .from(image)
      .innerJoin(workspace, eq(image.workspaceId, workspace.id))
      .where(
        and(eq(workspace.publicId, workspaceId), eq(image.publicId, imageId))
      )
      .limit(1)
      .get();
    if (!result) return c.json({ error: "Image not found" }, 404);

    if (uniqOps.length === 0) {
      return c.redirect(
        `https://d2gzjap71bv2ph.cloudfront.net/${result.image.compressImageKey}`
      );
    }

    const fmtToken = uniqOps.find((op) => op.startsWith("format_"));
    const format = fmtToken?.split("_", 2)[1];
    const allowedFmt = new Set(["avif", "webp", "jpg", "jpeg", "png"]);
    const useFormat = allowedFmt.has(format!) ? format : "webp";

    const widthToken = uniqOps.find((op) => op.startsWith("w_"));
    const heightToken = uniqOps.find((op) => op.startsWith("h_"));
    const width = widthToken
      ? parseInt(widthToken.split("_", 2)[1], 10)
      : undefined;
    const height = heightToken
      ? parseInt(heightToken.split("_", 2)[1], 10)
      : undefined;

    const cropToken = uniqOps.find((op) => op.startsWith("c_"));
    const gravityToken = uniqOps.find((op) => op.startsWith("g_"));
    const blurToken = uniqOps.find((op) => op.startsWith("e_blur"));
    const sharpenToken = uniqOps.find((op) => op.startsWith("e_sharpen"));
    const grayscale = uniqOps.includes("e_grayscale");

    const date = new Date().toISOString().slice(0, 10);
    const parts = ["fly", date, imageId];
    if (width) parts.push(`w${width}`);
    if (height) parts.push(`h${height}`);
    if (cropToken) parts.push(cropToken);
    if (gravityToken) parts.push(gravityToken);
    if (blurToken) parts.push(blurToken);
    if (sharpenToken) parts.push(sharpenToken);
    if (grayscale) parts.push("grayscale");
    if (fmtToken) parts.push(useFormat as string);
    const key = `${workspaceId}/${parts.join("_")}.${useFormat}`;

    let exists = true;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err: any) {
      if (err.name === "NotFound") exists = false;
      else throw err;
    }

    if (!exists) {
      const orig = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: result.image.originalImageKey!,
        })
      );
      const buffer = await streamToBuffer(orig.Body as Readable);

      let pipeline = sharp(buffer);
      if (width || height) {
        pipeline = pipeline.resize({ width, height });
      }
      if (cropToken) {
        const mode = cropToken!.slice(2) as
          | "cover"
          | "contain"
          | "fill"
          | "inside"
          | "outside";
        pipeline = pipeline.resize({ fit: mode });
      }
      if (gravityToken) {
        const pos = gravityToken!.slice(2);
        pipeline = pipeline.resize({ position: pos as sharp.Gravity });
      }
      if (blurToken) {
        const sigma = parseInt(blurToken.split(":")[1], 10);
        pipeline = pipeline.blur(sigma);
      }
      if (sharpenToken) {
        const sigma = parseInt(sharpenToken.split(":")[1], 10);
        pipeline = pipeline.sharpen(sigma);
      }
      if (grayscale) {
        pipeline = pipeline.grayscale();
      }
      pipeline = pipeline.toFormat(useFormat as keyof sharp.FormatEnum);

      const outBuf = await pipeline.toBuffer();
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: outBuf,
          ContentType: `image/${useFormat}`,
          CacheControl: "public, max-age=31536000",
        })
      );
    }

    return c.redirect(`https://d2gzjap71bv2ph.cloudfront.net/${key}`);
  });

export { app as imageRoute };
