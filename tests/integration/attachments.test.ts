import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { db, resetDatabase, disconnect } from './support/db.ts'
import {
  addMember,
  authedRequest,
  createIssue,
  createProject,
  createUser,
  readResponse,
  type SeededUser,
} from './support/fixtures.ts'

/**
 * Attachment storage and access control.
 *
 * Files used to be written into `public/uploads/attachments` and served by the
 * static handler, so any authenticated user who learned a URL could read any
 * project's files — the only gate was the proxy's blanket session check. These
 * tests pin both halves of the fix: files land outside the web root, and reads
 * authorise against the parent work item.
 */

let project: Awaited<ReturnType<typeof createProject>>
let otherProject: Awaited<ReturnType<typeof createProject>>
let member: SeededUser
let outsider: SeededUser
let uploadRoot: string

// A minimal valid PNG: magic bytes plus a truncated IHDR. Enough for the
// content sniffer, which is what decides whether an upload is accepted.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])

async function uploadForm(issueId: string, file: Buffer, filename: string, type: string) {
  const form = new FormData()
  form.set('issueId', issueId)
  form.set('file', new File([new Uint8Array(file)], filename, { type }))
  return form
}

before(async () => {
  // Point storage at a scratch directory so the suite never touches real files.
  uploadRoot = await mkdtemp(path.join(tmpdir(), 'rf-uploads-'))
  process.env.UPLOAD_DIR = uploadRoot

  await resetDatabase()
  project = await createProject({ key: 'FILES' })
  otherProject = await createProject({ key: 'ELSEWHERE' })

  member = await createUser()
  outsider = await createUser()

  await addMember(project.id, member.id, 'Admin')
  await addMember(otherProject.id, outsider.id, 'Admin')
})

after(async () => {
  await disconnect()
})

beforeEach(async () => {
  await db.attachment.deleteMany({})
  await db.issue.deleteMany({})

  // Clear stored files too, so assertions about directory contents describe
  // only the test that made them.
  await rm(path.join(uploadRoot, 'attachments'), { recursive: true, force: true })
})

async function upload(user: SeededUser, issueId: string, file: Buffer, name: string, type: string) {
  const { POST } = await import('../../src/app/api/attachments/route.ts')

  const request = authedRequest(user, '/api/attachments', { method: 'POST' })
  // FormData must be attached as the body, which NextRequest cannot take via
  // the JSON helper, so build the request directly.
  const formRequest = new Request(request.url, {
    method: 'POST',
    headers: { cookie: `auth-token=${user.token}` },
    body: await uploadForm(issueId, file, name, type),
  })

  const { NextRequest } = await import('next/server')
  return POST(new NextRequest(formRequest))
}

test('an attachment is stored outside the public web root', async () => {
  const issue = await createIssue({ projectId: project.id, reporterId: member.id })

  const res = await readResponse<{ id: string; filePath: string }>(
    await upload(member, issue.id, PNG, 'diagram.png', 'image/png')
  )

  assert.equal(res.status, 201)

  // The stored reference is a bare filename, not a web path.
  assert.ok(!res.body?.filePath.includes('/'), 'filePath must not be a URL path')

  const files = await readdir(path.join(uploadRoot, 'attachments'))
  assert.equal(files.length, 1)
  assert.equal(files[0], res.body?.filePath)
})

test('a project member can download an attachment', async () => {
  const issue = await createIssue({ projectId: project.id, reporterId: member.id })
  const created = await readResponse<{ id: string }>(
    await upload(member, issue.id, PNG, 'diagram.png', 'image/png')
  )

  const { GET } = await import('../../src/app/api/attachments/[attachmentId]/route.ts')
  const response = await GET(
    authedRequest(member, `/api/attachments/${created.body?.id}`),
    { params: Promise.resolve({ attachmentId: created.body!.id }) }
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/png')
  // Never rendered inline, so a stored file cannot execute on this origin.
  assert.match(response.headers.get('content-disposition') ?? '', /^attachment/)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
})

test('a non-member cannot download an attachment', async () => {
  // This is the whole point of the move: before, any authenticated user who
  // learned the URL could read the file directly from the static handler.
  const issue = await createIssue({ projectId: project.id, reporterId: member.id })
  const created = await readResponse<{ id: string }>(
    await upload(member, issue.id, PNG, 'confidential.png', 'image/png')
  )

  const { GET } = await import('../../src/app/api/attachments/[attachmentId]/route.ts')
  const response = await GET(
    authedRequest(outsider, `/api/attachments/${created.body?.id}`),
    { params: Promise.resolve({ attachmentId: created.body!.id }) }
  )

  assert.equal(response.status, 403)
})

test('an unauthenticated request cannot download an attachment', async () => {
  const issue = await createIssue({ projectId: project.id, reporterId: member.id })
  const created = await readResponse<{ id: string }>(
    await upload(member, issue.id, PNG, 'x.png', 'image/png')
  )

  const { GET } = await import('../../src/app/api/attachments/[attachmentId]/route.ts')
  const response = await GET(
    authedRequest(null, `/api/attachments/${created.body?.id}`),
    { params: Promise.resolve({ attachmentId: created.body!.id }) }
  )

  assert.equal(response.status, 401)
})

test('a missing attachment returns 404', async () => {
  const { GET } = await import('../../src/app/api/attachments/[attachmentId]/route.ts')
  const response = await GET(
    authedRequest(member, '/api/attachments/nope'),
    { params: Promise.resolve({ attachmentId: 'nope' }) }
  )

  assert.equal(response.status, 404)
})

test('an HTML payload is rejected regardless of declared type', async () => {
  const issue = await createIssue({ projectId: project.id, reporterId: member.id })
  const html = Buffer.from('<html><body><script>alert(document.domain)</script></body></html>')

  const res = await readResponse<{ error: string }>(
    await upload(member, issue.id, html, 'not-really.png', 'image/png')
  )

  assert.equal(res.status, 400)
  assert.equal(await db.attachment.count(), 0)

  const files = await readdir(path.join(uploadRoot, 'attachments')).catch(() => [])
  assert.equal(files.length, 0, 'a rejected upload must not touch the filesystem')
})

test('the recorded mime type is the detected one, not the declared one', async () => {
  const issue = await createIssue({ projectId: project.id, reporterId: member.id })

  await upload(member, issue.id, PNG, 'lies.png', 'application/x-lies')

  const attachment = await db.attachment.findFirstOrThrow()
  assert.equal(attachment.mimeType, 'image/png')
})

test('the stored filename retains nothing from the client filename', async () => {
  const issue = await createIssue({ projectId: project.id, reporterId: member.id })

  const res = await readResponse<{ filePath: string; fileName: string }>(
    await upload(member, issue.id, PNG, '../../../etc/passwd.png', 'image/png')
  )

  assert.equal(res.status, 201)
  assert.ok(!res.body?.filePath.includes('passwd'))
  assert.ok(!res.body?.filePath.includes('..'))
  // The display name is kept, with path separators stripped.
  assert.equal(res.body?.fileName, 'passwd.png')
})
