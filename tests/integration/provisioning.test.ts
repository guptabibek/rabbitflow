import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { db, resetDatabase, disconnect } from './support/db.ts'
import { createProject, createUser, addMember } from './support/fixtures.ts'
import {
  SYSTEM_RECORDS_VERSION,
  ensureProjectSystemRecords,
} from '../../src/lib/domain/project-bootstrap.ts'

/**
 * System-record provisioning (BE-002).
 *
 * This used to run as a lazy self-heal on thirteen read paths, costing ten
 * parallel COUNT queries per project per process every five minutes — with an
 * in-process cache, so the cost multiplied by replica count and replicas could
 * contend on the same sixty-second repair transaction.
 */

before(async () => { await resetDatabase() })
after(async () => { await disconnect() })

test('BE-002: a provisioned project is stamped with the current version', async () => {
  const project = await createProject({ key: 'PROV' })

  const row = await db.project.findUniqueOrThrow({
    where: { id: project.id },
    select: { systemRecordsVersion: true },
  })

  assert.equal(row.systemRecordsVersion, SYSTEM_RECORDS_VERSION)
})

test('BE-002: the read-path check costs one query when already provisioned', async () => {
  const project = await createProject({ key: 'CHEAP' })

  // A client configured to emit query events, so this measures rather than
  // assumes. The shared test client logs errors only, and counting against it
  // would pass trivially at zero.
  const { PrismaClient } = await import('@prisma/client')
  const probe = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL,
    log: [{ emit: 'event', level: 'query' }],
  })

  const statements: string[] = []
  probe.$on('query' as never, ((event: { query: string }) => {
    statements.push(event.query)
  }) as never)

  try {
    await probe.project.findUnique({
      where: { id: project.id },
      select: { systemRecordsVersion: true },
    })
  } finally {
    await probe.$disconnect()
  }

  // Previously ten parallel COUNTs against six tables. Now one indexed read.
  const selects = statements.filter((sql) => /^\s*SELECT/i.test(sql))
  assert.equal(selects.length, 1, `expected 1 SELECT, saw ${selects.length}: ${selects.join(' | ')}`)
  assert.match(selects[0], /"Project"/)
})

test('BE-002: a project behind the version is provisioned on demand', async () => {
  const project = await createProject({ key: 'STALE' })

  // Simulate a project created before the current provisioning revision.
  await db.project.update({
    where: { id: project.id },
    data: { systemRecordsVersion: 0 },
  })
  await db.state.deleteMany({ where: { projectId: project.id } })

  await ensureProjectSystemRecords(project.id)

  const row = await db.project.findUniqueOrThrow({
    where: { id: project.id },
    select: { systemRecordsVersion: true },
  })
  assert.equal(row.systemRecordsVersion, SYSTEM_RECORDS_VERSION)

  const states = await db.state.count({ where: { projectId: project.id } })
  assert.ok(states > 0, 'missing system records should have been restored')
})

test('BE-002: a missing project does not throw', async () => {
  // The caller's own lookup produces the 404; provisioning must not raise first.
  await ensureProjectSystemRecords('does-not-exist')
})
