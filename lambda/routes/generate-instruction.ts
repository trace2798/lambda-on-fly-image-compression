// import {
//   BedrockRuntimeClient,
//   ConversationRole,
//   ConverseCommand,
//   ConverseStreamCommand,
//   Message,
// } from "@aws-sdk/client-bedrock-runtime";
// import { eq } from "drizzle-orm";
// import { Hono } from "hono";
// import { cors } from "hono/cors";
// import { db } from "../../drizzle";
// import { image } from "../../drizzle/schema";
// import { streamSSE } from "hono/streaming";

// const app = new Hono();
// app.use(
//   "/*",
//   cors({
//     origin: "*",
//     allowMethods: ["GET", "POST", "OPTIONS"],
//     allowHeaders: ["Content-Type", "Accept"],
//   })
// );
// const client = new BedrockRuntimeClient({ region: "us-west-2" });
// const modelId = "us.meta.llama4-scout-17b-instruct-v1:0";
// const bucket = process.env.UPLOAD_BUCKET!;
// const routes = app
//   .get("/", (c) => c.text("Hello, Generate Route!"))
//   .post("/", async (c) => {
//     try {
//       console.log(" Received request, parsing body...");
//       const { imagePublicId, instruction } = await c.req.json();
//       console.log("IMage Public Id:", imagePublicId);
//       const imageInfo = await db
//         .select()
//         .from(image)
//         .where(eq(image.publicId, imagePublicId))
//         .limit(1)
//         .get();
//       console.log("Result", imageInfo);
//       const publicUrl = `https://${bucket}.s3.${process.env.AWS_BUCKET_REGION}.amazonaws.com/${imageInfo?.compressImageKey}`;
//       const res = await fetch(publicUrl);
//       const arrayBuf = await res.arrayBuffer();
//       const messages: Message[] = [
//         {
//           role: ConversationRole.USER,
//           content: [
//             {
//               image: {
//                 format: "webp",
//                 source: { bytes: new Uint8Array(arrayBuf) },
//               },
//             },
//             {
//               text: `Generate alternate text for this image following this user instruction:${instruction}. Current alternate text is ${image.alt}.`,
//             },
//           ],
//         },
//       ];
//       const command = new ConverseStreamCommand({
//         modelId: modelId,
//         messages: messages,
//         inferenceConfig: {
//           maxTokens: 200,
//           temperature: 0.2,
//           topP: 0.9,
//         },
//       });

//       const response = await client.send(command);
//       return streamSSE(c, async (stream) => {
//         c.req.raw.signal.addEventListener("abort", () => {
//           console.log("Client disconnected, aborting Bedrock stream");
//         });

//         for await (const chunk of response.stream!) {
//           const text = chunk.contentBlockDelta?.delta?.text;
//           if (text) {
//             await stream.writeSSE({ data: text });
//           }
//         }
//       });
//     } catch (err: any) {
//       console.error("Error in /generate handler:", err);
//       return c.json(
//         { error: err.message ?? "Unknown error in generateRoute" },
//         500
//       );
//     }
//   });

// export { routes as generateInstructionRoute };
import {
  BedrockRuntimeClient,
  ConversationRole,
  ConverseCommand,
  ConverseStreamCommand,
  Message,
} from "@aws-sdk/client-bedrock-runtime";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { db } from "../../drizzle";
import { image } from "../../drizzle/schema";
import { streamSSE } from "hono/streaming";

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
const bucket = process.env.UPLOAD_BUCKET!;
const routes = app
  .get("/", (c) => c.text("Hello, Generate Route!"))
  .post("/", async (c) => {
    try {
      console.log(" Received request, parsing body...");
      const { imagePublicId, instruction } = await c.req.json();
      console.log("IMage Public Id:", imagePublicId);
      const imageInfo = await db
        .select()
        .from(image)
        .where(eq(image.publicId, imagePublicId))
        .limit(1)
        .get();
      console.log("Result", imageInfo);
      const publicUrl = `https://${bucket}.s3.${process.env.AWS_BUCKET_REGION}.amazonaws.com/${imageInfo?.compressImageKey}`;
      const res = await fetch(publicUrl);
      const arrayBuf = await res.arrayBuffer();
      const messages: Message[] = [
        {
          role: ConversationRole.USER,
          content: [
            {
              image: {
                format: "webp",
                source: { bytes: new Uint8Array(arrayBuf) },
              },
            },
            {
              text: `Generate alternate text for this image following this user instruction:${instruction}. Current alternate text is ${image.alt}.`,
            },
          ],
        },
      ];
      const command = new ConverseCommand({
        modelId: modelId,
        messages: messages,
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
      const altText = response.output.message.content[0].text;
      console.log("Generated alt text:", altText);
      return c.json({ altText }, 200);
    } catch (err: any) {
      console.error("Error in /generate handler:", err);
      return c.json(
        { error: err.message ?? "Unknown error in generateRoute" },
        500
      );
    }
  });

export { routes as generateInstructionRoute };
