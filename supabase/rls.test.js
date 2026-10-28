/* Tests for supabase/migrations: who can see and write what.
   They need a real Postgres, so they run only when LAYERCENTS_TEST_PG is set
   to an admin connection string, for example:

     LAYERCENTS_TEST_PG=postgres://postgres@localhost:5432/postgres npm test

   Without it they are skipped, like the TLS tests without openssl. Each run
   creates a throwaway database, loads supabase/tests/prelude.sql (a stand-in
   for what Supabase provides) and the migrations, and drops it at the end.
   The `psql` client does the talking, so no dependency is added. */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const ADMIN = process.env.LAYERCENTS_TEST_PG
const here = dirname(fileURLToPath(import.meta.url))
const skip = ADMIN ? false : 'set LAYERCENTS_TEST_PG to run the database tests'

const DB = `layercents_rls_${randomBytes(4).toString('hex')}`
const dbUrl = () => {
  const url = new URL(ADMIN)
  url.pathname = `/${DB}`
  return url.toString()
}

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'

/* Runs SQL as a role. `as` = 'service_role' | 'anon' | { user: uuid } (an authenticated person).
   Returns { ok, out, err }; never throws, so a test can expect failures. */
function run(sql, as = 'postgres', url = dbUrl()) {
  let prefix = ''
  if (as === 'service_role' || as === 'anon') prefix = `set role ${as};`
  else if (as !== 'postgres') prefix = `set role authenticated; select set_config('request.jwt.claim.sub', '${as.user}', false);`
  const r = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-tA', url], { input: `${prefix}\n${sql}`, encoding: 'utf8' })
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() }
}
const ok = (sql, as) => {
  const r = run(sql, as)
  assert.ok(r.ok, `expected success, got: ${r.err}`)
  // set_config prints its value; the useful answer is the last line.
  return r.out.split('\n').at(-1)
}
const fails = (sql, pattern, as) => {
  const r = run(sql, as)
  assert.equal(r.ok, false, `expected an error matching ${pattern}, but it worked: ${r.out}`)
  assert.match(r.err, pattern)
}

before(() => {
  if (skip) return
  run(`create database ${DB}`, 'postgres', ADMIN)
  const migrations = readdirSync(join(here, 'migrations')).filter(f => f.endsWith('.sql')).sort()
  for (const file of ['tests/prelude.sql', ...migrations.map(m => `migrations/${m}`)]) {
    const r = run(readFileSync(join(here, file), 'utf8'))
    assert.ok(r.ok, `${file}: ${r.err}`)
  }
  ok(`insert into auth.users (id, email) values ('${ALICE}', 'a@example.com'), ('${BOB}', 'b@example.com')`)
})

after(() => {
  if (skip) return
  // Connections from the tests are closed by now; DROP needs no one inside.
  execFileSync('psql', ['-X', '-q', '-c', `drop database if exists ${DB} with (force)`, ADMIN])
})

const alice = { user: ALICE }
const bob = { user: BOB }
const quote = (user, id) => `insert into quotes (user_id, id, payload) values ('${user}', ${id}, '{"pieceName":"Stand"}')`

test('a person sees and edits their own quotes, and nobody else\'s', { skip }, () => {
  ok(quote(ALICE, 1), alice)
  assert.equal(ok('select count(*) from quotes', alice), '1')
  assert.equal(ok('select count(*) from quotes', bob), '0') // RLS hides it
  // Bob can't update or delete it: the row doesn't exist for him, so zero rows are touched.
  assert.equal(ok(`with u as (update quotes set payload = '{}' where id = 1 returning 1) select count(*) from u`, bob), '0')
  assert.equal(ok(`with d as (delete from quotes where id = 1 returning 1) select count(*) from d`, bob), '0')
  assert.equal(ok('select count(*) from quotes', alice), '1')
})

test('nobody can write a row for someone else, or move a row to someone else', { skip }, () => {
  fails(quote(ALICE, 2), /row-level security/, bob)
  ok(quote(BOB, 3), bob)
  fails(`update quotes set user_id = '${ALICE}' where id = 3`, /row-level security/, bob)
})

