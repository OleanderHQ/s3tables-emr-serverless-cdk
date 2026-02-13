import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as emrserverless from 'aws-cdk-lib/aws-emrserverless';
import {
  EmrServerlessConfig,
  EmrServerlessWorkerCapacity,
  S3TablesEmrServerlessConfig,
} from './config';

const DEFAULT_RELEASE_LABEL = 'emr-7.12.0';

export interface S3TablesEmrServerlessStackProps extends cdk.StackProps {
  config: S3TablesEmrServerlessConfig;
  azCount: number;
}

export class S3TablesEmrServerlessStack extends cdk.Stack {
  public readonly tableBucketName: string;
  public readonly tableBucketArn: string;
  public readonly emrServerlessApplicationId: string;
  public readonly emrServerlessApplicationArn: string;
  public readonly jobArtifactsBucketName: string;
  public readonly jobLogsBucketName: string;
  public readonly emrServerlessExecutionRoleArn: string;

  public constructor(scope: Construct, id: string, props: S3TablesEmrServerlessStackProps) {
    super(scope, id, props);

    const config = props.config;

    const vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(config.vpc.cidr),
      maxAzs: props.azCount,
      natGateways: config.vpc.natGateways,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: config.vpc.publicSubnetCidrMask,
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: config.vpc.privateSubnetCidrMask,
        },
      ],
    });

    const privateSubnets = vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS });
    const publicSubnets = vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC });
    const emrSubnets = config.emrServerless.usePrivateSubnets ? privateSubnets : publicSubnets;

    const emrSecurityGroup = new ec2.SecurityGroup(this, 'EmrServerlessSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for EMR Serverless application',
    });

    vpc.addGatewayEndpoint('S3GatewayEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [
        { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        { subnetType: ec2.SubnetType.PUBLIC },
      ],
    });

    const s3TablesEndpointSecurityGroup = new ec2.SecurityGroup(this, 'S3TablesEndpointSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for S3 Tables interface endpoint',
    });
    s3TablesEndpointSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow HTTPS from VPC'
    );

    new ec2.InterfaceVpcEndpoint(this, 'S3TablesInterfaceEndpoint', {
      vpc,
      service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${this.region}.s3tables`, 443),
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
      securityGroups: [s3TablesEndpointSecurityGroup],
    });

    const jobArtifactsBucket = new s3.Bucket(this, 'JobArtifactsBucket', {
      bucketName: config.emrServerless.jobArtifactsBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    const jobLogsBucket = new s3.Bucket(this, 'JobLogsBucket', {
      bucketName: config.emrServerless.jobLogsBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    const tableBucket = new cdk.CfnResource(this, 'TableBucket', {
      type: 'AWS::S3Tables::TableBucket',
      properties: {
        TableBucketName: config.s3Tables.tableBucketName,
      },
    });

    const tableBucketArn = cdk.Stack.of(this).formatArn({
      service: 's3tables',
      resource: 'bucket',
      resourceName: config.s3Tables.tableBucketName,
    });

    const emrExecutionRole = new iam.Role(this, 'EmrServerlessExecutionRole', {
      roleName: config.emrServerless.executionRoleName,
      assumedBy: new iam.ServicePrincipal('emr-serverless.amazonaws.com'),
    });

    emrExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'S3TablesAccess',
        actions: ['s3tables:*'],
        resources: [tableBucketArn, `${tableBucketArn}/table/*`],
      })
    );

    emrExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ReadJobArtifacts',
        actions: ['s3:GetObject'],
        resources: [`${jobArtifactsBucket.bucketArn}/*`],
      })
    );

    emrExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'WriteJobLogs',
        actions: ['s3:PutObject'],
        resources: [`${jobLogsBucket.bucketArn}/*`],
      })
    );

    const maximumCapacity: emrserverless.CfnApplication.MaximumAllowedResourcesProperty = {
      cpu: config.emrServerless.maximumCapacity.cpu,
      memory: config.emrServerless.maximumCapacity.memory,
      ...(config.emrServerless.maximumCapacity.disk
        ? { disk: config.emrServerless.maximumCapacity.disk }
        : {}),
    };

    const emrApplication = new emrserverless.CfnApplication(this, 'EmrServerlessApplication', {
      name: config.emrServerless.applicationName,
      releaseLabel: config.emrServerless.releaseLabel ?? DEFAULT_RELEASE_LABEL,
      type: 'SPARK',
      networkConfiguration: {
        subnetIds: emrSubnets.subnetIds,
        securityGroupIds: [emrSecurityGroup.securityGroupId],
      },
      maximumCapacity,
      initialCapacity: buildInitialCapacity(config.emrServerless),
      monitoringConfiguration: {
        s3MonitoringConfiguration: {
          logUri: `s3://${jobLogsBucket.bucketName}/emr-serverless/`,
        },
      },
    });
    emrApplication.node.addDependency(tableBucket);

    const emrServerlessApplicationArn = cdk.Stack.of(this).formatArn({
      service: 'emr-serverless',
      resource: '/applications',
      resourceName: emrApplication.ref,
    });

    this.tableBucketName = config.s3Tables.tableBucketName;
    this.tableBucketArn = tableBucketArn;
    this.emrServerlessApplicationId = emrApplication.ref;
    this.emrServerlessApplicationArn = emrServerlessApplicationArn;
    this.jobArtifactsBucketName = jobArtifactsBucket.bucketName;
    this.jobLogsBucketName = jobLogsBucket.bucketName;
    this.emrServerlessExecutionRoleArn = emrExecutionRole.roleArn;

    new cdk.CfnOutput(this, 'TableBucketName', { value: this.tableBucketName });
    new cdk.CfnOutput(this, 'TableBucketArn', { value: this.tableBucketArn });
    new cdk.CfnOutput(this, 'EmrServerlessApplicationId', { value: this.emrServerlessApplicationId });
    new cdk.CfnOutput(this, 'EmrServerlessApplicationArn', { value: this.emrServerlessApplicationArn });
    new cdk.CfnOutput(this, 'JobArtifactsBucketName', { value: this.jobArtifactsBucketName });
    new cdk.CfnOutput(this, 'JobLogsBucketName', { value: this.jobLogsBucketName });
    new cdk.CfnOutput(this, 'EmrServerlessExecutionRoleArn', {
      value: this.emrServerlessExecutionRoleArn,
    });
  }
}

function buildInitialCapacity(
  config: EmrServerlessConfig
): emrserverless.CfnApplication.InitialCapacityConfigKeyValuePairProperty[] | undefined {
  if (!config.initialCapacityEnabled) {
    return undefined;
  }
  if (!config.initialCapacity) {
    throw new Error(
      'S3TablesEmrServerless.emrServerless.initialCapacity is required when initialCapacityEnabled is true'
    );
  }

  return [
    {
      key: 'Driver',
      value: buildWorkerCapacity(config.initialCapacity.driver),
    },
    {
      key: 'Executor',
      value: buildWorkerCapacity(config.initialCapacity.executor),
    },
  ];
}

function buildWorkerCapacity(
  worker: EmrServerlessWorkerCapacity
): emrserverless.CfnApplication.InitialCapacityConfigProperty {
  const workerConfiguration: emrserverless.CfnApplication.WorkerConfigurationProperty = {
    cpu: worker.cpu,
    memory: worker.memory,
    ...(worker.disk ? { disk: worker.disk } : {}),
  };

  return {
    workerCount: worker.workerCount,
    workerConfiguration,
  };
}
