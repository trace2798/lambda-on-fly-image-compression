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
    const { workspaceId, imageId } = c.req.param();
    const transformsRaw = c.req.param("transforms");
    const ops = transformsRaw.split(",").filter(Boolean);
    console.log("OPS", ops);
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

    if (ops.length === 0) {
      return c.redirect(
        `https://d2gzjap71bv2ph.cloudfront.net/${result.image.compressImageKey}`
      );
    }

    const allowedFormats = new Set(["avif", "webp", "jpg", "jpeg", "png"]);
    const fmtToken = ops.find((op) => op.startsWith("format_"));
    const format = fmtToken?.split("_", 2)[1]!;
    const useFormat = allowedFormats.has(format) ? format : null;

    const widthToken = ops.find((op) => op.startsWith("w_"));
    const heightToken = ops.find((op) => op.startsWith("h_"));
    const width = widthToken ? parseInt(widthToken.split("_", 2)[1], 10) : null;
    const height = heightToken
      ? parseInt(heightToken.split("_", 2)[1], 10)
      : null;

    if (!useFormat && !width && !height) {
      return c.redirect(
        `https://d2gzjap71bv2ph.cloudfront.net/${result.image.compressImageKey}`
      );
    }
    const date = new Date().toISOString().slice(0, 10);
    const parts = [`fly`, date, imageId];
    if (width) parts.push(`w${width}`);
    if (height) parts.push(`h${height}`);
    if (useFormat) parts.push(format);
    const key = `${workspaceId}/${parts.join("_")}.${useFormat || "webp"}`;
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
      const input = await streamToBuffer(orig.Body as Readable);

      let pipeline = sharp(input);
      if (width || height) {
        pipeline = pipeline.resize({
          width: width ?? undefined,
          height: height ?? undefined,
        });
      }
      if (useFormat) {
        pipeline = pipeline.toFormat(useFormat as keyof sharp.FormatEnum);
      }

      const outBuffer = await pipeline.toBuffer();
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: outBuffer,
          ContentType: `image/${useFormat || "webp"}`,
          CacheControl: "public, max-age=31536000",
        })
      );
    }

    return c.redirect(`https://d2gzjap71bv2ph.cloudfront.net/${key}`);
  });

export { app as imageRoute };
