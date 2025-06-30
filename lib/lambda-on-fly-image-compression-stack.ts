import * as cdk from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import dotenv from "dotenv";
import * as path from "path";

const envParse = dotenv.config({ path: ".env" }).parsed;

export class LambdaOnFlyImageCompressionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sharpLayer = new lambda.LayerVersion(this, "SharpLayer", {
      code: lambda.Code.fromAsset("layers/sharp"),
      compatibleArchitectures: [lambda.Architecture.ARM_64],
      compatibleRuntimes: [
        lambda.Runtime.NODEJS_18_X,
        lambda.Runtime.NODEJS_20_X,
        lambda.Runtime.NODEJS_22_X,
      ],
      description: "Sharp Lambda Layer for ARM64",
      license: "Apache-2.0",
    });

    const fn = new NodejsFunction(this, "lambda", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/index.ts"),
      handler: "handler",
      bundling: {
        externalModules: ["aws-sdk", "sharp"],
      },
      timeout: cdk.Duration.seconds(30),
      layers: [sharpLayer],
    });
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: [
          "arn:aws:bedrock:us-west-2:095900844101:inference-profile/us.meta.llama4-scout-17b-instruct-v1:0",
          "arn:aws:bedrock:us-east-1::foundation-model/meta.llama4-scout-17b-instruct-v1:0",
          "arn:aws:bedrock:us-east-2::foundation-model/meta.llama4-scout-17b-instruct-v1:0",
          "arn:aws:bedrock:us-west-2::foundation-model/meta.llama4-scout-17b-instruct-v1:0",
          "arn:aws:bedrock:ap-south-1::foundation-model/meta.llama3-8b-instruct-v1:0",
          "arn:aws:bedrock:ap-south-1::foundation-model/meta.llama3-70b-instruct-v1:0",
          "arn:aws:bedrock:us-west-2::foundation-model/meta.llama3-3-70b-instruct-v1:0",
          "arn:aws:bedrock:us-west-2:095900844101:inference-profile/us.meta.llama3-3-70b-instruct-v1:0",
          "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-image-generator-v2:0",
        ],
      })
    );
    const bucketName = envParse?.UPLOAD_BUCKET!;
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:ListBucket",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ],
        resources: [
          `arn:aws:s3:::${bucketName}`,
          `arn:aws:s3:::${bucketName}/*`,
        ],
      })
    );
    const fnUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
    });
    new cdk.CfnOutput(this, "FunctionUrl", {
      value: fnUrl.url,
      description: "Use this URL for SSE/chunked streaming",
    });
    const api = new apigw.LambdaRestApi(this, "HonoApi", {
      handler: fn,
      proxy: true,
      restApiName: "HonoService",
      deployOptions: { stageName: "dev" },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: apigw.Cors.DEFAULT_HEADERS,
      },
    });

    new cdk.CfnOutput(this, "RestApiUrl", {
      value: api.url,
    });
  }
}
