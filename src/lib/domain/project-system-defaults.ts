export type DefaultField = {
  key: string
  label: string
  description?: string
  dataType:
    | 'text'
    | 'markdown'
    | 'number'
    | 'date'
    | 'boolean'
    | 'single_select'
    | 'multi_select'
    | 'user'
    | 'iteration'
    | 'area'
    | 'team'
  required?: boolean
  placeholder?: string
  options?: string[]
  config?: Record<string, unknown>
}

export type DefaultSection = {
  key: string
  title: string
  description?: string
  sectionType?: 'fields' | 'markdown' | 'system'
  isCollapsible?: boolean
  fields: DefaultField[]
}

export type DefaultWorkItemType = {
  key: string
  name: string
  description: string
  icon: string
  color: string
  hierarchyLevel: number
  order: number
  sections: DefaultSection[]
}

export const DEFAULT_PROJECT_STATES = [
  {
    name: 'New / Groomed / Ready for Development',
    color: '#64748b',
    category: 'Proposed',
    order: 10,
    isFinal: false,
  },
  {
    name: 'Development in Progress',
    color: '#2563eb',
    category: 'In Progress',
    order: 20,
    isFinal: false,
  },
  {
    name: 'Returned to Development',
    color: '#1d4ed8',
    category: 'In Progress',
    order: 30,
    isFinal: false,
  },
  {
    name: 'Product Acceptance Testing (PAT)',
    color: '#7c3aed',
    category: 'In Progress',
    order: 40,
    isFinal: false,
  },
  {
    name: 'Feature Acceptance Testing (FAT)',
    color: '#0891b2',
    category: 'In Progress',
    order: 50,
    isFinal: false,
  },
  {
    name: 'Business Acceptance Testing (BAT)',
    color: '#0f766e',
    category: 'In Progress',
    order: 60,
    isFinal: false,
  },
  {
    name: 'BAT/FAT Done',
    color: '#16a34a',
    category: 'Completed',
    order: 70,
    isFinal: true,
  },
  {
    name: 'Closed',
    color: '#15803d',
    category: 'Completed',
    order: 80,
    isFinal: true,
  },
] as const

