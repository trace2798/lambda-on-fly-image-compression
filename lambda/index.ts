import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { serve } from "@hono/node-server";
import { compressRoute } from "./routes/compress";
import { uploadRoute } from "./routes/upload";

const app = new Hono();

export const routes = app
  .get("/", async (c) => {
    try {
      return c.text("Hello, Hono!");
    } catch (err) {
      console.error(err);
      return c.json({ error: err }, 500);
    }
  })
  .route("/compress", compressRoute)
  .route("/upload", uploadRoute);

export const handler = handle(app);

if (require.main === module) {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  console.log(`Dev server → http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}
