import * as fs from 'fs';
import * as path from 'path';

export interface VpcConfig {
  cidr: string;
  natGateways: number;
  privateSubnetCidrMask: number;
  publicSubnetCidrMask: number;
  azCount: number;
}

export interface S3TablesConfig {
  tableBucketName: string;
}

export interface EmrServerlessMaximumCapacity {
  cpu: string;
  memory: string;
  disk?: string;
}

export interface EmrServerlessWorkerCapacity {
  workerCount: number;
  cpu: string;
  memory: string;
  disk?: string;
}

export interface EmrServerlessInitialCapacity {
  driver: EmrServerlessWorkerCapacity;
  executor: EmrServerlessWorkerCapacity;
}

export interface EmrServerlessConfig {
  applicationName: string;
  releaseLabel?: string;
  usePrivateSubnets: boolean;
  jobArtifactsBucketName: string;
  jobLogsBucketName: string;
  executionRoleName: string;
  initialCapacityEnabled?: boolean;
  initialCapacity?: EmrServerlessInitialCapacity;
  maximumCapacity: EmrServerlessMaximumCapacity;
}

export interface S3TablesEmrServerlessConfig {
  vpc: VpcConfig;
  s3Tables: S3TablesConfig;
  emrServerless: EmrServerlessConfig;
}

export interface OleanderIamConfig {
  organizationId: string;
  roleNames: {
    s3tablesAccessRole: string;
    emrControllerRole: string;
  };
}

export interface AwsEnvConfig {
  account: string;
  region: string;
}

export interface AppConfig {
  aws: AwsEnvConfig;
  S3TablesEmrServerless: S3TablesEmrServerlessConfig;
  OleanderIAM?: OleanderIamConfig;
}

export function loadConfig(envName: string): AppConfig {
  const configPath = path.resolve(process.cwd(), 'config', `${envName}.json`);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as AppConfig;

  const awsEnv = requireObject(parsed.aws, 'aws');
  requireString(awsEnv.account, 'aws.account');
  requireString(awsEnv.region, 'aws.region');

  const s3Stack = requireObject(parsed.S3TablesEmrServerless, 'S3TablesEmrServerless');
  const vpc = requireObject(s3Stack.vpc, 'S3TablesEmrServerless.vpc');
  requireString(vpc.cidr, 'S3TablesEmrServerless.vpc.cidr');
  requireNumber(vpc.natGateways, 'S3TablesEmrServerless.vpc.natGateways');
  requireNumber(vpc.privateSubnetCidrMask, 'S3TablesEmrServerless.vpc.privateSubnetCidrMask');
  requireNumber(vpc.publicSubnetCidrMask, 'S3TablesEmrServerless.vpc.publicSubnetCidrMask');
  requirePositiveInteger(vpc.azCount, 'S3TablesEmrServerless.vpc.azCount');

  const s3Tables = requireObject(s3Stack.s3Tables, 'S3TablesEmrServerless.s3Tables');
  requireString(s3Tables.tableBucketName, 'S3TablesEmrServerless.s3Tables.tableBucketName');

  const emr = requireObject(s3Stack.emrServerless, 'S3TablesEmrServerless.emrServerless');
  requireString(emr.applicationName, 'S3TablesEmrServerless.emrServerless.applicationName');
  requireBoolean(emr.usePrivateSubnets, 'S3TablesEmrServerless.emrServerless.usePrivateSubnets');
  requireString(emr.jobArtifactsBucketName, 'S3TablesEmrServerless.emrServerless.jobArtifactsBucketName');
  requireString(emr.jobLogsBucketName, 'S3TablesEmrServerless.emrServerless.jobLogsBucketName');
  requireString(emr.executionRoleName, 'S3TablesEmrServerless.emrServerless.executionRoleName');
  const maximumCapacity = requireObject(emr.maximumCapacity, 'S3TablesEmrServerless.emrServerless.maximumCapacity');
  requireString(maximumCapacity.cpu, 'S3TablesEmrServerless.emrServerless.maximumCapacity.cpu');
  requireString(maximumCapacity.memory, 'S3TablesEmrServerless.emrServerless.maximumCapacity.memory');

  if (parsed.OleanderIAM) {
    const oleander = requireObject(parsed.OleanderIAM, 'OleanderIAM');
    requireString(oleander.organizationId, 'OleanderIAM.organizationId');
    const roleNames = requireObject(oleander.roleNames, 'OleanderIAM.roleNames');
    requireString(roleNames.s3tablesAccessRole, 'OleanderIAM.roleNames.s3tablesAccessRole');
    requireString(roleNames.emrControllerRole, 'OleanderIAM.roleNames.emrControllerRole');
  }

  return parsed;
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(`Expected object at ${path}`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Expected non-empty string at ${path}`);
  }
  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Expected number at ${path}`);
  }
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Expected boolean at ${path}`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Expected positive integer at ${path}`);
  }
  return value;
}
