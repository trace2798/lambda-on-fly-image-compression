import {
  BedrockRuntimeClient,
  ConversationRole,
  ConverseCommand,
  InvokeModelCommand,
  Message,
} from "@aws-sdk/client-bedrock-runtime";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { nanoid } from "nanoid";

const app = new Hono();
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept"],
  })
);
const s3 = new S3Client({ region: "ap-south-1" });

const client = new BedrockRuntimeClient({ region: "ap-south-1" });
const imgClient = new BedrockRuntimeClient({ region: "us-east-1" });
const modelId = "meta.llama3-8b-instruct-v1:0";
const imgModelId = "amazon.titan-image-generator-v2:0";
const bucket = process.env.UPLOAD_BUCKET!;
const routes = app
  .get("/", (c) => c.text("Hello, Generate Image Route!"))
  .post("/", async (c) => {
    try {
      console.log(" Received request, parsing body...");
      const { query, workspaceId } = await c.req.json();
      console.log("User Query:", query);
      const system = `
You are Titan, an AI dedicated to turning user descriptions into optimized text-to-image prompts. Follow these rules exactly:

• The model accepts a maximum of 512 character per prompt.   
• Start the prompts with the subject, e.g.: “An image of a …”.
• Enclose any quoted text in double quotes ("like this").  

Include as many of the following details as are relevant:  
  – Medium (e.g. oil painting, digital illustration, photograph)  
  – Color palette (e.g. muted pastels, vibrant neon)  
  – Lighting (e.g. soft morning glow, dramatic spotlight)  
  – Style (e.g. Art Nouveau, cyberpunk, hyperrealistic)  
  – Adjectives and quality modifiers (e.g. intricate, ultra-detailed, low-fi)  
  – Remarks or context (e.g. “in a bustling city street,” “floating in space”)  
  – Specify any negative hints to avoid unwanted elements (e.g. without people, no text, avoid blur).  

Leverage model parameters where applicable (e.g. sampling steps, guidance scale).

When the user provides a scene or concept, output only the completed image prompt—no explanations, apologies, or extra text.
`;

      const messages: Message[] = [
        {
          role: ConversationRole.USER,
          content: [
            {
              text: query,
            },
          ],
        },
      ];
      console.log("INSIDE GENERATE API, Creating stream now");
      const command = new ConverseCommand({
        modelId: modelId,
        messages: messages,
        system: [{ text: system }],
        inferenceConfig: {
          maxTokens: 200,
          temperature: 0.2,
          topP: 0.9,
        },
      });

      const response = await client.send(command);
      console.log("OUTPUT", response);
      if (
        !response.output ||
        !response.output.message ||
        !response.output.message.content ||
        response.output.message.content.length === 0
      ) {
        throw new Error("Model returned no usable output");
      }
      const refinedPrompt = response.output.message.content[0].text;

      console.log("AI GENERATED PROMPT:", refinedPrompt);
      const imageCmd = new InvokeModelCommand({
        modelId: imgModelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          taskType: "TEXT_IMAGE",
          textToImageParams: { text: refinedPrompt },
          imageGenerationConfig: {
            quality: "standard",
            numberOfImages: 1,
            width: 512,
            height: 512,
          },
        }),
      });
      const imageRes = await imgClient.send(imageCmd);
      const { images } = JSON.parse(new TextDecoder().decode(imageRes.body));
      const base64 = images[0];
      const imgBuffer = Buffer.from(base64, "base64");
      const randomId = nanoid();
      const originalKey = `${workspaceId}/original/${Date.now()}-${randomId}.png`;
      console.log("Original Key", originalKey);
      const putCmd = new PutObjectCommand({
        Bucket: bucket,
        Key: originalKey,
        Body: imgBuffer,
        ContentType: "image/png",
        CacheControl: "public, max-age=31536000, immutable",
      });
      await s3.send(putCmd);
      const res = await fetch("http://localhost:3001/compress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: originalKey, workspaceId, imgType: "ai" }),
      });
      if (!res.ok) {
        throw new Error(`Compress route failed: ${res.status}`);
      }
      return c.json({ images });
    } catch (err: any) {
      console.error("Error in /generate-image handler:", err);
      return c.json(
        { error: err.message ?? "Unknown error in generateRoute" },
        500
      );
    }
  });

export { routes as generateImageRoute };