test('a quote is deleted with a tombstone that other devices can see', { skip }, () => {
  ok('update quotes set deleted_at = now() where id = 1', alice)
  assert.equal(ok('select count(*) from quotes where deleted_at is not null', alice), '1')
})

test('updated_at is set by the database, not by the client', { skip }, () => {
  ok(`update quotes set updated_at = '2000-01-01', payload = '{"x":1}' where id = 1`, alice)
  assert.equal(ok(`select updated_at > '2020-01-01' from quotes where id = 1`, alice), 't')
})

test('a payload over the size limit is refused', { skip }, () => {
  fails(`insert into quotes (user_id, id, payload) values ('${ALICE}', 99, jsonb_build_object('x', repeat('a', 250000)))`, /check constraint/, alice)
})

test('business: one row per person, private', { skip }, () => {
  ok(`insert into business (user_id, payload) values ('${ALICE}', '{"name":"Alice 3D"}')`, alice)
  assert.equal(ok('select count(*) from business', bob), '0')
  fails(`insert into business (user_id, payload) values ('${ALICE}', '{}')`, /row-level security/, bob)
})

test('the anonymous role (the public anon key without a login) can touch nothing', { skip }, () => {
  for (const table of ['quotes', 'business', 'agents', 'printers', 'printer_status', 'jobs', 'subscriptions', 'pairings']) {
    fails(`select * from ${table}`, /permission denied/, 'anon')
  }
  fails(quote(ALICE, 50), /permission denied/, 'anon')
})

test('every table has RLS on (a forgotten policy can never expose a table)', { skip }, () => {
  assert.equal(ok(`select count(*) from pg_tables where schemaname = 'public' and not rowsecurity`), '0')
})

const AGENT = '33333333-3333-4333-8333-333333333333'
const HASH = 'a'.repeat(64)
const setupFleet = () => {
  ok(`insert into agents (id, user_id, name, token_hash) values ('${AGENT}', '${ALICE}', 'Workshop PC', '${HASH}')`, 'service_role')
  ok(`insert into printers (id, user_id, agent_id, local_id, name, brand, model) values
        ('44444444-4444-4444-8444-444444444444', '${ALICE}', '${AGENT}', 'p1s', 'P1S', 'bambu', 'P1S')`, 'service_role')
  ok(`insert into printer_status (printer_id, user_id, status) values ('44444444-4444-4444-8444-444444444444', '${ALICE}', '{"state":"printing"}')`, 'service_role')
  ok(`insert into jobs (printer_id, job_id, user_id, name, started_at, ended_at, outcome, estimated_minutes, real_minutes) values
        ('44444444-4444-4444-8444-444444444444', 'p1s-1', '${ALICE}', 'Stand', '2026-10-28T10:00Z', '2026-10-28T11:35Z', 'finished', 90, 95)`, 'service_role')
}

test('fleet data: the owner reads it, other people don\'t', { skip }, () => {
  setupFleet()
  for (const table of ['agents', 'printers', 'printer_status', 'jobs']) {
    assert.equal(ok(`select count(*) from ${table}`, alice), '1', table)
    assert.equal(ok(`select count(*) from ${table}`, bob), '0', table)
  }
})

test('a person can read but never forge printer status, jobs, printers or plans', { skip }, () => {
  fails(`update printer_status set status = '{"state":"idle"}'`, /permission denied/, alice)
  fails(`delete from jobs`, /permission denied/, alice)
  fails(`insert into jobs (printer_id, job_id, user_id, started_at) values ('44444444-4444-4444-8444-444444444444', 'fake', '${ALICE}', now())`, /permission denied/, alice)
  fails(`insert into printers (user_id, agent_id, local_id, name, brand) values ('${ALICE}', '${AGENT}', 'x', 'X', 'bambu')`, /permission denied/, alice)
  fails(`insert into subscriptions (user_id, provider, plan, status) values ('${ALICE}', 'lemonsqueezy', 'pro', 'active')`, /permission denied/, alice)
})

