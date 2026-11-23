// Which service answers which path. Order matters: the first match wins.
// Public listener (8080, the browser): /internal is never forwarded.
const PUBLIC_RULES = [
  { match: /^\/internal(\/|$)/, block: true },
  { match: /^\/api\/features\/[^/]+\/(votes|comments)(\/|$)/, service: 'engagement' },
  { match: /^\/api\/comments(\/|$)/, service: 'engagement' },
  { match: /^\/api\/me\/(votes|notifications)(\/|$)/, service: 'engagement' },
  { match: /^\/api\/engagement(\/|$)/, service: 'engagement' },
  { match: /^\/api\/(auth|admin)(\/|$)/, service: 'admin' },
  { match: /^\/api\/(features|categories|roadmap)(\/|$)/, service: 'roadmap' },
  { match: /^\/api\/me\/features(\/|$)/, service: 'roadmap' }
];

// Internal listener (8081, service-to-service only, like an internal load balancer).
const INTERNAL_RULES = [
  { match: /^\/internal\/features(\/|$)/, service: 'roadmap' },
  { match: /^\/internal\/engagement(\/|$)/, service: 'engagement' },
  { match: /^\/internal\/(identity|alerts)(\/|$)/, service: 'admin' }
];

function route(rules, path) {
  return rules.find((rule) => rule.match.test(path)) || null;
}

module.exports = { PUBLIC_RULES, INTERNAL_RULES, route };
