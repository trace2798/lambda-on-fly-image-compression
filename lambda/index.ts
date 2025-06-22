import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { serve } from "@hono/node-server";
import { compressRoute } from "./routes/compress";

const app = new Hono();

export const routes = app
  .get("/", (c) => c.text("Hello Hono Image compressor!"))
  .route("/compress", compressRoute);

export const handler = handle(app);

if (require.main === module) {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  console.log(`Dev server → http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}
