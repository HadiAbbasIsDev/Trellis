/**
 * Generate the benchmark vault: ~64 memory nodes for "Shiftly", a fictional
 * mid-size TypeScript SaaS (shift scheduling for hourly teams). The vault is
 * NOT about this repo on purpose — eval questions need unambiguous answers,
 * and grounding them in a foreign codebase prevents accidental leakage from
 * Trellis's own dogfood vault or docs.
 *
 * The .md files are committed; this script exists so the vault is
 * reproducible and reviewable as data. Rerunning it rewrites bench-vault/
 * deterministically (fixed ids, fixed timestamps).
 *
 * Usage: npx tsx packages/eval/src/gen.ts
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  NODE_TYPES,
  TYPE_FOLDER,
  serializeNode,
  type Edge,
  type MemoryNode,
  type NodeType,
} from '../../core/src/index';

export const BENCH_VAULT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'bench-vault',
);

interface Spec {
  type: NodeType;
  id: string;
  title: string;
  summary: string;
  body?: string;
  tags?: string[];
  confidence?: number;
  date: string; // ISO day; expanded to created/updated/last_confirmed
  edges?: Edge[];
}

/**
 * Vocabulary discipline (checked by packages/eval/test/eval.test.ts):
 * - Negative-question terms (kubernetes, kafka, webpack, opentelemetry…)
 *   must not appear anywhere in the vault, so "nothing relevant" questions
 *   have a defensible ground truth.
 * - Multi-hop expected nodes must not contain their question's terms even as
 *   substrings — otherwise a grep would find them directly and the question
 *   would silently degrade into a lookup.
 */
