import { db } from "../db";
import { checkins, users, teams, vacations, checkinExemptions } from "@shared/schema";
import { and, eq, gte, lte, desc, sql, not, isNull } from "drizzle-orm";

interface TeamSummary {
  teamId: string;
  teamName: string;
  weekOf: Date;
  completionRate: number;
  averageMood: number;
  moodTrend: 'improving' | 'declining' | 'stable';
  totalMembers: number;
  completedCheckins: number;
  pendingCheckins: number;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  keyIssues: Array<{
    category: string;
    mentions: number;
    examples: string[];
  }>;
  actionItems: Array<{
    item: string;
    priority: 'high' | 'medium' | 'low';
    source: string;
  }>;
  highlights: string[];
  concerns: string[];
  teamMemberDetails: Array<{
    userId: string;
    name: string;
    mood: number;
    submitted: boolean;
    flagged: boolean;
    keyResponse?: string;
  }>;
}

interface LeadershipSummary {
  organizationId: string;
  weekOf: Date;
  overallHealth: number;
  teamCount: number;
  totalEmployees: number;
  overallCompletion: number;
  overallSentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  topIssues: Array<{
    issue: string;
    teamCount: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
  }>;
  teamComparisons: TeamSummary[];
  recommendations: string[];
  trends: {
    mood: 'up' | 'down' | 'stable';
    participation: 'up' | 'down' | 'stable';
    sentiment: 'up' | 'down' | 'stable';
  };
}

export class WeeklySummaryService {
  // Analyze sentiment from text responses
  private analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
    const positiveWords = ['great', 'excellent', 'good', 'happy', 'excited', 'accomplished', 'successful', 'proud', 'amazing', 'wonderful', 'fantastic', 'perfect', 'awesome', 'outstanding'];
    const negativeWords = ['stressed', 'overwhelmed', 'frustrated', 'difficult', 'challenging', 'worried', 'concerned', 'tired', 'exhausted', 'struggle', 'problem', 'issue', 'bad', 'terrible', 'awful'];
    
    const lowerText = text.toLowerCase();
    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  // Extract key issues from responses
  private extractIssues(responses: any[]): Array<{category: string, mentions: number, examples: string[]}> {
    const issueKeywords = {
      'Workload': ['busy', 'overloaded', 'too much', 'overwhelmed', 'deadline', 'swamped', 'hectic', 'overtime'],
      'Communication': ['communication', 'unclear', 'confusion', 'misunderstanding', 'miscommunication', 'transparency'],
      'Resources': ['need', 'lacking', 'missing', 'shortage', 'insufficient', 'equipment', 'tools', 'budget'],
      'Team Dynamics': ['conflict', 'tension', 'disagreement', 'morale', 'teamwork', 'collaboration'],
      'Process': ['process', 'inefficient', 'slow', 'bottleneck', 'delay', 'workflow', 'procedure']
    };
    
    const issues: Array<{category: string, mentions: number, examples: string[]}> = [];
    for (const [category, keywords] of Object.entries(issueKeywords)) {
      const examples: string[] = [];
      let mentions = 0;
      
      responses.forEach(response => {
        const text = JSON.stringify(response).toLowerCase();
        if (keywords.some(keyword => text.includes(keyword))) {
          mentions++;
          if (examples.length < 3) {
            // Extract a more meaningful excerpt
            const excerpt = Object.values(response || {}).find(v => typeof v === 'string' && v.length > 20);
            if (excerpt) {
              examples.push((excerpt as string).substring(0, 100) + '...');
            }
          }
        }
      });
      
      if (mentions > 0) {
        issues.push({ category, mentions, examples });
      }
    }
    
    return issues.sort((a, b) => b.mentions - a.mentions);
  }