test('the token hash can\'t be read by the web, and pairings are closed to it', { skip }, () => {
  fails('select token_hash from agents', /permission denied/, alice)
  fails('select * from agents', /permission denied/, alice) // * includes the hidden column
  assert.equal(ok('select name from agents', alice), 'Workshop PC')
  fails('select * from pairings', /permission denied/, alice)
  ok(`insert into pairings (device_code_hash, user_code, agent_name, expires_at) values ('${'b'.repeat(64)}', 'K7QX-M2PD', 'PC', now() + interval '10 minutes')`, 'service_role')
  assert.equal(ok('select count(*) from pairings', 'service_role'), '1')
})

test('a person can rename and revoke their agent, but not reactivate it, change its token or touch another person\'s', { skip }, () => {
  ok(`update agents set name = 'Garage PC' where id = '${AGENT}'`, alice)
  fails(`update agents set token_hash = '${'c'.repeat(64)}' where id = '${AGENT}'`, /permission denied/, alice)
  fails(`update agents set last_seen_at = now() where id = '${AGENT}'`, /permission denied/, alice)
  assert.equal(ok(`with u as (update agents set name = 'Mine now' where id = '${AGENT}' returning 1) select count(*) from u`, bob), '0')
  ok(`update agents set revoked_at = now() where id = '${AGENT}'`, alice)
  fails(`update agents set revoked_at = null where id = '${AGENT}'`, /cannot be reactivated/, alice)
})

test('a job is open or closed, never half-way, and an estimated start never has a "real" time', { skip }, () => {
  const job = (id, fields) => `insert into jobs (printer_id, job_id, user_id, started_at, ${Object.keys(fields).join(', ')})
    values ('44444444-4444-4444-8444-444444444444', '${id}', '${ALICE}', '2026-10-28T10:00Z', ${Object.values(fields).join(', ')})`
  ok(job('open', { name: "'x'" }), 'service_role') // open: no end and no outcome
  fails(job('half1', { ended_at: "'2026-10-28T11:00Z'" }), /jobs_open_or_closed/, 'service_role')
  fails(job('half2', { outcome: "'finished'" }), /jobs_open_or_closed/, 'service_role')
  fails(job('time', { ended_at: "'2026-10-28T09:00Z'", outcome: "'finished'" }), /jobs_end_after_start/, 'service_role')
  fails(job('guess', { ended_at: "'2026-10-28T11:00Z'", outcome: "'unknown'", started_approx: 'true', real_minutes: '60' }), /jobs_real_needs_measured_start/, 'service_role')
  fails(job('outcome', { ended_at: "'2026-10-28T11:00Z'", outcome: "'victory'" }), /check constraint/, 'service_role')
  // Re-sending a job is an update, not a duplicate: the key is (printer, job).
  fails(job('open', { name: "'again'" }), /duplicate key/, 'service_role')
})

test('an account can\'t have more than 20 printers', { skip }, () => {
  for (let i = 0; i < 19; i++) ok(`insert into printers (user_id, agent_id, local_id, name, brand) values ('${ALICE}', '${AGENT}', 'extra-${i}', 'Extra', 'bambu')`, 'service_role')
  fails(`insert into printers (user_id, agent_id, local_id, name, brand) values ('${ALICE}', '${AGENT}', 'one-too-many', 'X', 'bambu')`, /printer limit/, 'service_role')
})

test('printers can\'t hold secrets by shape: ids are lowercase slugs, not serials or addresses', { skip }, () => {
  fails(`insert into printers (user_id, agent_id, local_id, name, brand) values ('${BOB}', '${AGENT}', '192.168.1.50', 'X', 'bambu')`, /check constraint/, 'service_role')
  fails(`insert into printers (user_id, agent_id, local_id, name, brand) values ('${BOB}', '${AGENT}', '01P00A123456789', 'X', 'bambu')`, /check constraint/, 'service_role')
})

test('deleting the account deletes everything the person had', { skip }, () => {
  ok(`delete from auth.users where id = '${ALICE}'`)
  for (const table of ['quotes', 'business', 'agents', 'printers', 'printer_status', 'jobs']) {
    assert.equal(ok(`select count(*) from ${table} where user_id = '${ALICE}'`), '0', table)
  }
  assert.equal(ok('select count(*) from quotes'), '1') // Bob's is still there
})
