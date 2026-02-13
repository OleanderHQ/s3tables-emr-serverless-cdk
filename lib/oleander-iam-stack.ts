import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { OleanderIamConfig } from './config';

const OLEANDER_ACCOUNT_ID = '579897423473';

export interface OleanderIamStackProps extends cdk.StackProps {
  config: OleanderIamConfig;
  tableBucketArn: string;
  emrServerlessApplicationArn: string;
  emrServerlessExecutionRoleArn: string;
  jobLogsBucketName: string;
}

export class OleanderIamStack extends cdk.Stack {
  public constructor(scope: Construct, id: string, props: OleanderIamStackProps) {
    super(scope, id, props);

    const oleanderPrincipal = new iam.AccountPrincipal(OLEANDER_ACCOUNT_ID).withConditions({
      StringEquals: {
        'sts:ExternalId': props.config.organizationId,
      },
    });

    const s3TablesAccessRole = new iam.Role(this, 'OleanderS3TablesAccessRole', {
      roleName: props.config.roleNames.s3tablesAccessRole,
      assumedBy: oleanderPrincipal,
    });

    s3TablesAccessRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'S3TablesAccess',
        actions: ['s3tables:*'],
        resources: [props.tableBucketArn, `${props.tableBucketArn}/table/*`],
      })
    );

    const emrControllerRole = new iam.Role(this, 'OleanderEmrServerlessControllerRole', {
      roleName: props.config.roleNames.emrControllerRole,
      assumedBy: oleanderPrincipal,
    });

    emrControllerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowStartJobRun',
        actions: ['emr-serverless:StartJobRun'],
        resources: [props.emrServerlessApplicationArn],
      })
    );

    emrControllerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowGetJobRun',
        actions: ['emr-serverless:GetJobRun'],
        resources: [`${props.emrServerlessApplicationArn}/jobruns/*`],
      })
    );

    emrControllerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'PassExecutionRole',
        actions: ['iam:PassRole'],
        resources: [props.emrServerlessExecutionRoleArn],
        conditions: {
          StringLike: {
            'iam:PassedToService': 'emr-serverless.amazonaws.com',
          },
        },
      })
    );

    emrControllerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ReadJobLogsFromS3',
        actions: ['s3:GetObject'],
        resources: [`arn:aws:s3:::${props.jobLogsBucketName}/*`],
      })
    );

    new cdk.CfnOutput(this, 'OleanderS3TablesAccessRoleArn', {
      value: s3TablesAccessRole.roleArn,
    });
    new cdk.CfnOutput(this, 'OleanderEmrServerlessControllerRoleArn', {
      value: emrControllerRole.roleArn,
    });
  }
}