  // Generate team summary for a manager
  async generateTeamSummary(organizationId: string, teamId: string, weekStart: Date): Promise<TeamSummary> {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Get team info
    const team = await db.select().from(teams)
      .where(and(
        eq(teams.id, teamId),
        eq(teams.organizationId, organizationId) // Security: ensure team belongs to organization
      ))
      .limit(1);

    // Security validation: early return if team doesn't exist or wrong org
    if (!team[0] || team[0].organizationId !== organizationId) {
      // Return empty summary for non-existent or wrong-org teams
      return {
        teamId,
        teamName: 'Invalid Team',
        weekOf: weekStart,
        completionRate: 0,
        averageMood: 0,
        moodTrend: 'stable' as const,
        totalMembers: 0,
        completedCheckins: 0,
        pendingCheckins: 0,
        sentiment: { positive: 0, neutral: 0, negative: 0 },
        keyIssues: [],
        actionItems: [],
        highlights: [],
        concerns: [],
        teamMemberDetails: []
      };
    }

    // Get team members and their check-ins
    const teamMembers = await db.select()
      .from(users)
      .where(and(
        eq(users.teamId, teamId),
        eq(users.organizationId, organizationId), // Security: filter by organizationId
        eq(users.isActive, true)
      ));

    const teamCheckins = await db.select()
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(and(
        eq(users.teamId, teamId),
        eq(users.organizationId, organizationId), // Security: filter users by organizationId
        eq(checkins.organizationId, organizationId), // Security: filter checkins by organizationId
        gte(checkins.weekOf, weekStart),
        lte(checkins.weekOf, weekEnd)
      ));

    // Calculate metrics
    const completedCheckins = teamCheckins.filter(c => c.checkins.isComplete);
    const completionRate = teamMembers.length > 0 ? (completedCheckins.length / teamMembers.length) * 100 : 0;
    const averageMood = completedCheckins.length > 0 ? 
      completedCheckins.reduce((sum, c) => sum + (c.checkins.overallMood || 0), 0) / completedCheckins.length : 0;

    // Get previous week's average mood for trend analysis
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(prevWeekStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() + 7);
    
    const prevWeekCheckins = await db.select()
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(and(
        eq(users.teamId, teamId),
        eq(users.organizationId, organizationId), // Security: filter users by organizationId
        eq(checkins.organizationId, organizationId), // Security: filter checkins by organizationId
        gte(checkins.weekOf, prevWeekStart),
        lte(checkins.weekOf, prevWeekEnd),
        eq(checkins.isComplete, true)
      ));

    const prevAvgMood = prevWeekCheckins.length > 0 ?
      prevWeekCheckins.reduce((sum, c) => sum + (c.checkins.overallMood || 0), 0) / prevWeekCheckins.length : 0;

    let moodTrend: 'improving' | 'declining' | 'stable' = 'stable';
    if (prevAvgMood > 0 && averageMood > 0) {
      const diff = averageMood - prevAvgMood;
      if (diff > 0.2) moodTrend = 'improving';
      else if (diff < -0.2) moodTrend = 'declining';
    }

    // Analyze sentiment
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    completedCheckins.forEach(c => {
      const responses = c.checkins.responses || {};
      const text = JSON.stringify(responses);
      const sentiment = this.analyzeSentiment(text);
      sentimentCounts[sentiment]++;
    });

    // Extract issues and generate action items
    const allResponses = completedCheckins.map(c => c.checkins.responses);
    const keyIssues = this.extractIssues(allResponses);

    // Generate action items based on issues
    const actionItems = keyIssues.slice(0, 3).map(issue => ({
      item: `Address ${issue.category} concerns raised by ${issue.mentions} team members`,
      priority: issue.mentions > teamMembers.length * 0.5 ? 'high' : issue.mentions > teamMembers.length * 0.25 ? 'medium' : 'low' as 'high' | 'medium' | 'low',
      source: issue.category
    }));

    // Extract highlights and concerns
    const highlights: string[] = [];
    const concerns: string[] = [];
    completedCheckins.forEach(c => {
      if (c.checkins.overallMood >= 4) {
        highlights.push(`${c.users.name} reported high morale (${c.checkins.overallMood}/5)`);
      }
      if (c.checkins.flagForFollowUp) {
        concerns.push(`${c.users.name} flagged for follow-up`);
      }
      if (c.checkins.overallMood <= 2) {
        concerns.push(`${c.users.name} reported low morale (${c.checkins.overallMood}/5)`);
      }
    });

    return {
      teamId,
      teamName: team[0]?.name || 'Unknown Team',
      weekOf: weekStart,
      completionRate,
      averageMood,
      moodTrend,
      totalMembers: teamMembers.length,
      completedCheckins: completedCheckins.length,
      pendingCheckins: teamMembers.length - completedCheckins.length,
      sentiment: sentimentCounts,
      keyIssues,
      actionItems,
      highlights: highlights.slice(0, 5),
      concerns: concerns.slice(0, 5),
      teamMemberDetails: teamMembers.map(member => {
        const checkin = teamCheckins.find(c => c.checkins.userId === member.id);
        return {
          userId: member.id,
          name: member.name,
          mood: checkin?.checkins.overallMood || 0,
          submitted: !!checkin?.checkins.isComplete,
          flagged: checkin?.checkins.flagForFollowUp || false,
          keyResponse: checkin?.checkins.winningNextWeek || undefined
        };
      })
    };
  }

