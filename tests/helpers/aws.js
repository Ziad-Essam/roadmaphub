// Test helper: AWS settings for the local emulator (Floci on a team PC, moto in the sandbox).
const AWS_ENV = {
  AWS_REGION: 'us-east-1',
  AWS_ENDPOINT_URL: process.env.AWS_ENDPOINT_URL || 'http://127.0.0.1:4566',
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test'
};
Object.assign(process.env, AWS_ENV);

const {
  SecretsManagerClient, CreateSecretCommand, PutSecretValueCommand, DescribeSecretCommand
} = require('@aws-sdk/client-secrets-manager');

async function ensureSecret(name, value) {
  const client = new SecretsManagerClient({});
  const text = JSON.stringify(value);
  try {
    await client.send(new DescribeSecretCommand({ SecretId: name }));
    await client.send(new PutSecretValueCommand({ SecretId: name, SecretString: text }));
  } catch (e) {
    if (e.name !== 'ResourceNotFoundException') throw e;
    await client.send(new CreateSecretCommand({ Name: name, SecretString: text }));
  }
}

module.exports = { AWS_ENV, ensureSecret };