export const NODES: Spec[] = [
  // ------------------------------------------------------------- decisions
  // Chain 1 (3 nodes): mongodb -> postgres jsonb -> normalized tables
  {
    type: 'decision',
    id: 'mongodb-for-flexible-schedule-documents',
    title: 'MongoDB for flexible schedule documents',
    summary:
      'Schedules vary wildly per tenant, so store them as MongoDB documents rather than forcing one relational shape.',
    body:
      'Every tenant configures different roles, breaks, and rules, and the MVP needs to ship. One document per [[rota]] keeps reads simple while the model is still moving.',
    tags: ['storage', 'mvp'],
    confidence: 0.85,
    date: '2025-06-03',
  },
  {
    type: 'decision',
    id: 'move-schedules-to-postgres-jsonb',
    title: 'Move schedule storage to Postgres jsonb',
    summary:
      'Moved schedule storage to Postgres jsonb so schedules join with tenant and billing tables in one database.',
    body:
      'Running MongoDB next to Postgres doubled backup and failover work, and cross-store joins for billing were hand-rolled in app code. Jsonb keeps the flexible shape but in the same database as everything else.',
    tags: ['storage'],
    confidence: 0.85,
    date: '2025-10-07',
    edges: [
      { rel: 'supersedes', to: 'mongodb-for-flexible-schedule-documents' },
      { rel: 'depends_on', to: 'postgres-primary-cluster' },
    ],
  },
  {
    type: 'decision',
    id: 'normalize-schedule-tables-drop-jsonb',
    title: 'Normalize schedule tables and drop jsonb blobs',
    summary:
      'Shift and rota data live in first-class relational tables now; jsonb blobs made rotation lookups unindexable.',
    body:
      'One jsonb document per [[rota]] meant every rotation lookup re-parsed the blob and no index could help. Executed in [[session-2026-01-22-schedule-normalization]].',
    tags: ['storage'],
    confidence: 0.9,
    date: '2026-01-22',
    edges: [
      { rel: 'supersedes', to: 'move-schedules-to-postgres-jsonb' },
      { rel: 'observed_in', to: 'session-2026-01-22-schedule-normalization' },
    ],
  },
  // Chain 2 (2 nodes): jwt localStorage -> httpOnly cookies
  {
    type: 'decision',
    id: 'jwt-in-localstorage-for-spa-auth',
    title: 'JWT in localStorage for SPA auth',
    summary:
      'Keep the JWT in localStorage so the SPA can attach it as a bearer header; simplest thing that works across subdomains.',
    body: 'Access token 15 min, refresh token 30 days, both in localStorage keyed per tenant.',
    tags: ['auth'],
    confidence: 0.8,
    date: '2025-05-06',
  },
  {
    type: 'decision',
    id: 'httponly-session-cookies-replace-jwt-localstorage',
    title: 'httpOnly session cookies replace JWT in localStorage',
    summary:
      'Auth moved to httpOnly SameSite cookies; an XSS can no longer read localStorage and walk away with a JWT.',
    body:
      'A pentest showed any injected script could read the JWT. Cookies with SameSite=Lax plus a CSRF header close that class of bug. Rolled out in [[session-2025-11-03-auth-migration]].',
    tags: ['auth', 'security'],
    confidence: 0.95,
    date: '2025-11-03',
    edges: [
      { rel: 'supersedes', to: 'jwt-in-localstorage-for-spa-auth' },
      { rel: 'observed_in', to: 'session-2025-11-03-auth-migration' },
      { rel: 'depends_on', to: 'auth-service' },
    ],
  },
  // Chain 3 (2 nodes): instant proration -> monthly true-up
  {
    type: 'decision',
    id: 'instant-proration-on-seat-updates',
    title: 'Instant proration on seat updates',
    summary: 'Seat adds and removals prorate immediately on the current invoice.',
    body: 'Customers see the cost of a seat the moment they add it; no surprise at period end.',
    tags: ['billing'],
    confidence: 0.8,
    date: '2025-06-18',
    edges: [{ rel: 'relates_to', to: 'seat' }],
  },
  {
    type: 'decision',
    id: 'per-seat-pricing-with-monthly-true-up',
    title: 'Per-seat pricing with monthly true-up',
    summary:
      'Bill per active seat with a monthly true-up job instead of instant proration on each seat event.',
    body:
      'Stripe computes every adjustment itself now; see [[stripe-disagreed-on-proration-rounding]] for why we stopped doing the math. The true-up job counts active seats on the last day and reports the quantity.',
    tags: ['billing'],
    confidence: 0.9,
    date: '2025-12-16',
    edges: [
      { rel: 'supersedes', to: 'instant-proration-on-seat-updates' },
      { rel: 'depends_on', to: 'stripe-for-subscription-billing' },
    ],
  },
  {
    type: 'decision',
    id: 'fastify-over-express-for-api',
    title: 'Fastify over Express for the API',
    summary:
      'Fastify won on schema validation and roughly double the throughput of Express in our route benchmarks.',
    body:
      'JSON schema validation at the route boundary comes for free, and plugin encapsulation maps cleanly onto tenant scoping. Express middleware ordering bugs bit us twice in the prototype.',
    tags: ['stack', 'api'],
    confidence: 0.9,
    date: '2025-04-02',
  },
  {
    type: 'decision',
    id: 'stripe-for-subscription-billing',
    title: 'Stripe for subscription billing',
    summary:
      'Stripe Billing runs subscriptions, invoices, and payment retries; we never store card data ourselves.',
    body: 'Dunning, tax, and SCA come managed. The integration surface we own is [[billing-service]] plus [[webhook-dispatcher]].',
    tags: ['billing', 'stack'],
    confidence: 0.95,
    date: '2025-05-14',
  },
  {
    type: 'decision',
    id: 'bullmq-on-redis-for-background-jobs',
    title: 'BullMQ on Redis for background jobs',
    summary:
      'BullMQ on Redis runs reminders, rota generation, and exports as retryable background jobs.',
    body: 'Delayed jobs and per-tenant rate limiting out of the box; one less piece of infrastructure since Redis is already there for caching.',
    tags: ['stack', 'workers'],
    confidence: 0.9,
    date: '2025-06-10',
  },
  {
    type: 'decision',
    id: 'blue-green-deploys-on-ecs',
    title: 'Blue-green deploys on ECS',
    summary:
      'Two ECS services swap behind the ALB; a bad release rolls back by flipping the target group, not by rebuilding.',
    body: 'Cutover is a target-group flip, so rollback is seconds. Set up in [[session-2026-03-14-deploy-pipeline]].',
    tags: ['deploy'],
    confidence: 0.9,
    date: '2026-03-14',
    edges: [{ rel: 'observed_in', to: 'session-2026-03-14-deploy-pipeline' }],
  },
  {
    type: 'decision',
    id: 'sendgrid-for-transactional-email',
    title: 'SendGrid for transactional email',
    summary:
      'SendGrid delivers reminder and invoice emails; dynamic templates keep copy edits out of deploys.',
    body: 'Marketing mail stays in a separate tool on purpose — transactional reputation must not share a sender domain with campaigns.',
    tags: ['stack', 'email'],
    confidence: 0.85,
    date: '2025-07-08',
  },
  {
    type: 'decision',
    id: 'read-replica-for-reporting-queries',
    title: 'Read replica for reporting queries',
    summary:
      'Reporting reads hit a Postgres replica so nightly payroll exports stop starving the primary of IO.',
    body:
      'The payroll export scan starved the primary and p95 write latency tripled during the nightly window. Replica lag under ten seconds is acceptable for reports.',
    tags: ['storage', 'performance'],
    confidence: 0.9,
    date: '2026-02-24',
    edges: [{ rel: 'depends_on', to: 'postgres-primary-cluster' }],
  },
  {
    type: 'decision',
    id: 'feature-flags-in-postgres-not-launchdarkly',
    title: 'Feature flags in Postgres, not LaunchDarkly',
    summary:
      'Feature flags live in a Postgres table behind a 30-second cache; LaunchDarkly cost and SDK weight were not justified.',
    body: 'A flags table plus one admin page covers per-tenant rollout. Revisit only if we need percentage rollouts with client-side evaluation.',
    tags: ['stack'],
    confidence: 0.85,
    date: '2025-09-09',
  },
  {
    type: 'decision',
    id: 'kysely-over-prisma-for-database-access',
    title: 'Kysely over Prisma for database access',
    summary:
      'Kysely gives typed SQL without Prisma\'s query engine binary and migration lock-in.',
    body: 'We write real SQL and keep the types. Prisma\'s engine added 50 MB to the image and its migration diffing fought our hand-written migrations.',
    tags: ['stack', 'storage'],
    confidence: 0.85,
    date: '2025-08-05',
  },
  {
    type: 'decision',
    id: 'nightly-scrubbed-production-snapshot-for-staging',
    title: 'Nightly scrubbed production snapshot for staging',
    summary:
      'Staging restores a nightly production snapshot with employee data masked during the restore.',
    body: 'Realistic data volume without the exposure; masking runs inside the restore job before the database accepts connections.',
    tags: ['deploy', 'privacy'],
    confidence: 0.85,
    date: '2026-04-08',
    edges: [{ rel: 'relates_to', to: 'pii-never-in-logs-or-analytics' }],
  },

  // ------------------------------------------------------------ constraints
  {
    type: 'constraint',
    id: 'stripe-webhooks-must-be-idempotent',
    title: 'Stripe webhook handlers must be idempotent',
    summary:
      'Every webhook handler must tolerate duplicate delivery; Stripe retries events for up to 72 hours.',
    body: 'Store the Stripe event id before side effects and skip on conflict. Established after the double-invoice incident in [[session-2025-12-10-billing-hardening]].',
    tags: ['billing', 'reliability'],
    confidence: 1,
    date: '2025-12-10',
    edges: [{ rel: 'observed_in', to: 'session-2025-12-10-billing-hardening' }],
  },
  {
    type: 'constraint',
    id: 'pii-never-in-logs-or-analytics',
    title: 'PII never reaches logs or analytics',
    summary:
      'Employee names, emails, and phone numbers must never reach logs or third-party analytics.',
    body: 'Applies to error breadcrumbs and product analytics events too. Redact at the logger, not at call sites — call sites forget.',
    tags: ['privacy', 'compliance'],
    confidence: 1,
    date: '2025-08-20',
  },
  {
    type: 'constraint',
    id: 'soc2-audit-trail-for-admin-actions',
    title: 'SOC 2 audit trail for admin actions',
    summary:
      'Every admin mutation writes an audit row: actor, tenant, action, before and after values.',
    body: 'Auditors ask for the trail every cycle. The audit write happens in the same transaction as the mutation — a mutation without its audit row must not commit.',
    tags: ['compliance'],
    confidence: 1,
    date: '2026-02-11',
  },
  {
    type: 'constraint',
    id: 'public-api-v1-is-frozen',
    title: 'Public API v1 is frozen',
    summary:
      'No breaking updates to /v1 endpoints; additive fields only, breaking shape moves wait for /v2.',
    body: 'Three payroll partners integrate against /v1 and upgrade slowly. Removing or renaming a field is an incident, not a refactor.',
    tags: ['api', 'compat'],
    confidence: 1,
    date: '2026-01-28',
  },
  {
    type: 'constraint',
    id: 'worker-jobs-must-be-safe-to-run-twice',
    title: 'Worker jobs must be safe to run twice',
    summary:
      'Handlers must be idempotent: retries and stalled recovery will re-execute them with the same payload.',
    body: 'BullMQ re-delivers after a crash or stall, so a handler that ran halfway will run again. Guard side effects with natural idempotency or an outbox row.',
    tags: ['workers', 'reliability'],
    confidence: 0.95,
    date: '2025-10-21',
    edges: [{ rel: 'relates_to', to: 'bullmq-on-redis-for-background-jobs' }],
  },
  {
    type: 'constraint',
    id: 'eu-tenant-data-stays-in-eu-region',
    title: 'EU tenant data stays in the EU region',
    summary:
      'EU tenants are pinned to the Frankfurt stack; their data never replicates to us-east.',
    body: 'Enforced at signup: [[tenant-provisioner]] picks the stack from the billing address, and Frankfurt tenants never leave eu-central-1. Contract clause for two enterprise customers.',
    tags: ['compliance', 'infra'],
    confidence: 1,
    date: '2026-05-20',
  },
  {
    type: 'constraint',
    id: 'secrets-live-in-ssm-not-the-repo',
    title: 'Secrets live in SSM, not the repo',
    summary:
      'Secrets belong in AWS SSM Parameter Store; the repo and CI logs must never contain one.',
    body: 'Task definitions reference SSM paths. A leaked value means rotation plus an incident write-up, even for staging.',
    tags: ['security', 'infra'],
    confidence: 1,
    date: '2025-07-15',
  },

  // ------------------------------------------------------------ components
  {
    type: 'component',
    id: 'api-gateway-service',
    title: 'API gateway service',
    summary:
      'Fastify app terminating all public traffic; validates payloads with zod and enforces tenant scoping on every route.',
    body: 'Every handler receives a request-scoped tenant context; forgetting it fails the request in middleware, not in review.',
    tags: ['api'],
    confidence: 0.9,
    date: '2025-05-20',
    edges: [
      { rel: 'implements', to: 'fastify-over-express-for-api' },
      { rel: 'depends_on', to: 'auth-service' },
    ],
  },
  {
    type: 'component',
    id: 'auth-service',
    title: 'Auth service',
    summary:
      'Issues and validates sessions; owns sign-in, SSO via SAML, and the permissions model.',
    body: 'Session records live in Redis with a Postgres fallback. SAML metadata is stored per tenant.',
    tags: ['auth'],
    confidence: 0.9,
    date: '2025-05-22',
  },
  {
    type: 'component',
    id: 'scheduler-engine',
    title: 'Scheduler engine',
    summary:
      'Generates rota assignments from availability and labor rules; the core algorithm of the product.',
    body: 'A constraint solver over availability windows. The hot path is pure functions so property tests can hammer it.',
    tags: ['core'],
    confidence: 0.9,
    date: '2025-06-01',
    edges: [{ rel: 'depends_on', to: 'postgres-primary-cluster' }],
  },
  {
    type: 'component',
    id: 'billing-service',
    title: 'Billing service',
    summary:
      'Wraps Stripe: subscription lifecycle, seat counting, invoice preview, and dunning state.',
    body: 'The only module allowed to call Stripe. Everything else asks it.',
    tags: ['billing'],
    confidence: 0.9,
    date: '2025-06-05',
    edges: [
      { rel: 'implements', to: 'stripe-for-subscription-billing' },
      { rel: 'relates_to', to: 'seat' },
    ],
  },
  {
    type: 'component',
    id: 'webhook-dispatcher',
    title: 'Webhook dispatcher',
    summary:
      'Verifies Stripe signatures, dedupes event ids, and fans events out to internal handlers.',
    body: 'Signature check first, then an insert-or-skip on the event id, then dispatch. Handlers run via [[bullmq-on-redis-for-background-jobs]].',
    tags: ['billing'],
    confidence: 0.9,
    date: '2025-06-20',
    edges: [
      { rel: 'implements', to: 'stripe-webhooks-must-be-idempotent' },
      { rel: 'relates_to', to: 'billing-service' },
    ],
  },
  {
    type: 'component',
    id: 'notification-worker',
    title: 'Notification worker',
    summary:
      'BullMQ consumer that sends upcoming-rota reminders and swap alerts over email and push.',
    body: 'Sends in per-tenant batches and respects each user\'s quiet hours.',
    tags: ['workers'],
    confidence: 0.9,
    date: '2025-07-02',
    edges: [
      { rel: 'depends_on', to: 'bullmq-on-redis-for-background-jobs' },
      { rel: 'depends_on', to: 'sendgrid-for-transactional-email' },
      { rel: 'relates_to', to: 'swap-request' },
    ],
  },
  {
    type: 'component',
    id: 'tenant-provisioner',
    title: 'Tenant provisioner',
    summary:
      'Creates the schema, seat allocation, and default rota templates when a new organization signs up.',
    body: 'Runs as a saga; every step retries independently and a failed step never leaves a half-created org visible.',
    tags: ['core'],
    confidence: 0.9,
    date: '2025-07-20',
    edges: [{ rel: 'relates_to', to: 'tenant' }],
  },
  {
    type: 'component',
    id: 'reporting-pipeline',
    title: 'Reporting pipeline',
    summary:
      'Builds wage and coverage exports nightly per tenant, reading only from the replica.',
    body: 'Long scans are fine here; the replica absorbs them.',
    tags: ['reporting'],
    confidence: 0.9,
    date: '2025-08-12',
    edges: [
      { rel: 'depends_on', to: 'read-replica-for-reporting-queries' },
      { rel: 'relates_to', to: 'payroll-export' },
    ],
  },
  {
    type: 'component',
    id: 'redis-cache-layer',
    title: 'Redis cache layer',
    summary:
      'Redis holds session cache, rate-limit counters, and BullMQ state; maxmemory policy is noeviction.',
    body: 'Sized at 4 GB with alarms at 80% utilization. BullMQ shares this instance deliberately — one fewer moving part.',
    tags: ['infra'],
    confidence: 0.9,
    date: '2025-06-12',
    edges: [{ rel: 'relates_to', to: 'bullmq-on-redis-for-background-jobs' }],
  },
  {
    type: 'component',
    id: 'postgres-primary-cluster',
    title: 'Postgres primary cluster',
    summary: 'RDS Postgres 16 primary with one replica; all tenant data lives here.',
    body: 'PgBouncer fronts it in transaction mode. Connection budget: 80 for the API, 40 for workers.',
    tags: ['infra', 'storage'],
    confidence: 0.9,
    date: '2025-05-10',
  },
  {
    type: 'component',
    id: 'admin-dashboard',
    title: 'Admin dashboard',
    summary: 'Next.js app for managers: rota editing, approvals, and billing pages.',
    body: 'Server components for read views, client islands for the rota editor.',
    tags: ['frontend'],
    confidence: 0.85,
    date: '2025-09-01',
  },
  {
    type: 'component',
    id: 'mobile-push-gateway',
    title: 'Mobile push gateway',
    summary: 'Sends APNs and FCM notifications; device tokens registered at sign-in.',
    body: 'Invalid-token feedback prunes the device table daily.',
    tags: ['mobile'],
    confidence: 0.85,
    date: '2025-10-01',
    edges: [{ rel: 'relates_to', to: 'notification-worker' }],
  },

  // -------------------------------------------------------------- entities
  {
    type: 'entity',
    id: 'tenant',
    title: 'Tenant',
    summary:
      'An organization account; every row carries tenant_id and every query is tenant-scoped.',
    tags: ['domain'],
    confidence: 0.95,
    date: '2025-05-08',
  },
  {
    type: 'entity',
    id: 'rota',
    title: 'Rota',
    summary:
      'A published weekly plan of which employee works when; the unit managers edit and employees see.',
    tags: ['domain'],
    confidence: 0.95,
    date: '2025-05-08',
  },
  {
    type: 'entity',
    id: 'shift',
    title: 'Shift',
    summary: 'One contiguous block of scheduled work for one employee on one day.',
    tags: ['domain'],
    confidence: 0.95,
    date: '2025-05-08',
  },
  {
    type: 'entity',
    id: 'seat',
    title: 'Seat',
    summary: 'A billable active employee; seat count drives the Stripe subscription quantity.',
    tags: ['domain', 'billing'],
    confidence: 0.95,
    date: '2025-06-16',
  },
  {
    type: 'entity',
    id: 'swap-request',
    title: 'Swap request',
    summary:
      'An employee\'s offer to trade an assigned shift; needs manager approval unless auto-approve is on.',
    tags: ['domain'],
    confidence: 0.9,
    date: '2025-08-01',
  },
  {
    type: 'entity',
    id: 'coverage-gap',
    title: 'Coverage gap',
    summary: 'A time range where scheduled staffing falls below the template\'s minimum.',
    body: 'Computed by [[scheduler-engine]] on every publish and shown as a red band in the editor.',
    tags: ['domain'],
    confidence: 0.9,
    date: '2025-09-15',
    edges: [{ rel: 'relates_to', to: 'scheduler-engine' }],
  },
  {
    type: 'entity',
    id: 'payroll-export',
    title: 'Payroll export',
    summary:
      'CSV of worked hours per employee per pay period, in the format each payroll provider expects.',
    tags: ['domain', 'reporting'],
    confidence: 0.9,
    date: '2025-10-15',
  },
  {
    type: 'entity',
    id: 'grace-window',
    title: 'Grace window',
    summary:
      'Ten-minute margin after a scheduled start before a clock-in counts as late.',
    tags: ['domain'],
    confidence: 0.9,
    date: '2026-03-02',
  },

  // ----------------------------------------------------------- preferences
  // Near-duplicate pair A (same preference recorded twice by different agents)
  {
    type: 'preference',
    id: 'no-default-exports',
    title: 'No default exports',
    summary:
      'Use named exports everywhere; default exports break rename refactors and re-exports.',
    tags: ['style'],
    confidence: 0.9,
    date: '2025-06-25',
  },
  {
    type: 'preference',
    id: 'avoid-default-exports-in-shared-packages',
    title: 'Avoid default exports in shared packages',
    summary:
      'Use named exports everywhere in shared packages; default exports break rename refactors.',
    tags: ['style'],
    confidence: 0.85,
    date: '2026-02-03',
  },
  {
    type: 'preference',
    id: 'conventional-commits-with-scope',
    title: 'Conventional commits with scope',
    summary: 'Commits use type(scope): subject, where scope is the package name.',
    tags: ['style', 'git'],
    confidence: 0.9,
    date: '2025-07-01',
  },
  {
    type: 'preference',
    id: 'sql-migrations-written-by-hand',
    title: 'SQL migrations written by hand',
    summary:
      'Migrations are hand-written SQL files reviewed like code; no auto-generated diffs.',
    body: 'Generated diffs hide lock behavior. A human decides whether an index build is CONCURRENTLY.',
    tags: ['style', 'storage'],
    confidence: 0.9,
    date: '2025-08-10',
  },
  {
    type: 'preference',
    id: 'integration-tests-over-mocked-units',
    title: 'Integration tests over mocked units',
    summary:
      'Prefer testcontainers integration tests for API routes over heavily mocked unit tests.',
    tags: ['testing'],
    confidence: 0.85,
    date: '2025-09-20',
  },
  {
    type: 'preference',
    id: 'subscription-wording-cancel-not-delete',
    title: 'Subscription wording: cancel, not delete',
    summary:
      'UI and API say cancel for subscriptions; delete is reserved for actual data removal.',
    tags: ['naming', 'billing'],
    confidence: 0.9,
    date: '2026-04-20',
  },

  // --------------------------------------------------------------- gotchas
  // Near-duplicate pair B (same incident recorded twice)
  {
    type: 'gotcha',
    id: 'stripe-webhook-retry-created-duplicate-invoice-rows',
    title: 'Stripe webhook retry created duplicate invoice rows',
    summary:
      'Retried invoice.paid events created duplicate invoice rows; fixed by storing processed Stripe event ids.',
    body: 'During a 20-minute API outage Stripe queued deliveries and then re-sent everything. Handlers were not idempotent yet. Cleanup in [[session-2025-12-10-billing-hardening]].',
    tags: ['billing'],
    confidence: 0.95,
    date: '2025-12-10',
    edges: [
      { rel: 'observed_in', to: 'session-2025-12-10-billing-hardening' },
      { rel: 'relates_to', to: 'stripe-webhooks-must-be-idempotent' },
    ],
  },
  {
    type: 'gotcha',
    id: 'stripe-webhook-redelivery-created-duplicate-invoice-rows',
    title: 'Stripe webhook redelivery created duplicate invoice rows',
    summary:
      'Redelivered invoice.paid events created duplicate invoice rows; fixed by checking stored Stripe event ids.',
    body: 'Recorded while debugging a customer report months later — the insert-or-skip guard in [[webhook-dispatcher]] is what protects this path.',
    tags: ['billing'],
    confidence: 0.85,
    date: '2026-06-09',
    edges: [{ rel: 'relates_to', to: 'webhook-dispatcher' }],
  },
  {
    type: 'gotcha',
    id: 'pgbouncer-transaction-mode-breaks-prepared-statements',
    title: 'PgBouncer transaction mode breaks prepared statements',
    summary:
      'PgBouncer in transaction mode broke Kysely\'s prepared statements; disable the statement cache or use session mode.',
    body: 'Errors surfaced as "prepared statement s0 does not exist" only under load, when connections started being reused across clients.',
    tags: ['storage', 'infra'],
    confidence: 0.95,
    date: '2026-03-25',
    edges: [
      { rel: 'relates_to', to: 'kysely-over-prisma-for-database-access' },
      { rel: 'relates_to', to: 'postgres-primary-cluster' },
    ],
  },
  {
    type: 'gotcha',
    id: 'redis-allkeys-lru-evicted-bullmq-jobs',
    title: 'Redis allkeys-lru evicted BullMQ jobs',
    summary:
      'maxmemory allkeys-lru silently dropped BullMQ job keys from the queue under pressure; switched to noeviction with an alarm.',
    body: 'Reminder jobs vanished with no error anywhere — the eviction happened inside Redis. Idempotent handlers ([[worker-jobs-must-be-safe-to-run-twice]]) made the re-enqueue backfill safe.',
    tags: ['workers', 'infra'],
    confidence: 0.95,
    date: '2026-07-01',
    edges: [
      { rel: 'relates_to', to: 'redis-cache-layer' },
      { rel: 'relates_to', to: 'worker-jobs-must-be-safe-to-run-twice' },
    ],
  },
  {
    type: 'gotcha',
    id: 'dst-change-fired-rota-reminders-twice',
    title: 'DST change fired rota reminders twice',
    summary:
      'The spring daylight saving transition fired duplicate reminders; the job cron ran in local time — schedule cron in UTC and derive local at render.',
    body: 'Postmortem in [[session-2026-05-07-dst-incident]]. The repeated hour re-matched the cron expression.',
    tags: ['workers', 'time'],
    confidence: 0.95,
    date: '2026-05-07',
    edges: [
      { rel: 'observed_in', to: 'session-2026-05-07-dst-incident' },
      { rel: 'relates_to', to: 'notification-worker' },
    ],
  },
  {
    type: 'gotcha',
    id: 'ecs-drain-cut-long-lived-websockets',
    title: 'ECS drain cut long-lived websockets',
    summary:
      'The default 30-second ECS deregistration drain cut long-lived websocket connections mid rota edit; raised drain to 300 seconds and added client resume.',
    body: 'Managers lost unsaved edits on every deploy until the client learned to resume. Found during [[session-2026-03-14-deploy-pipeline]].',
    tags: ['deploy'],
    confidence: 0.95,
    date: '2026-03-14',
    edges: [
      { rel: 'observed_in', to: 'session-2026-03-14-deploy-pipeline' },
      { rel: 'relates_to', to: 'blue-green-deploys-on-ecs' },
    ],
  },
  {
    type: 'gotcha',
    id: 'stripe-disagreed-on-proration-rounding',
    title: 'Stripe disagreed on proration rounding',
    summary:
      'Our cent rounding of prorated seat charges disagreed with Stripe\'s; invoices came out off by one cent and failed reconciliation — let Stripe compute proration.',
    body: 'Stripe rounds per line item, we rounded the total. Not worth re-implementing; the pricing model moved to [[per-seat-pricing-with-monthly-true-up]].',
    tags: ['billing'],
    confidence: 0.95,
    date: '2025-11-18',
    edges: [
      { rel: 'relates_to', to: 'instant-proration-on-seat-updates' },
      { rel: 'relates_to', to: 'billing-service' },
    ],
  },
  {
    type: 'gotcha',
    id: 'sendgrid-sandbox-mode-swallowed-staging-email',
    title: 'SendGrid sandbox mode swallowed staging email',
    summary:
      'Staging silently sent nothing: SENDGRID_SANDBOX was left on in the task definition; alerts now fail loud when sandbox is enabled outside prod.',
    body: 'Sandbox mode accepts the send and delivers nothing, so every code path looked green.',
    tags: ['email', 'deploy'],
    confidence: 0.9,
    date: '2026-07-10',
    edges: [{ rel: 'relates_to', to: 'sendgrid-for-transactional-email' }],
  },
  {
    type: 'gotcha',
    id: 'kysely-camelcase-plugin-breaks-raw-sql',
    title: 'Kysely CamelCasePlugin breaks raw SQL',
    summary:
      'CamelCasePlugin rewrote column names inside sql template literals; raw fragments must use snake_case explicitly.',
    body: 'The plugin only translates the query builder layer — raw sql`` strings pass through, so mixed casing returned undefined columns at runtime.',
    tags: ['storage'],
    confidence: 0.9,
    date: '2026-04-15',
    edges: [{ rel: 'relates_to', to: 'kysely-over-prisma-for-database-access' }],
  },
  {
    type: 'gotcha',
    id: 'saml-clock-skew-rejected-assertions',
    title: 'SAML clock skew rejected assertions',
    summary:
      'A customer IdP ran 90 seconds fast and assertions failed NotBefore checks; we now allow 120 seconds of skew.',
    body: 'Their sign-ins failed only in the morning, when the IdP drifted before its sync. Skew tolerance is per-tenant configurable now.',
    tags: ['auth'],
    confidence: 0.9,
    date: '2026-06-17',
    edges: [{ rel: 'relates_to', to: 'auth-service' }],
  },

  // -------------------------------------------------------------- sessions
  {
    type: 'session',
    id: 'session-2025-11-03-auth-migration',
    title: 'Session 2025-11-03: auth migration',
    summary:
      'Moved SPA auth from localStorage JWTs to httpOnly session cookies; rotated all refresh tokens.',
    body: 'Two-day cutover with dual acceptance of old bearer headers, then hard revoke.',
    tags: ['auth'],
    confidence: 0.8,
    date: '2025-11-03',
  },
  {
    type: 'session',
    id: 'session-2025-12-10-billing-hardening',
    title: 'Session 2025-12-10: billing hardening',
    summary:
      'Added webhook event-id dedupe, wrote the idempotency rule down, and cleaned up duplicated invoice rows.',
    body: 'Backfilled a unique index on the Stripe event id; 14 tenants had duplicated rows to repair.',
    tags: ['billing'],
    confidence: 0.8,
    date: '2025-12-10',
  },
  {
    type: 'session',
    id: 'session-2026-01-22-schedule-normalization',
    title: 'Session 2026-01-22: schedule normalization',
    summary:
      'Migrated schedule jsonb blobs into shift and rota tables; backfilled 41 million rows with zero downtime using dual writes.',
    body: 'Dual-write window ran nine days; verification compared row counts and sampled diffs per tenant.',
    tags: ['storage'],
    confidence: 0.8,
    date: '2026-01-22',
  },
  {
    type: 'session',
    id: 'session-2026-03-14-deploy-pipeline',
    title: 'Session 2026-03-14: deploy pipeline',
    summary:
      'Blue-green ECS releases went live; raised the ALB deregistration delay so live rota edits survive a release.',
    body: 'Also moved task secrets to SSM references and deleted the last inline env values.',
    tags: ['deploy'],
    confidence: 0.8,
    date: '2026-03-14',
  },
  {
    type: 'session',
    id: 'session-2026-05-07-dst-incident',
    title: 'Session 2026-05-07: DST incident',
    summary:
      'Postmortem: duplicate reminders on the daylight saving change; job cron moved to UTC.',
    body: 'Affected 212 tenants in Europe. Added a canary that runs the cron matcher across the next DST boundary in CI.',
    tags: ['workers', 'incident'],
    confidence: 0.8,
    date: '2026-05-07',
  },
];

