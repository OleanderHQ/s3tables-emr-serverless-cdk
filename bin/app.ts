#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { loadConfig } from '../lib/config';
import { S3TablesEmrServerlessStack } from '../lib/s3tables-emr-serverless-stack';
import { OleanderIamStack } from '../lib/oleander-iam-stack';

const app = new cdk.App();
const envName = app.node.tryGetContext('env');
if (!envName || typeof envName !== 'string') {
  throw new Error('Missing required context: -c env={environment}');
}

const config = loadConfig(envName);
const env = {
  account: config.aws.account,
  region: config.aws.region,
};

const s3TablesEmrServerlessStack = new S3TablesEmrServerlessStack(app, 'S3TablesEmrServerless', {
  env,
  config: config.S3TablesEmrServerless,
  azCount: config.S3TablesEmrServerless.vpc.azCount,
});

if (config.OleanderIAM) {
  new OleanderIamStack(app, 'OleanderIAM', {
    env,
    config: config.OleanderIAM,
    tableBucketArn: s3TablesEmrServerlessStack.tableBucketArn,
    emrServerlessApplicationArn: s3TablesEmrServerlessStack.emrServerlessApplicationArn,
    emrServerlessExecutionRoleArn: s3TablesEmrServerlessStack.emrServerlessExecutionRoleArn,
    jobLogsBucketName: s3TablesEmrServerlessStack.jobLogsBucketName,
  });
}
