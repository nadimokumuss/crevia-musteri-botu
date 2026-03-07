/**
 * Round-robin dağıtım algoritması
 *
 * Lead'leri ajanlara eşit şekilde dağıtır.
 * Her ajanın günlük maksimum ziyaret/arama kapasitesini gözetir.
 */

import type { AssignmentType } from '@/types/database'

export interface AgentCapacity {
  agentId: string
  maxDaily: number
  currentLoad: number
}

export interface DistributionInput {
  leadIds: string[]
  agents: AgentCapacity[]
  assignmentType: AssignmentType
}

export interface DistributionResult {
  assignments: Map<string, string[]>
  unassigned: string[]
}

/**
 * Lead'leri round-robin ile ajanlara dağıt
 *
 * @param input - Dağıtılacak lead'ler ve ajan kapasiteleri
 * @returns Her ajan için atanan lead ID'leri + atanamayan lead'ler
 */
export function distributeLeads(input: DistributionInput): DistributionResult {
  const { leadIds, agents } = input

  if (agents.length === 0 || leadIds.length === 0) {
    return { assignments: new Map(), unassigned: leadIds }
  }

  const assignments = new Map<string, string[]>()
  const unassigned: string[] = []

  // Her ajan için kalan kapasite hesapla
  const remainingCapacity = new Map<string, number>()
  for (const agent of agents) {
    const remaining = agent.maxDaily - agent.currentLoad
    if (remaining > 0) {
      remainingCapacity.set(agent.agentId, remaining)
      assignments.set(agent.agentId, [])
    }
  }

  // Kapasitesi olan ajan yoksa
  const availableAgents = [...remainingCapacity.keys()]
  if (availableAgents.length === 0) {
    return { assignments: new Map(), unassigned: leadIds }
  }

  // Round-robin dağıtım
  let agentIdx = 0
  for (const leadId of leadIds) {
    let assigned = false
    let attempts = 0

    while (!assigned && attempts < availableAgents.length) {
      const agentId = availableAgents[agentIdx % availableAgents.length]
      const remaining = remainingCapacity.get(agentId) ?? 0

      if (remaining > 0) {
        assignments.get(agentId)!.push(leadId)
        remainingCapacity.set(agentId, remaining - 1)
        assigned = true
      }

      agentIdx++
      attempts++
    }

    if (!assigned) {
      unassigned.push(leadId)
    }
  }

  return { assignments, unassigned }
}

/**
 * Dağıtım istatistiklerini hesapla
 */
export function getDistributionStats(result: DistributionResult): {
  totalAssigned: number
  totalUnassigned: number
  perAgent: { agentId: string; count: number }[]
} {
  const perAgent: { agentId: string; count: number }[] = []
  let totalAssigned = 0

  for (const [agentId, leads] of result.assignments) {
    perAgent.push({ agentId, count: leads.length })
    totalAssigned += leads.length
  }

  return {
    totalAssigned,
    totalUnassigned: result.unassigned.length,
    perAgent,
  }
}