export const DEFAULT_WORK_ITEM_TYPES: DefaultWorkItemType[] = [
  {
    key: 'epic',
    name: 'Epic',
    description: 'Large portfolio-level initiative.',
    icon: 'Layers3',
    color: '#4f46e5',
    hierarchyLevel: 1,
    order: 10,
    sections: [
      {
        key: 'strategy',
        title: 'Strategy',
        fields: [
          {
            key: 'objective',
            label: 'Objective',
            dataType: 'markdown',
            required: true,
            placeholder: 'Document the business objective and expected outcome.',
          },
          {
            key: 'success_metrics',
            label: 'Success Metrics',
            dataType: 'markdown',
            placeholder: 'Define measurable indicators for success.',
          },
        ],
      },
    ],
  },
  {
    key: 'feature',
    name: 'Feature',
    description: 'A significant product capability delivered to customers.',
    icon: 'Flag',
    color: '#0891b2',
    hierarchyLevel: 2,
    order: 20,
    sections: [
      {
        key: 'delivery',
        title: 'Delivery',
        fields: [
          {
            key: 'acceptance_criteria',
            label: 'Acceptance Criteria',
            dataType: 'markdown',
            placeholder: 'List the acceptance conditions for this feature.',
          },
          {
            key: 'rollout_notes',
            label: 'Rollout Notes',
            dataType: 'markdown',
            placeholder: 'Capture rollout constraints, dependencies, and mitigation steps.',
          },
        ],
      },
    ],
  },
  {
    key: 'story',
    name: 'User Story',
    description: 'A user-focused increment of value.',
    icon: 'Star',
    color: '#7c3aed',
    hierarchyLevel: 3,
    order: 30,
    sections: [
      {
        key: 'requirements',
        title: 'Requirements',
        fields: [
          {
            key: 'acceptance_criteria',
            label: 'Acceptance Criteria',
            dataType: 'markdown',
            placeholder: 'Describe the expected behavior and constraints.',
          },
          {
            key: 'user_value',
            label: 'User Value',
            dataType: 'markdown',
            placeholder: 'Explain the customer value unlocked by this story.',
          },
        ],
      },
    ],
  },
  {
    key: 'task',
    name: 'Task',
    description: 'Implementation or operational work tracked to completion.',
    icon: 'CheckSquare',
    color: '#059669',
    hierarchyLevel: 4,
    order: 40,
    sections: [
      {
        key: 'execution',
        title: 'Execution',
        fields: [
          {
            key: 'implementation_notes',
            label: 'Implementation Notes',
            dataType: 'markdown',
            placeholder: 'Capture implementation detail, caveats, and hand-off information.',
          },
          {
            key: 'qa_notes',
            label: 'QA Notes',
            dataType: 'markdown',
            placeholder: 'Document validation steps or evidence.',
          },
        ],
      },
    ],
  },
  {
    key: 'dev_task',
    name: 'Dev Task',
    description: 'Engineering implementation work tied to a story or feature.',
    icon: 'Code2',
    color: '#0284c7',
    hierarchyLevel: 4,
    order: 45,
    sections: [
      {
        key: 'implementation',
        title: 'Implementation',
        fields: [
          {
            key: 'technical_plan',
            label: 'Technical Plan',
            dataType: 'markdown',
            placeholder: 'Outline the implementation approach, touched systems, and dependencies.',
          },
          {
            key: 'definition_of_done',
            label: 'Definition of Done',
            dataType: 'markdown',
            placeholder: 'List the code-complete, review, and deployment conditions for this task.',
          },
          {
            key: 'handoff_notes',
            label: 'Handoff Notes',
            dataType: 'markdown',
            placeholder: 'Capture QA handoff notes, flags, and validation guidance.',
          },
        ],
      },
    ],
  },
  {
    key: 'qc_task',
    name: 'QC Task',
    description: 'Quality-control validation work for release readiness.',
    icon: 'ClipboardCheck',
    color: '#7c2d12',
    hierarchyLevel: 4,
    order: 47,
    sections: [
      {
        key: 'validation',
        title: 'Validation',
        fields: [
          {
            key: 'test_scope',
            label: 'Test Scope',
            dataType: 'markdown',
            placeholder: 'Describe the flows, devices, browsers, or environments covered by QC.',
          },
          {
            key: 'test_evidence',
            label: 'Test Evidence',
            dataType: 'markdown',
            placeholder: 'Link screenshots, recordings, logs, or supporting evidence.',
          },
          {
            key: 'exit_criteria',
            label: 'Exit Criteria',
            dataType: 'markdown',
            placeholder: 'Capture the pass/fail bar required before this item can be closed.',
          },
        ],
      },
    ],
  },
  {
    key: 'bug',
    name: 'Bug',
    description: 'A defect affecting product quality.',
    icon: 'Bug',
    color: '#dc2626',
    hierarchyLevel: 4,
    order: 50,
    sections: [
      {
        key: 'triage',
        title: 'Triage',
        fields: [
          {
            key: 'reproduction_steps',
            label: 'Reproduction Steps',
            dataType: 'markdown',
            placeholder: 'Describe the steps needed to reproduce the issue.',
          },
          {
            key: 'expected_behavior',
            label: 'Expected Behavior',
            dataType: 'markdown',
            placeholder: 'Describe what should happen instead.',
          },
          {
            key: 'observed_behavior',
            label: 'Observed Behavior',
            dataType: 'markdown',
            placeholder: 'Describe the incorrect behavior or system impact.',
          },
        ],
      },
    ],
  },
  {
    key: 'prod_bug',
    name: 'Prod Bug',
    description: 'A production defect requiring operational mitigation and root-cause follow-up.',
    icon: 'ShieldAlert',
    color: '#b91c1c',
    hierarchyLevel: 4,
    order: 55,
    sections: [
      {
        key: 'incident',
        title: 'Incident Response',
        fields: [
          {
            key: 'customer_impact',
            label: 'Customer Impact',
            dataType: 'markdown',
            placeholder: 'Describe the affected customers, scope, and business impact.',
          },
          {
            key: 'mitigation',
            label: 'Mitigation',
            dataType: 'markdown',
            placeholder: 'Capture immediate remediation, rollback, or workaround steps.',
          },
          {
            key: 'root_cause',
            label: 'Root Cause',
            dataType: 'markdown',
            placeholder: 'Document the root cause and the prevention plan once confirmed.',
          },
        ],
      },
    ],
  },
  {
    key: 'design_doc',
    name: 'Design Doc',
    description: 'Structured design proposal or technical decision record.',
    icon: 'FilePenLine',
    color: '#0f766e',
    hierarchyLevel: 3,
    order: 60,
    sections: [
      {
        key: 'proposal',
        title: 'Proposal',
        fields: [
          {
            key: 'hypothesis',
            label: 'Hypothesis',
            dataType: 'markdown',
            placeholder: 'What problem does this design address and why is it the right solution?',
          },
          {
            key: 'design_notes',
            label: 'Design Notes',
            dataType: 'markdown',
            placeholder: 'Capture architecture, tradeoffs, and implementation detail.',
          },
          {
            key: 'decision_log',
            label: 'Decision Log',
            dataType: 'markdown',
            placeholder: 'Track key decisions and alternatives considered.',
          },
        ],
      },
    ],
  },
  {
    key: 'release_item',
    name: 'Release Item',
    description: 'Release-scoped work used for launch readiness and coordination.',
    icon: 'PackageCheck',
    color: '#ea580c',
    hierarchyLevel: 2,
    order: 70,
    sections: [
      {
        key: 'release',
        title: 'Release Readiness',
        fields: [
          {
            key: 'release_notes',
            label: 'Release Notes',
            dataType: 'markdown',
            placeholder: 'Summarize externally visible changes for release communication.',
          },
          {
            key: 'rollout_plan',
            label: 'Rollout Plan',
            dataType: 'markdown',
            placeholder: 'Document deployment steps, timings, and dependencies.',
          },
          {
            key: 'rollback_plan',
            label: 'Rollback Plan',
            dataType: 'markdown',
            placeholder: 'Document rollback criteria and execution steps.',
          },
        ],
      },
    ],
  },
]

export const DEFAULT_WORK_ITEM_TYPE_KEYS = DEFAULT_WORK_ITEM_TYPES.map((type) => type.key)
