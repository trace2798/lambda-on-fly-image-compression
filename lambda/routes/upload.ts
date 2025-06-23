// import { Hono } from "hono";
// import { cors } from "hono/cors";
// import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
// import "dotenv/config";

// const app = new Hono();

// app.use(
//   "/*",
//   cors({
//     origin: "*",
//     allowMethods: ["GET", "POST", "OPTIONS"],
//     allowHeaders: ["Content-Type", "Accept"],
//   })
// );

// const s3 = new S3Client({ region: process.env.AWS_BUCKET_REGION });
// const bucket = process.env.UPLOAD_BUCKET!;

// app
//   .get("/", (c) => c.text("Hello, Upload Route!"))
//   .post("/", async (c) => {
//     const contentType = c.req.header("content-type") || "";
//     if (!contentType.startsWith("image/")) {
//       return c.json({ error: "Only image files allowed." }, 400);
//     }
//     console.log("contentType:", contentType);
//     const arrayBuffer = await c.req.arrayBuffer();
//     const buffer = Buffer.from(arrayBuffer);
//     console.log("Uploading buffer length:", buffer.length);

//     // console.log("Buffer", buffer);
//     const ext = contentType.split("/")[1];
//     // const key = `original/${Date.now()}_upload.${ext}`;
//     // const body = await c.req.parseBody(); // or c.req.formData()
//     // console.log("Body:", body);
//     // const file = Array.isArray(body["file"]) ? body["file"][0] : body["file"];
//     // console.log("File:", file);
//     // if (!(file instanceof File)) {
//     //   return c.json({ error: "File is required" }, 400);
//     // }

//     // // 2) Build Buffer & S3 key
//     // const ext = file.type.split("/")[1];
//     // const key = `original/${Date.now()}_upload.${ext}`;
//     // const buffer = Buffer.from(await file.arrayBuffer());
//     // console.log("Uploading buffer length:", buffer.length);

//     // const form = await c.req.formData();
//     // const fileItem = form.get("file");

//     // console.log("FormData file field:", fileItem);

//     // if (!(fileItem instanceof File)) {
//     //   return c.json({ error: "File is required" }, 400);
//     // }
//     // const file = fileItem as File;

//     // // 2) Build Buffer & S3 key
//     // const ext = file.type.split("/")[1];
//     const key = `original/${Date.now()}_upload.${ext}`;
//     // const buffer = Buffer.from(await file.arrayBuffer());

//     console.log("Uploading buffer length:", buffer.length);
//     try {
//       await s3.send(
//         new PutObjectCommand({
//           Bucket: bucket,
//           Key: key,
//           Body: buffer,
//           ContentType: contentType,
//         })
//       );
//       const url = `https://${bucket}.s3.${process.env.AWS_BUCKET_REGION}.amazonaws.com/${key}`;
//       return c.json({ message: "Upload successful", key, url }, 200);
//     } catch (err) {
//       console.error("S3 upload error:", err);
//       return c.json({ error: "Failed to upload PDF" }, 500);
//     }
//   });

// export { app as uploadRoute };

// import { Hono } from "hono";
// import { cors } from "hono/cors";
// import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
// import "dotenv/config";

// const app = new Hono();
// app.use(
//   "/*",
//   cors({
//     origin: "*",
//     allowMethods: ["GET", "POST", "OPTIONS"],
//     allowHeaders: ["Content-Type", "Accept"],
//   })
// );

// const s3 = new S3Client({ region: process.env.AWS_BUCKET_REGION });
// const bucket = process.env.UPLOAD_BUCKET!;

// app.post("/", async (c) => {
//   // 1) Parse the incoming multipart/form-data
//   let form: FormData;
//   try {
//     form = await c.req.formData();
//   } catch (err) {
//     return c.json({ error: "Invalid form data" }, 400);
//   }

//   // 2) Pull out the “file” field
//   const fileItem = form.get("file");
//   if (!(fileItem instanceof File)) {
//     return c.json(
//       { error: "Field ‘file’ is required and must be an image" },
//       400
//     );
//   }

//   // 3) Validate MIME type
//   const contentType = fileItem.type || "";
//   if (!contentType.startsWith("image/")) {
//     return c.json({ error: "Only image files allowed." }, 400);
//   }

//   // 4) Read it into a Buffer
//   const arrayBuffer = await fileItem.arrayBuffer();
//   const buffer = Buffer.from(arrayBuffer);
//   console.log("Uploading buffer length:", buffer.length);

//   // 5) Build S3 key and upload
//   const ext = contentType.split("/")[1];
//   const key = `original/${Date.now()}_upload.${ext}`;

//   try {
//     await s3.send(
//       new PutObjectCommand({
//         Bucket: bucket,
//         Key: key,
//         Body: buffer,
//         ContentType: contentType,
//       })
//     );
//   } catch (err) {
//     console.error("S3 upload error:", err);
//     return c.json({ error: "Failed to upload image" }, 500);
//   }

//   const url = `https://${bucket}.s3.${process.env.AWS_BUCKET_REGION}.amazonaws.com/${key}`;
//   return c.json({ key, url }, 200);
// });

// export { app as uploadRoute };

import { Hono } from "hono";
import { cors } from "hono/cors";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
  const form = await c.req.formData();
  const fileItem = form.get("file"); // <— your field name

  console.log("FormData.get('file'):", fileItem);

  if (!(fileItem instanceof File)) {
    return c.json({ error: "Field ‘file’ is required" }, 400);
  }

  // 2) Turn that File → ArrayBuffer → Node Buffer
  const arrayBuffer = await fileItem.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log("Uploading buffer length:", buffer.length);

  // 3) Build S3 key & metadata
  const contentType = fileItem.type;
  const ext = contentType.split("/")[1] || "bin";
  const key = `uploads/${Date.now()}.${ext}`;

  // 4) Upload!
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
  } catch (err) {
    console.error("S3 upload error:", err);
    return c.json({ error: "Failed to upload file" }, 500);
  }

  const url = `https://${bucket}.s3.${process.env.AWS_BUCKET_REGION}.amazonaws.com/${key}`;
  return c.json({ key, url }, 200);
});

export { app as uploadRoute };
