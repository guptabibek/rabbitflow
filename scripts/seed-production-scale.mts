import nextEnv from '@next/env'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const databaseUrl = process.env.DATABASE_URL ?? ''
if (process.env.ALLOW_SCALE_SEED !== 'true') throw new Error('Set ALLOW_SCALE_SEED=true to acknowledge the production-scale seed.')
if (!/(test|load|staging)/i.test(databaseUrl)) throw new Error('Scale seed only runs against a database URL containing test, load, or staging.')
const projectId = process.env.SCALE_PROJECT_ID?.trim()
if (!projectId) throw new Error('SCALE_PROJECT_ID is required.')

const issueCount = Math.max(100, Number.parseInt(process.env.SCALE_ISSUE_COUNT ?? '10000', 10))
const db = new PrismaClient()

async function main() {
  const [project, reporter] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, key: true } }),
    db.projectMember.findFirstOrThrow({ where: { projectId }, select: { userId: true } }),
  ])
  const existing = await db.issue.count({ where: { projectId } })
  const now = Date.now()
  const ids: string[] = []

  for (let offset = 0; offset < issueCount; offset += 1000) {
    const size = Math.min(1000, issueCount - offset)
    const rows = Array.from({ length: size }, (_, index) => {
      const ordinal = offset + index + 1
      const id = randomUUID()
      ids.push(id)
      const status = ['backlog', 'todo', 'in_progress', 'in_review', 'done'][ordinal % 5]
      const startDate = ordinal % 4 === 0 ? null : new Date(now + (ordinal % 180 - 60) * 86_400_000)
      return {
        id,
        projectId,
        key: `${project.key}-${existing + ordinal}`,
        title: `Scale work item ${ordinal}`,
        description: 'Synthetic production-scale validation data.',
        workItemType: ordinal % 12 === 0 ? 'bug' : ordinal % 5 === 0 ? 'story' : 'task',
        status,
        priority: ['low', 'medium', 'high', 'highest'][ordinal % 4],
        reporterId: reporter.userId,
        storyPoints: [1, 2, 3, 5, 8][ordinal % 5],
        startDate,
        dueDate: startDate ? new Date(startDate.getTime() + (ordinal % 14 + 1) * 86_400_000) : null,
        columnOrder: existing + ordinal,
      }
    })
    await db.issue.createMany({ data: rows })
    process.stdout.write(`Seeded ${Math.min(offset + size, issueCount)}/${issueCount} work items\r`)
  }

  const relationRows = []
  for (let index = 0; index + 1 < ids.length; index += 10) {
    relationRows.push({ sourceIssueId: ids[index], targetIssueId: ids[index + 1], relationType: 'blocks' })
  }
  await db.issueRelation.createMany({ data: relationRows, skipDuplicates: true })

  const objectives = Array.from({ length: Math.max(10, Math.ceil(issueCount / 1000)) }, (_, index) => ({
    projectId,
    title: `Scale objective ${index + 1}`,
    status: index % 4 === 0 ? 'at_risk' : 'on_track',
    progress: (index * 17) % 100,
    ownerId: reporter.userId,
  }))
  await db.objective.createMany({ data: objectives })
  process.stdout.write('\n')
  console.log(`Scale dataset ready: ${issueCount} work items, ${relationRows.length} dependencies, ${objectives.length} objectives.`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
