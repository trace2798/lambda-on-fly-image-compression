import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as path from "path";
import dotenv from "dotenv";
import * as iam from "aws-cdk-lib/aws-iam";

export class LambdaOnFlyImageCompressionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const fn = new NodejsFunction(this, "lambda", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/index.ts"),
      handler: "handler",
      bundling: {
        externalModules: ["aws-sdk"],
        nodeModules: ["sharp"],
        forceDockerBundling: true,
      },
      timeout: cdk.Duration.seconds(30),
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
