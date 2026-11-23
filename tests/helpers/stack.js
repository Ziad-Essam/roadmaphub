// Test helper: starts the three services (and optionally the gateway) as SEPARATE
// Node.js processes, exactly as on a team PC, and stops them afterwards.
const { spawn } = require('child_process');
const path = require('path');
const { AWS_ENV } = require('./aws');

const ROOT = path.join(__dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(url, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error(`${url} did not start`);
}

function start(name, script, env, logs) {
  const child = spawn(process.execPath, [script], {
    cwd: path.dirname(script), env: { ...process.env, ...AWS_ENV, ...env }, stdio: ['ignore', 'pipe', 'pipe']
  });
  const lines = [];
  logs[name] = lines;
  const collect = (chunk) => chunk.toString().split('\n').filter(Boolean).forEach((l) => lines.push(l));
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  return child;
}

// replicas: { roadmap: 1, engagement: 1, admin: 1 }
async function startStack({ base = 4100, replicas = {}, gateway = false, env = {} } = {}) {
  const counts = { roadmap: 1, engagement: 1, admin: 1, ...replicas };
  const offsets = { roadmap: 10, engagement: 20, admin: 30 };
  const ports = {};
  for (const svc of Object.keys(counts)) {
    ports[svc] = Array.from({ length: counts[svc] }, (_, i) => base + offsets[svc] + i);
  }
  const gatewayPorts = { public: base + 80, internal: base + 81 };
  // Services call each other through the internal gateway when it runs, else directly.
  const urls = gateway
    ? { ROADMAP_URL: `http://127.0.0.1:${gatewayPorts.internal}`, ENGAGEMENT_URL: `http://127.0.0.1:${gatewayPorts.internal}`, ADMIN_URL: `http://127.0.0.1:${gatewayPorts.internal}` }
    : { ROADMAP_URL: `http://127.0.0.1:${ports.roadmap[0]}`, ENGAGEMENT_URL: `http://127.0.0.1:${ports.engagement[0]}`, ADMIN_URL: `http://127.0.0.1:${ports.admin[0]}` };

  const logs = {};
  const children = {};
  for (const [svc, list] of Object.entries(ports)) {
    for (const port of list) {
      children[`${svc}@${port}`] = start(`${svc}@${port}`, path.join(ROOT, 'services', `${svc}-service`, 'server.js'),
        { PORT: String(port), SERVICE_NAME: svc, NODE_ENV: 'test', ...urls, ...env }, logs);
    }
  }
  await Promise.all(Object.values(ports).flat().map((p) => waitFor(`http://127.0.0.1:${p}/health`)));

  if (gateway) {
    children.gateway = start('gateway', path.join(ROOT, 'gateway', 'server.js'), {
      PUBLIC_PORT: String(gatewayPorts.public), INTERNAL_PORT: String(gatewayPorts.internal), HEALTH_INTERVAL_MS: '500',
      ROADMAP_TARGETS: ports.roadmap.map((p) => `http://127.0.0.1:${p}`).join(','),
      ENGAGEMENT_TARGETS: ports.engagement.map((p) => `http://127.0.0.1:${p}`).join(','),
      ADMIN_TARGETS: ports.admin.map((p) => `http://127.0.0.1:${p}`).join(',')
    }, logs);
    await waitFor(`http://127.0.0.1:${gatewayPorts.public}/api/health`);
  }

  return {
    ports,
    gatewayPorts,
    logs,
    url: (svc, i = 0) => `http://127.0.0.1:${ports[svc][i]}`,
    gatewayUrl: `http://127.0.0.1:${gatewayPorts.public}`,
    internalGatewayUrl: `http://127.0.0.1:${gatewayPorts.internal}`,
    kill: (key) => children[key].kill('SIGKILL'),
    async stop() {
      for (const child of Object.values(children)) child.kill('SIGTERM');
      await sleep(200);
    }
  };
}

module.exports = { startStack, sleep };
