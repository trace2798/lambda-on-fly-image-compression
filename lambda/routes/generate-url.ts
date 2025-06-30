import {
  BedrockRuntimeClient,
  ConversationRole,
  ConverseCommand,
  Message,
} from "@aws-sdk/client-bedrock-runtime";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept"],
  })
);
const client = new BedrockRuntimeClient({ region: "us-west-2" });
const modelId = "us.meta.llama4-scout-17b-instruct-v1:0";
// const client = new BedrockRuntimeClient({ region: "ap-south-1" });
// const modelId = "meta.llama3-70b-instruct-v1:0";
// const client = new BedrockRuntimeClient({ region: "us-west-2" });
// const modelId = "meta.llama3-3-70b-instruct-v1:0";
const routes = app
  .get("/", (c) => c.text("Hello, Generate Url Route!"))
  .post("/", async (c) => {
    try {
      console.log(" Received request, parsing body...");
      const { query, baseUrl, dimensions } = await c.req.json();
      console.log(
        "User Query:",
        query,
        "BAseurl:",
        baseUrl,
        "dimensions",
        dimensions
      );
      const system =
        "You are Titan, an AI that turns any user image-transformation request into a valid URL for our image-service.\n" +
        "Max tokens: 500. Keep your response under that.\n" +
        "\n" +
        "You have three inputs:\n" +
        " • query: the user’s free-form description (e.g. “make it look like a thumbnail”)\n" +
        " • baseUrl: the image’s root URL (e.g. https://cdn.example.com/images/123)\n" +
        " • dimensions: origWidth×origHeight\n" +
        "\n" +
        "Step 0 – Interpret high-level terms (if present):\n" +
        " • “mobile” or “phone” → w=360\n" +
        " • “iPhone” → w=390\n" +
        " • “desktop” or “full HD” → w=1280,h=720\n" +
        " • “thumbnail” or “avatar” → w=150,h=150,crop=cover\n" +
        " • “banner” → w=origWidth,h=200,crop=cover\n" +
        " • “square” → crop=cover,w=min(origWidth,origHeight),h=min(origWidth,origHeight)\n" +
        " • “portrait” → if origHeight>origWidth, swap width/height\n" +
        " • “landscape” → ensure w>h using origWidth,origHeight\n" +
        " • ignore other phrases for interpretation\n" +
        "\n" +
        "Step 1 – Normalize into these tokens (in order):\n" +
        " 1. grayscale\n" +
        " 2. format=<avif|webp|jpg|jpeg|png>\n" +
        " 3. w=<number>\n" +
        " 4. h=<number>\n" +
        " 5. crop=<cover|contain|fill|inside|outside>\n" +
        " 6. gravity=<north|northeast|east|southeast|south|southwest|west|northwest|center|centre>\n" +
        " 7. blur=<sigma>\n" +
        " 8. sharpen=<sigma>\n" +
        "\n" +
        "Step 2 – Discard unsupported tokens.\n" +
        "Step 3 – Deduplicate, keeping the first of each.\n" +
        "Step 4 – Join with commas: e.g. grayscale,format=jpg,w=300,h=300,crop=cover.\n" +
        "\n" +
        "Result:\n" +
        " • If you have any tokens: output exactly `{baseUrl}/{tokens}`\n" +
        " • If none apply: output `{baseUrl}/og`\n" +
        "\n" +
        "Friendly heads-up:\n" +
        " • If w or h exceeds origWidth×origHeight, prepend on one line:\n" +
        "     “Note: this will upscale beyond the original (origWidth×origHeight).”\n" +
        "   Then on the next line emit the URL.\n" +
        " • If nothing can be interpreted or normalized, reply in plain language (under 200 tokens) explaining what’s missing—no URL.\n" +
        "\n" +
        "Keep it concise and natural. If a valid URL can be built, deliver only that URL (with at most one note above). Otherwise, give a short, human-friendly explanation.";

      const messages: Message[] = [
        {
          role: ConversationRole.USER,
          content: [
            {
              text: `The users query is: ${query}. The base url is: ${baseUrl} and the dimensions of the original image is ${dimensions}.`,
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
          maxTokens: 500,
          temperature: 0,
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
      const aiResponse = response.output.message.content[0].text;
      console.log("Generated response:", aiResponse);
      return c.json({ aiResponse }, 200);
      //   return c.json({ message: "OK" }, 200);
    } catch (err: any) {
      console.error("Error in /generate url handler:", err);
      return c.json(
        { error: err.message ?? "Unknown error in generateRoute" },
        500
      );
    }
  });

export { routes as generateUrlRoute };
