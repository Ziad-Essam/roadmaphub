// Called by create-secrets.sh. Uses the AWS SDK so secret values never pass through the shell.
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const {
  SecretsManagerClient, CreateSecretCommand, PutSecretValueCommand, DescribeSecretCommand
} = require(path.join(ROOT, 'node_modules', '@aws-sdk', 'client-secrets-manager'));

const client = new SecretsManagerClient({});
const say = (msg) => console.log(`  \x1b[32mOK\x1b[0m    ${msg}`);

async function exists(name) {
  try { await client.send(new DescribeSecretCommand({ SecretId: name })); return true; } catch { return false; }
}
async function save(name, value, { keepIfExists = false } = {}) {
  if (await exists(name)) {
    if (keepIfExists) return say(`${name} (kept)`);
    await client.send(new PutSecretValueCommand({ SecretId: name, SecretString: JSON.stringify(value) }));
    return say(`${name} updated`);
  }
  await client.send(new CreateSecretCommand({ Name: name, SecretString: JSON.stringify(value) }));
  return say(`${name} created`);
}

async function main() {
  // The signing key pair is made once and kept, so existing logins stay valid.
  // Set ROTATE_JWT=true to replace it (every user must log in again).
  const rotate = process.env.ROTATE_JWT === 'true';
  if (rotate || !(await exists('roadhub/jwt-private'))) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
    await save('roadhub/jwt-private', { PRIVATE_KEY: privateKey });
    await save('roadhub/jwt-public', { PUBLIC_KEY: publicKey });
  } else {
    say('roadhub/jwt-private (kept)');
    say('roadhub/jwt-public (kept)');
  }
  await save('roadhub/internal', { INTERNAL_SIGNING_KEY: crypto.randomBytes(48).toString('hex') }, { keepIfExists: !rotate });
  await save('roadhub/resend', {
    RESEND_API_KEY: process.env.RESEND_API_KEY || 'not-set',
    RESEND_FROM: process.env.RESEND_FROM || 'RoadmapHub <onboarding@resend.dev>'
  });
  await save('roadhub/turnstile', {
    // Cloudflare's public test key: always passes. Use the real key from infra/.env for production.
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA'
  });
  if (!process.env.RESEND_API_KEY) console.log('  ...   RESEND_API_KEY not set in infra/.env: emails will be recorded as "skipped".');
}

main().catch((e) => { console.error(`  FAIL  secrets: ${e.name}: ${e.message}`); process.exit(1); });
