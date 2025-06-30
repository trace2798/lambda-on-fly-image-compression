<!-- # Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
 -->

# Lambda On-Fly Image Compression & AI Toolkit

A fully serverless, headless image-management and processing platform built on AWS Lambda and the Hono router. This project provides:

- **On-the-fly image compression** (WebP at 80% quality)
- **Dynamic, URL-driven transformations** (resize, crop, format conversion, blur, sharpen, grayscale)
- **AI-powered features** via AWS Bedrock:
  - Text-to-Image (Meta Llama → Titan)
  - Alt-Text generation (Llama-4 streaming)
  - Prompt-refinement for client-supplied instructions
- **Secure, CORS-enabled REST API** (API Gateway + Function URLs)
- **Metadata storage** in SqLite (TURSO) via Drizzle ORM
- **CDK-driven infrastructure** with Layer management, IAM least-privilege, S3 + CloudFront, and API Gateway

---

## Architecture Overview

1. **AWS CDK** provisions:

   - A Node.js 22.x Lambda backed by a native Sharp Layer (ARM64)
   - API Gateway REST API (with CORS and API-Key auth) & Function URL (SSE/chunked streaming)
   - S3 buckets for `original`, `compressed`, and `transforms` folders
   - CloudFront distribution fronting S3 for global caching
   - IAM Roles scoped to S3 and Bedrock model ARNs

2. **Lambda Functions (TypeScript + Hono)**

   - `/compress` → download original, WebP-compress, upload, record metadata
   - `/upload` → direct S3 upload presign
   - `/presign(-free)` → presigned PUT URLs (authenticated or open)
   - `/image` → redirect to compressed/original via CloudFront
   - `/generate` & `/generate-instruction` → alt-text & textual instructions via Bedrock
   - `/generate-image` → text-to-image pipeline (prompt refine → Titan → compress)
   - `/transform-free` → free-form transformations with metadata response
   - `/workspace/images` → cursor-paginated image listing

3. **CDK Stack** (`lib/lambda-on-fly-image-compression-stack.ts`)
   - Creates `SharpLayer`, `NodejsFunction`, IAM policies, outputs Function URL & REST API URL.

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18.x & npm/yarn
- **AWS CLI** & credentials configured (`~/.aws/credentials`)
- **AWS CDK** v2 installed globally
- **PostgreSQL** (Aurora Serverless) and connection string for Drizzle
- **Environment Variables** in a `.env` file at project root:

  ```ini
  UPLOAD_BUCKET=your-s3-bucket-name
  AWS_BUCKET_REGION=ap-south-1
  APIGATEWAY_API_KEY=<optional if using API-Key auth>
  DATABASE_URL=postgresql://user:pass@host:port/dbname
  ```

````

## Installation

```bash
git clone https://github.com/your-org/lambda-on-fly-image-compression.git
cd lambda-on-fly-image-compression
npm install
````

## Development

Run the Lambda handler locally with hot-reload:

```bash
npm run dev
```

## API Endpoints

| Route                   | Method(s) | Description                                                |
| ----------------------- | --------- | ---------------------------------------------------------- |
| `/compress`             | POST      | Compress S3 image to WebP, store metadata                  |
| `/presign`              | GET       | Generate presigned S3 PUT URL                              |
| `/presign-free`         | GET       | Generate presigned S3 PUT URL                              |
| `/image`                | GET       | Redirect to compressed or original image via CloudFront    |
| `/generate`             | POST      | Alt-text generation via Llama-4 (JSON or SSE)              |
| `/generate-instruction` | POST      | Prompt-refinement via Llama-x (JSON)                       |
| `/generate-image`       | POST      | Text-to-Image pipeline (refine → Titan → compress)         |
| `/transform-free`       | POST      | Free-form image transforms (resize, crop, format, filters) |
| `/workspace`            | GET       | List & paginate workspace images (cursor by `createdAt`)   |
| `/generate-url`         | POST      | Generate signed URL or link for a given image key          |

_All routes are CORS-enabled. Protected endpoints (e.g. `/compress`, `/presign`) require `x-api-key` in the header; `/presign-free` and `/image` are public._

---

## index.ts
Bootstraps a Hono server with global CORS and an OPTIONS preflight handler, mounts all feature routes under paths like `/compress`, `/presign`, `/generate-image`, etc., exports both an AWS Lambda handler (`handler`) and a local dev server (`serve`).

## compressRoute (`/compress`)
- **GET /**: Health check returning “Hello, Compress Route!”  
- **POST /**: Downloads an original image from S3, compresses it to WebP via Sharp, uploads the compressed version back to S3, and logs metadata into the database.

## presignRoute (`/presign`)
- **POST /**: Generates a time-limited S3 PUT URL for uploads under `${workspaceId}/original/…`, returning `{ key, url }` for client-side direct uploads.

## presignFreeRoute (`/presign-free`)
- **POST /**: Similar to `/presign` but uses a `free/` prefix and does not require authentication; returns `{ key, url }` for anonymous uploads.

## imageRoute (`/image`)
- **GET /**: “Hello, Image Route!”  
- **GET `/:workspaceId/:imageId`** & **GET `/:workspaceId/:imageId/`**: Redirects to the compressed image’s CloudFront URL.  
- **GET `/:workspaceId/:imageId/og`**: Redirects to the original image’s CloudFront URL.  
- **GET `/:workspaceId/:imageId/:transforms`**: Parses transform tokens (resize, crop, blur, etc.), checks S3 for an existing transformed image, applies Sharp pipeline if needed, uploads result, then redirects to the transformed image’s URL.

## generateImageRoute (`/generate-image`)
- **GET /**: “Hello, Generate Image Route!”  
- **POST /**: Sends user query to Bedrock Llama-3 to refine into a text-to-image prompt, invokes Titan image generator, uploads PNG to S3, calls `/compress` to WebP-ify and log it, returns the Base64 image array.

## generateRoute (`/generate`)
- **GET /**: “Hello, Generate Route!”  
- **POST /**: Fetches a compressed image by `imagePublicId`, sends it plus a prompt to Llama-4 Scout to generate descriptive alt text, returns `{ altText }`.

## generateInstructionRoute (`/generate-instruction`)
- **GET /**: “Hello, Generate Route!”  
- **POST /**: Similar to `/generate` but allows a custom `instruction` and includes the image’s current alt text in the prompt to refine it further.

## transformFreeRoute (`/transform-free`)
- **POST /**: Accepts S3 `key` and a `transforms` string (e.g. `w=400,h=300,grayscale`), parses/normalizes tokens, applies Sharp transforms on-the-fly, uploads optimized image under a `free/` key, returns original and optimized URLs with metadata.

## workspaceRoute (`/workspace`)
- **GET `/:workspaceId/images`**: Validates `limit` and `before` query params, fetches a page of images for the workspace (with `limit+1` for cursoring), returns `{ images, nextCursor, workspacePublicId }`.

## generateUrlRoute (`/generate-url`)
- **GET /**: “Hello, Generate Url Route!”  
- **POST /**: Takes `query`, `baseUrl`, and `dimensions`, uses Bedrock Llama-4 Scout with a “Titan” system prompt to translate into a valid transformation URL or a human-friendly error message, returns `{ aiResponse }`.


## License

This project is licensed under the [MIT License](LICENSE).
