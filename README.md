# s3tables-emr-serverless-cdk

CDK project for Oleander users to create an S3 Tables (Iceberg) table bucket and an EMR Serverless Spark application.  
Optionally, it can also deploy an `OleanderIAM` stack so Oleander can submit and control EMR Serverless jobs (for example via `oleander-cli`).

## Usage

### 1. Prerequisites

- Node.js 20+
- Yarn 1.x (`yarn@1.22.22`)
- AWS credentials for target account
- CDK bootstrapped in target account/region

```bash
cdk bootstrap aws://<account-id>/<region>
```

### 2. Install

```bash
yarn install
```

### 3. Configure environment

Create `config/{env}.json` from `config/example.json` (for example `config/sandbox.json`) and set:

- `aws.account`, `aws.region`
- `S3TablesEmrServerless` values (VPC, table bucket, EMR app, artifacts/log buckets)
- Optional `OleanderIAM` section (include to deploy Oleander roles, remove to skip)

### 4. Run CDK commands

Always pass the environment context: `-c env={env}`.
There must be a matching `config/{env}.json` file.

```bash
# Compile TypeScript
yarn build

# Synthesize
yarn cdk synth -c env={env}

# Deploy core stack
yarn cdk deploy S3TablesEmrServerless -c env={env}

# Optionally deploy Oleander IAM stack
yarn cdk deploy OleanderIAM -c env={env}
```
