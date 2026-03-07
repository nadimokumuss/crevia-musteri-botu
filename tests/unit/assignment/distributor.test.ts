import { describe, it, expect } from 'vitest'
import { distributeLeads, getDistributionStats } from '@/core/assignment/distributor'
import type { AgentCapacity } from '@/core/assignment/distributor'

describe('distributeLeads', () => {
  const agents: AgentCapacity[] = [
    { agentId: 'agent-1', maxDaily: 5, currentLoad: 0 },
    { agentId: 'agent-2', maxDaily: 5, currentLoad: 0 },
    { agentId: 'agent-3', maxDaily: 5, currentLoad: 0 },
  ]

  it('lead\'leri round-robin eşit dağıtır', () => {
    const leadIds = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6']
    const result = distributeLeads({ leadIds, agents, assignmentType: 'VISIT' })

    expect(result.assignments.get('agent-1')).toHaveLength(2)
    expect(result.assignments.get('agent-2')).toHaveLength(2)
    expect(result.assignments.get('agent-3')).toHaveLength(2)
    expect(result.unassigned).toHaveLength(0)
  })

  it('ajan yoksa tüm lead\'ler unassigned olur', () => {
    const result = distributeLeads({ leadIds: ['l1', 'l2'], agents: [], assignmentType: 'CALL' })

    expect(result.unassigned).toEqual(['l1', 'l2'])
  })

  it('lead yoksa boş sonuç döner', () => {
    const result = distributeLeads({ leadIds: [], agents, assignmentType: 'VISIT' })

    expect(result.assignments.size).toBe(0)
    expect(result.unassigned).toHaveLength(0)
  })

  it('kapasite dolu olan ajanları atlar', () => {
    const fullAgents: AgentCapacity[] = [
      { agentId: 'agent-1', maxDaily: 5, currentLoad: 5 }, // dolu
      { agentId: 'agent-2', maxDaily: 5, currentLoad: 3 }, // 2 boş
      { agentId: 'agent-3', maxDaily: 5, currentLoad: 0 }, // 5 boş
    ]

    const leadIds = ['l1', 'l2', 'l3', 'l4']
    const result = distributeLeads({ leadIds, agents: fullAgents, assignmentType: 'VISIT' })

    expect(result.assignments.has('agent-1')).toBe(false)
    expect(result.unassigned).toHaveLength(0)
  })

  it('tüm kapasiteler doluysa unassigned döner', () => {
    const fullAgents: AgentCapacity[] = [
      { agentId: 'agent-1', maxDaily: 2, currentLoad: 2 },
      { agentId: 'agent-2', maxDaily: 2, currentLoad: 2 },
    ]

    const result = distributeLeads({ leadIds: ['l1', 'l2'], agents: fullAgents, assignmentType: 'VISIT' })
    expect(result.unassigned).toEqual(['l1', 'l2'])
  })

  it('kapasite aşımında kalan lead\'ler unassigned olur', () => {
    const limitedAgents: AgentCapacity[] = [
      { agentId: 'agent-1', maxDaily: 2, currentLoad: 0 },
    ]

    const leadIds = ['l1', 'l2', 'l3', 'l4']
    const result = distributeLeads({ leadIds, agents: limitedAgents, assignmentType: 'VISIT' })

    expect(result.assignments.get('agent-1')).toHaveLength(2)
    expect(result.unassigned).toEqual(['l3', 'l4'])
  })
})

describe('getDistributionStats', () => {
  it('dağıtım istatistiklerini doğru hesaplar', () => {
    const assignments = new Map<string, string[]>()
    assignments.set('agent-1', ['l1', 'l2'])
    assignments.set('agent-2', ['l3'])

    const stats = getDistributionStats({ assignments, unassigned: ['l4'] })

    expect(stats.totalAssigned).toBe(3)
    expect(stats.totalUnassigned).toBe(1)
    expect(stats.perAgent).toHaveLength(2)
    expect(stats.perAgent[0].count).toBe(2)
    expect(stats.perAgent[1].count).toBe(1)
  })
})
