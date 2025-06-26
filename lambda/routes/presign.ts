import { Hono } from "hono";
import { cors } from "hono/cors";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import "dotenv/config";

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
  const { filename, contentType, userId, workspaceId } = await c.req.json<{
    filename: string;
    contentType: string;
    userId: string;
    workspaceId: string;
  }>();
  console.log("Inside pre sign url route");
  console.log(
    "filename",
    filename,
    "userId",
    userId,
    "workspaceId",
    workspaceId
  );
  const randomId = crypto.randomUUID();
  if (!filename || !contentType) {
    return c.json({ error: "filename and contentType are required" }, 400);
  }

  const ext = contentType.split("/")[1] || "bin";
  const key = `${workspaceId}/original/${Date.now()}-${randomId}.${ext}`;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 300 });

  return c.json({ key, url });
});

export { app as presignRoute };

// aws logs tail --follow --since 5m "/aws/lambda/LambdaOnFlyImageCompressionStack-lambda8B5974B5-9VHpQ0TPW1yX"
// npx cdk deploy --require-approval never
