// RoadmapHub gateway: plays the role of the Application Load Balancer on this PC (as in Lab 8).
//  - Path-based routing: each path goes to the right service (three DIFFERENT services).
//  - Load balancing: requests for one service are shared round-robin between its REPLICAS.
//  - Health checks: GET /health on every replica every 3 s; unhealthy replicas get no traffic.
//  - Failover: if a replica refuses the connection, a GET is retried on the next healthy replica.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { PUBLIC_RULES, INTERNAL_RULES, route } = require('./routing');

const PUBLIC_PORT = Number(process.env.PUBLIC_PORT) || 8080;
const INTERNAL_PORT = Number(process.env.INTERNAL_PORT) || 8081;
const HEALTH_INTERVAL_MS = Number(process.env.HEALTH_INTERVAL_MS) || 3000;
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS) || 10000;
const STATIC_DIR = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : null;

function targets(envName, fallback) {
  return (process.env[envName] || fallback).split(',').map((t) => t.trim()).filter(Boolean)
    .map((url) => ({ url: new URL(url), healthy: true, served: 0, failures: 0 }));
}

const pools = {
  roadmap: { replicas: targets('ROADMAP_TARGETS', 'http://127.0.0.1:3001'), next: 0 },
  engagement: { replicas: targets('ENGAGEMENT_TARGETS', 'http://127.0.0.1:3002'), next: 0 },
  admin: { replicas: targets('ADMIN_TARGETS', 'http://127.0.0.1:3003'), next: 0 }
};

function log(event, data) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'INFO', service: 'gateway', event, ...data })}\n`);
}

// Round-robin over healthy replicas, skipping the ones in "tried".
function pick(service, tried = new Set()) {
  const pool = pools[service];
  for (let i = 0; i < pool.replicas.length; i += 1) {
    const replica = pool.replicas[(pool.next + i) % pool.replicas.length];
    if (replica.healthy && !tried.has(replica)) {
      pool.next = (pool.next + i + 1) % pool.replicas.length;
      return replica;
    }
  }
  return null;
}

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(body));
}

function forward(req, res, service, requestId, tried = new Set()) {
  const replica = pick(service, tried);
  if (!replica) {
    return sendJson(res, 503, { error: { code: 'SERVICE_UNAVAILABLE', message: `No healthy ${service} replica.` } });
  }
  tried.add(replica);
  const headers = {
    ...req.headers,
    host: replica.url.host,
    'x-request-id': requestId,
    'x-forwarded-for': req.socket.remoteAddress,
    'x-forwarded-proto': 'http'
  };
  const upstream = http.request({
    hostname: replica.url.hostname, port: replica.url.port, path: req.url, method: req.method, headers,
    timeout: UPSTREAM_TIMEOUT_MS
  }, (upRes) => {
    replica.served += 1;
    res.writeHead(upRes.statusCode, { ...upRes.headers, 'x-served-by': `${service}@${replica.url.port}` });
    upRes.pipe(res);
  });

  upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', (err) => {
    replica.failures += 1;
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
      if (replica.healthy) log('REPLICA_DOWN', { target: service, replica: replica.url.port, reason: err.code });
      replica.healthy = false;
      // Safe to repeat: GET/HEAD/OPTIONS have no side effects.
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !res.headersSent) {
        return forward(req, res, service, requestId, tried);
      }
    }
    if (!res.headersSent) {
      const timedOut = err.message === 'upstream timeout';
      sendJson(res, timedOut ? 504 : 502, {
        error: { code: timedOut ? 'UPSTREAM_TIMEOUT' : 'BAD_GATEWAY', message: 'The service did not answer. Please try again.' }
      });
    } else {
      res.destroy();
    }
  });
  req.pipe(upstream);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function serveStatic(req, res) {
  if (!STATIC_DIR || !['GET', 'HEAD'].includes(req.method)) {
    return sendJson(res, 404, { error: { code: 'ROUTE_NOT_FOUND', message: 'This route does not exist.' } });
  }
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.resolve(STATIC_DIR, `.${urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath}`);
  if (!file.startsWith(STATIC_DIR + path.sep) && file !== STATIC_DIR) {
    return sendJson(res, 404, { error: { code: 'ROUTE_NOT_FOUND', message: 'This route does not exist.' } });
  }
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: { code: 'ROUTE_NOT_FOUND', message: 'This route does not exist.' } });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

function healthSummary() {
  const services = {};
  for (const [name, pool] of Object.entries(pools)) {
    services[name] = {
      healthy: pool.replicas.filter((r) => r.healthy).length,
      total: pool.replicas.length
    };
  }
  const ok = Object.values(services).every((s) => s.healthy > 0);
  return { ok, body: { status: ok ? 'ok' : 'degraded', services } };
}

function handler(rules, isPublic) {
  return (req, res) => {
    const incoming = req.headers['x-request-id'];
    const requestId = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    const urlPath = req.url.split('?')[0];

    if (isPublic && urlPath === '/api/health') {
      const { ok, body } = healthSummary();
      return sendJson(res, ok ? 200 : 503, body, { 'x-request-id': requestId });
    }
    if (!isPublic && urlPath === '/_gateway/stats') {
      const stats = {};
      for (const [name, pool] of Object.entries(pools)) {
        stats[name] = pool.replicas.map((r) => ({ replica: r.url.port, healthy: r.healthy, served: r.served, failures: r.failures }));
      }
      return sendJson(res, 200, stats);
    }

    const rule = route(rules, urlPath);
    if (rule && rule.block) {
      return sendJson(res, 404, { error: { code: 'ROUTE_NOT_FOUND', message: 'This route does not exist.' } });
    }
    if (!rule) {
      return isPublic && !urlPath.startsWith('/api/')
        ? serveStatic(req, res)
        : sendJson(res, 404, { error: { code: 'ROUTE_NOT_FOUND', message: 'This route does not exist.' } });
    }
    forward(req, res, rule.service, requestId);
  };
}

// Health checks: GET /health on every replica.
function checkReplica(service, replica) {
  const req = http.get({ hostname: replica.url.hostname, port: replica.url.port, path: '/health', timeout: 1000 }, (res) => {
    res.resume();
    const healthy = res.statusCode === 200;
    if (healthy !== replica.healthy) log(healthy ? 'REPLICA_UP' : 'REPLICA_DOWN', { target: service, replica: replica.url.port });
    replica.healthy = healthy;
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', () => {
    if (replica.healthy) log('REPLICA_DOWN', { target: service, replica: replica.url.port, reason: 'health check failed' });
    replica.healthy = false;
  });
}

function checkAll() {
  for (const [service, pool] of Object.entries(pools)) {
    for (const replica of pool.replicas) checkReplica(service, replica);
  }
}

checkAll();
const timer = setInterval(checkAll, HEALTH_INTERVAL_MS);

const publicServer = http.createServer(handler(PUBLIC_RULES, true)).listen(PUBLIC_PORT, () => {
  log('GATEWAY_STARTED', { listener: 'public', port: PUBLIC_PORT, targets: Object.fromEntries(
    Object.entries(pools).map(([n, p]) => [n, p.replicas.map((r) => r.url.port)])) });
});
const internalServer = http.createServer(handler(INTERNAL_RULES, false)).listen(INTERNAL_PORT, '127.0.0.1', () => {
  log('GATEWAY_STARTED', { listener: 'internal', port: INTERNAL_PORT });
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(timer);
    publicServer.close();
    internalServer.close(() => process.exit(0));
  });
}
