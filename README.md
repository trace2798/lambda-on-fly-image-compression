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

| Route                      | Method | Description                                                   |
|----------------------------|--------|---------------------------------------------------------------|
| `/compress`                | POST   | Compress S3 image to WebP, store metadata                     |
| `/upload`                  | POST   | Generate presigned S3 PUT URL                                 |
| `/presign`                 | GET    | Authenticated presign (with API-Key)                          |
| `/presign-free`            | GET    | Open presign (no auth)                                        |
| `/image/:ws/:imgId`        | GET    | Redirect to compressed image                                  |
| `/image/:ws/:imgId/og`     | GET    | Redirect to original image                                    |
| `/transform-free`          | POST   | Apply arbitrary transforms, return JSON metadata & URLs       |
| `/generate`                | POST   | Alt-text generation via Llama-4 (JSON or SSE)                 |
| `/generate-instruction`    | POST   | Prompt-refinement via Llama-x (JSON)                           |
| `/generate-image`          | POST   | Text-to-Image pipeline (refine → Titan → compress)            |
| `/workspace/:ws/images`    | GET    | Cursor-paginated list of images for a workspace               |
| `/generate-url`            | POST   | [Custom] Generate signed URL or link for a given image key    |

_All routes are CORS-enabled. Protected routes require `x-api-key` in the header expect for image route._  

---