  // Calculate team sentiment including missing check-ins as 0
  async calculateTeamSentiment(organizationId: string, weekStart: Date): Promise<{
    averageSentiment: number;
    expectedCount: number;
    submittedCount: number;
    missingCount: number;
    vacationCount: number;
    exemptCount: number;
  }> {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Get all active users in the organization
    const activeUsers = await db.select()
      .from(users)
      .where(and(
        eq(users.organizationId, organizationId),
        eq(users.isActive, true),
        not(isNull(users.teamId)) // Only users assigned to teams
      ));

    // Get all check-ins for the week
    const weekCheckins = await db.select()
      .from(checkins)
      .where(and(
        eq(checkins.organizationId, organizationId),
        gte(checkins.weekOf, weekStart),
        lte(checkins.weekOf, weekEnd),
        eq(checkins.isComplete, true)
      ));

    // Get vacation records for the week
    const vacationRecords = await db.select()
      .from(vacations)
      .where(and(
        eq(vacations.organizationId, organizationId),
        gte(vacations.weekOf, weekStart),
        lt(vacations.weekOf, weekEnd)
      ));

    // Get exemptions for the week
    const exemptions = await db.select()
      .from(checkinExemptions)
      .where(and(
        eq(checkinExemptions.organizationId, organizationId),
        gte(checkinExemptions.weekOf, weekStart),
        lte(checkinExemptions.weekOf, weekEnd)
      ));

    // Create sets for quick lookup
    const vacationUserIds = new Set(vacationRecords.map(v => v.userId));
    const exemptUserIds = new Set(exemptions.map(e => e.userId));
    const submittedUserIds = new Set(weekCheckins.map(c => c.userId));

    // Calculate expected participants (exclude vacation and exempt users)
    const expectedUsers = activeUsers.filter(user => 
      !vacationUserIds.has(user.id) && !exemptUserIds.has(user.id)
    );

    // Calculate sentiment
    let totalSentiment = 0;
    let submittedCount = 0;
    let missingCount = 0;

    for (const user of expectedUsers) {
      const checkin = weekCheckins.find(c => c.userId === user.id);
      if (checkin) {
        // User submitted - use their actual mood
        totalSentiment += checkin.overallMood || 0;
        submittedCount++;
      } else {
        // User didn't submit - count as 0
        totalSentiment += 0;
        missingCount++;
      }
    }

    const expectedCount = expectedUsers.length;
    const averageSentiment = expectedCount > 0 ? totalSentiment / expectedCount : 0;

    return {
      averageSentiment,
      expectedCount,
      submittedCount,
      missingCount,
      vacationCount: vacationUserIds.size,
      exemptCount: exemptUserIds.size
    };
  }