function toNode(s: Spec): MemoryNode {
  const stamp = `${s.date}T12:00:00.000Z`;
  return {
    id: s.id,
    type: s.type,
    title: s.title,
    summary: s.summary,
    confidence: s.confidence ?? 0.8,
    tags: s.tags ?? [],
    created: stamp,
    updated: stamp,
    last_confirmed: stamp,
    edges: s.edges ?? [],
    body: (s.body ?? '').trim(),
    path: path.join(BENCH_VAULT_DIR, TYPE_FOLDER[s.type], `${s.id}.md`),
  };
}

async function main() {
  // sanity before touching disk: unique ids, resolvable edge targets, all types
  const ids = new Set(NODES.map((n) => n.id));
  if (ids.size !== NODES.length) throw new Error('duplicate ids in NODES');
  for (const n of NODES) {
    for (const e of n.edges ?? []) {
      if (!ids.has(e.to)) throw new Error(`${n.id}: edge target "${e.to}" does not exist`);
    }
  }
  for (const t of NODE_TYPES) {
    if (!NODES.some((n) => n.type === t)) throw new Error(`no nodes of type ${t}`);
  }

  // Only ever delete the seven known type folders — never the vault root,
  // so a stray file placed there by a reviewer survives regeneration.
  for (const folder of Object.values(TYPE_FOLDER)) {
    await fs.rm(path.join(BENCH_VAULT_DIR, folder), { recursive: true, force: true });
  }
  for (const spec of NODES) {
    const node = toNode(spec);
    await fs.mkdir(path.dirname(node.path), { recursive: true });
    await fs.writeFile(node.path, serializeNode(node), 'utf8');
  }
  console.log(`bench vault: ${NODES.length} nodes → ${BENCH_VAULT_DIR}`);
}

// Only regenerate when executed directly — importing NODES for checks is free.
const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
