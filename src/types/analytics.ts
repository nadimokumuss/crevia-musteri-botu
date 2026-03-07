export interface AnalyticsKPI {
  totalLeads: number
  newLeadsThisWeek: number
  newLeadsLastWeek: number
  totalWon: number
  totalLost: number
  conversionRate: number
  avgNeedScore: number
  totalAssignments: number
  completedAssignments: number
  completionRate: number
  totalCallsMade: number
  callCompletionRate: number
  activeAgents: number
}

export interface StatusCount {
  status: string
  label: string
  count: number
}

export interface RecommendationCount {
  recommendation: string
  label: string
  count: number
}

export interface CategoryCount {
  category: string
  count: number
  avgScore: number
}

export interface AgentPerformance {
  agentId: string
  agentName: string
  role: string
  totalAssignments: number
  completedAssignments: number
  completionRate: number
  totalVisits: number
  totalCalls: number
}

export interface CallOutcomeCount {
  status: string
  label: string
  count: number
}

export interface TrendDataPoint {
  date: string
  newLeads: number
  wonLeads: number
  completedVisits: number
  completedCalls: number
}

export interface AnalyticsDashboardData {
  kpi: AnalyticsKPI
  statusFunnel: StatusCount[]
  recommendationDistribution: RecommendationCount[]
  categoryBreakdown: CategoryCount[]
  agentPerformance: AgentPerformance[]
  callOutcomes: CallOutcomeCount[]
  weeklyTrend: TrendDataPoint[]
  dateRange: { startDate: string; endDate: string }
  generatedAt: string
}
