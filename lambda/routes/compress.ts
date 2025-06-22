import { Hono } from "hono";
import { cors } from "hono/cors";
import sharp from "sharp";

const app = new Hono();
app.use(cors());

const routes = app
  .get("/", (c) => c.text("Hello, Compress Route!"))
  .post("/", async (c) => {
    const { imageUrl } = await c.req.json();
    console.log("Image compress url", imageUrl);
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) {
        return c.text("Failed to fetch image", 400);
      }
      const arrayBuffer = await res.arrayBuffer();
      const inputBuffer = Buffer.from(arrayBuffer);
      console.log(`Original image size: ${inputBuffer.length} bytes`);

      const outputBuffer = await sharp(inputBuffer)
        .resize({ width: 800, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      console.log(`Compressed image size: ${outputBuffer.length} bytes`);
      return c.body(outputBuffer, 200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      });
    } catch (err) {
      console.error("Compress error:", err);
      return c.text("Internal Server Error", 500);
    }
  });

export { routes as compressRoute };
