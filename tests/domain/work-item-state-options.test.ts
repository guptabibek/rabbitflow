import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getAvailableBoardStatuses,
  getAvailableWorkItemStates,
} from '../../src/lib/domain/work-item-view.ts'
import type { State } from '../../src/store/app-store.ts'

const states: State[] = [
  { id: 'new', name: 'New', color: '#64748b', category: 'Proposed', order: 10 },
  { id: 'development', name: 'Development', color: '#2563eb', category: 'In Progress', order: 20 },
  { id: 'testing', name: 'Testing', color: '#7c3aed', category: 'In Progress', order: 30 },
  { id: 'closed', name: 'Closed', color: '#15803d', category: 'Completed', order: 40 },
  { id: 'foreign', name: 'Foreign type state', color: '#dc2626', category: 'Proposed', order: 50 },
]

const mappings = [
  { workItemTypeId: 'story', stateId: 'new', order: 10, isInitial: true },
  { workItemTypeId: 'story', stateId: 'development', order: 20, isInitial: false },
  { workItemTypeId: 'story', stateId: 'testing', order: 30, isInitial: false },
  { workItemTypeId: 'story', stateId: 'closed', order: 40, isInitial: false },
  { workItemTypeId: 'bug', stateId: 'foreign', order: 10, isInitial: true },
]

const transitions = [
  { workItemTypeId: 'story', fromStateId: 'new', toStateId: 'new', order: 0, isEnabled: true },
  { workItemTypeId: 'story', fromStateId: 'new', toStateId: 'development', order: 10, isEnabled: true },
  { workItemTypeId: 'story', fromStateId: 'new', toStateId: 'testing', order: 20, isEnabled: false },
  { workItemTypeId: 'story', fromStateId: 'development', toStateId: 'new', order: 30, isEnabled: true },
  { workItemTypeId: 'story', fromStateId: 'development', toStateId: 'testing', order: 40, isEnabled: true },
]

test('state options contain the current state and enabled outgoing workflow edges', () => {
  const available = getAvailableWorkItemStates({
    states,
    typeStateMappings: mappings,
    stateTransitions: transitions,
    workItemTypeId: 'story',
    currentStateId: 'new',
  })

  assert.deepEqual(available.map((state) => state.id), ['new', 'development'])
})

test('state options exclude disabled edges, unreachable states, and states mapped to another type', () => {
  const available = getAvailableWorkItemStates({
    states,
    typeStateMappings: mappings,
    stateTransitions: transitions,
    workItemTypeId: 'story',
    currentStateId: 'development',
  })

  assert.deepEqual(available.map((state) => state.id), ['new', 'development', 'testing'])
  assert.equal(available.some((state) => state.id === 'closed'), false)
  assert.equal(available.some((state) => state.id === 'foreign'), false)
})

test('types without enabled transitions retain mapped-state compatibility behavior', () => {
  const available = getAvailableWorkItemStates({
    states,
    typeStateMappings: mappings,
    stateTransitions: [],
    workItemTypeId: 'story',
    currentStateId: 'new',
  })

  assert.deepEqual(available.map((state) => state.id), [
    'new',
    'development',
    'testing',
    'closed',
  ])
})

test('an unmapped legacy current state remains visible without exposing other invalid states', () => {
  const available = getAvailableWorkItemStates({
    states,
    typeStateMappings: mappings,
    stateTransitions: transitions,
    workItemTypeId: 'story',
    currentStateId: 'foreign',
  })

  assert.deepEqual(available.map((state) => state.id), ['foreign'])
})

test('board destinations mirror category aliases and enabled outgoing edges', () => {
  const available = getAvailableBoardStatuses({
    states,
    typeStateMappings: mappings,
    stateTransitions: transitions,
    workItemTypeId: 'story',
    currentStateId: 'new',
  })

  // Backlog and To Do both resolve to Proposed. Development is reachable,
  // which makes both In Progress board aliases valid. Closed has no edge.
  assert.deepEqual(available, ['backlog', 'todo', 'in_progress', 'in_review'])
})

test('board destinations choose the same final target that the API resolves', () => {
  const available = getAvailableBoardStatuses({
    states,
    typeStateMappings: mappings,
    stateTransitions: [
      ...transitions,
      {
        workItemTypeId: 'story',
        fromStateId: 'development',
        toStateId: 'closed',
        order: 50,
        isEnabled: true,
      },
    ],
    workItemTypeId: 'story',
    currentStateId: 'development',
  })

  assert.deepEqual(available, ['backlog', 'todo', 'in_progress', 'in_review', 'done'])
})

test('board destinations fail closed when workflow topology is unavailable', () => {
  assert.deepEqual(
    getAvailableBoardStatuses({
      states,
      typeStateMappings: [],
      stateTransitions: [],
      workItemTypeId: 'story',
      currentStateId: 'new',
    }),
    []
  )
})
