import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import sharp from "sharp";
import type { Readable } from "stream";

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

app.post("/", async (c) => {
  const { key: originalImageKey, transforms: transformsRaw } =
    await c.req.json();
  const rawParts = transformsRaw
    .split(/[,&]/)
    .map((p: string) => p.trim())
    .filter(Boolean);

  console.log("OPS Raw", rawParts);

  const ops: string[] = [];

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
            ["cover", "contain", "fill", "inside", "outside"].includes(rawValue)
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

  const parts = ["free", "fly", originalImageKey];
  if (width) parts.push(`w${width}`);
  if (height) parts.push(`h${height}`);
  if (cropToken) parts.push(cropToken);
  if (gravityToken) parts.push(gravityToken);
  if (blurToken) parts.push(blurToken);
  if (sharpenToken) parts.push(sharpenToken);
  if (grayscale) parts.push("grayscale");
  if (fmtToken) parts.push(useFormat as string);
  const key = `${parts.join("_")}.${useFormat}`;

  const origResp = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: originalImageKey!,
    })
  );

  const origBuf = await streamToBuffer(origResp.Body as Readable);

  const origMeta = await sharp(origBuf).metadata();
  const origSize = origBuf.length;

  let pipeline = sharp(origBuf);
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
  const outMeta = await sharp(outBuf).metadata();
  const outSize = outBuf.length;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: outBuf,
      ContentType: `image/${useFormat}`,
      CacheControl: "public, max-age=31536000",
    })
  );

  const CF_BASE = `https://d2gzjap71bv2ph.cloudfront.net`;
  return c.json({
    original: {
      url: `${CF_BASE}/${originalImageKey}`,
      width: origMeta.width,
      height: origMeta.height,
      size: origSize,
    },
    optimized: {
      url: `${CF_BASE}/${key}`,
      width: outMeta.width,
      height: outMeta.height,
      size: outSize,
    },
  });
});

export { app as transformFreeRoute };