  // Generate organization-wide leadership summary
  async generateLeadershipSummary(organizationId: string, weekStart: Date): Promise<LeadershipSummary> {
    const allTeams = await db.select().from(teams)
      .where(eq(teams.organizationId, organizationId));

    const teamSummaries = await Promise.all(
      allTeams.map(team => this.generateTeamSummary(organizationId, team.id, weekStart))
    );

    // Calculate aggregate metrics
    const totalEmployees = teamSummaries.reduce((sum, t) => sum + t.totalMembers, 0);
    const totalCompleted = teamSummaries.reduce((sum, t) => sum + t.completedCheckins, 0);
    const overallCompletion = totalEmployees > 0 ? (totalCompleted / totalEmployees) * 100 : 0;
    const overallHealth = teamSummaries.length > 0 ?
      teamSummaries.reduce((sum, t) => sum + t.averageMood, 0) / teamSummaries.length : 0;

    // Aggregate sentiment
    const overallSentiment = teamSummaries.reduce((acc, t) => ({
      positive: acc.positive + t.sentiment.positive,
      neutral: acc.neutral + t.sentiment.neutral,
      negative: acc.negative + t.sentiment.negative
    }), { positive: 0, neutral: 0, negative: 0 });

    // Identify top issues across organization
    const issueMap = new Map();
    teamSummaries.forEach(t => {
      t.keyIssues.forEach(issue => {
        const key = issue.category;
        if (!issueMap.has(key)) {
          issueMap.set(key, { issue: key, teamCount: 0, severity: 'low' });
        }
        const current = issueMap.get(key);
        current.teamCount++;
        if (current.teamCount > allTeams.length * 0.5) current.severity = 'critical';
        else if (current.teamCount > allTeams.length * 0.3) current.severity = 'high';
        else if (current.teamCount > allTeams.length * 0.15) current.severity = 'medium';
      });
    });

    const topIssues = Array.from(issueMap.values())
      .sort((a, b) => b.teamCount - a.teamCount)
      .slice(0, 5);

    // Generate recommendations
    const recommendations = [];
    if (overallCompletion < 70) {
      recommendations.push('Consider sending reminder notifications to increase check-in completion rates');
    }
    if (overallHealth < 3) {
      recommendations.push('Schedule team meetings to address low morale across the organization');
    }
    if (overallSentiment.negative > overallSentiment.positive) {
      recommendations.push('Focus on addressing negative sentiment through targeted interventions');
    }
    if (overallCompletion > 90 && overallHealth > 4) {
      recommendations.push('Celebrate high engagement and positive team health with organization-wide recognition');
    }
    topIssues.forEach(issue => {
      if (issue.severity === 'critical' || issue.severity === 'high') {
        recommendations.push(`Prioritize addressing ${issue.issue} issues affecting ${issue.teamCount} teams`);
      }
    });

    // Analyze trends (simplified - in production would compare with historical data)
    const moodTrends = teamSummaries.map(t => t.moodTrend);
    const improvingCount = moodTrends.filter(t => t === 'improving').length;
    const decliningCount = moodTrends.filter(t => t === 'declining').length;
    
    let moodTrendOverall: 'up' | 'down' | 'stable' = 'stable';
    if (improvingCount > decliningCount + 2) moodTrendOverall = 'up';
    else if (decliningCount > improvingCount + 2) moodTrendOverall = 'down';

    return {
      organizationId,
      weekOf: weekStart,
      overallHealth,
      teamCount: allTeams.length,
      totalEmployees,
      overallCompletion,
      overallSentiment,
      topIssues,
      teamComparisons: teamSummaries.sort((a, b) => b.averageMood - a.averageMood),
      recommendations,
      trends: {
        mood: moodTrendOverall,
        participation: overallCompletion > 75 ? 'up' : overallCompletion < 50 ? 'down' : 'stable',
        sentiment: overallSentiment.positive > overallSentiment.negative * 1.5 ? 'up' : 
                  overallSentiment.negative > overallSentiment.positive * 1.5 ? 'down' : 'stable'
      }
    };
  }
}