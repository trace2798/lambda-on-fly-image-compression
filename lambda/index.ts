import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { cors } from "hono/cors";
import { compressRoute } from "./routes/compress";
import { generateRoute } from "./routes/generate";
import { generateImageRoute } from "./routes/generate-image";
import { generateInstructionRoute } from "./routes/generate-instruction";
import { generateUrlRoute } from "./routes/generate-url";
import { imageRoute } from "./routes/image";
import { presignRoute } from "./routes/presign";
import { presignFreeRoute } from "./routes/presign-free";
import { transformFreeRoute } from "./routes/transform-free";
import { workspaceRoute } from "./routes/workspace";

const app = new Hono();
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept"],
  })
);

app.options("/*", (c) => c.json(null, 200));

export const routes = app
  .route("/compress", compressRoute)
  .route("/presign", presignRoute)
  .route("/presign-free", presignFreeRoute)
  .route("/image", imageRoute)
  .route("/generate", generateRoute)
  .route("/generate-instruction", generateInstructionRoute)
  .route("/generate-image", generateImageRoute)
  .route("/transform-free", transformFreeRoute)
  .route("/workspace", workspaceRoute)
  .route("/generate-url", generateUrlRoute);

export const handler = handle(app);

if (require.main === module) {
  const port = parseInt(process.env.PORT ?? "3001", 10);
  console.log(`Dev server → http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}
