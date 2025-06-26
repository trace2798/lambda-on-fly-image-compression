import { Hono } from "hono";
import { cors } from "hono/cors";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import "dotenv/config";
import { db } from "../../drizzle";
import { image, workspace } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";

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

app
  .get("/", (c) => c.text("Hello, Image Route!"))
  .get("/:workspaceId/:imageId/*", async (c) => {
    const { workspaceId, imageId } = c.req.param();
    console.log("WorkspaceId:", workspaceId, "Image Id:", imageId);
    const result = await db
      .select({ originalImageKey: image.originalImageKey })
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

    const { originalImageKey } = result;
    console.log("Found key:", originalImageKey);
    return c.text("OK");
  });

export { app as imageRoute };
