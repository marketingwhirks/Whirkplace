import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  AlertCircle, 
  CheckCircle, 
  BarChart3, 
  Building, 
  TrendingUpIcon,
  Activity 
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TeamSummary {
  teamId: string;
  teamName: string;
  weekOf: string;
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
  weekOf: string;
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

export function LeadershipSummary() {
  const { data: summary, isLoading } = useQuery<LeadershipSummary>({
    queryKey: ["/api/analytics/leadership-summary"],
  });

  if (isLoading) {
    return (
      <Card data-testid="leadership-summary-loading">
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-32 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  const sentimentTotal = summary.overallSentiment.positive + summary.overallSentiment.neutral + summary.overallSentiment.negative;

  const getSeverityVariant = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Activity className="w-4 h-4 text-gray-500" />;
  };

  return (
    <Card className="mb-6" data-testid="leadership-summary-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="w-5 h-5" />
          Organization-Wide Weekly Summary
        </CardTitle>
        <CardDescription>
          Week of {new Date(summary.weekOf).toLocaleDateString()} • {summary.teamCount} Teams • {summary.totalEmployees} Employees
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-org-overview">Overview</TabsTrigger>
            <TabsTrigger value="teams" data-testid="tab-teams">Team Comparison</TabsTrigger>
            <TabsTrigger value="issues" data-testid="tab-org-issues">Top Issues</TabsTrigger>
            <TabsTrigger value="recommendations" data-testid="tab-recommendations">Recommendations</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold" data-testid="text-health-score">{summary.overallHealth.toFixed(1)}/5</div>
                  <p className="text-xs text-muted-foreground">Overall Health Score</p>
                  <div className="flex items-center gap-1 mt-2">
                    {getTrendIcon(summary.trends.mood)}
                    <span className="text-xs">Mood {summary.trends.mood}</span>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold" data-testid="text-completion-rate">{summary.overallCompletion.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground">Overall Completion</p>
                  <div className="flex items-center gap-1 mt-2">
                    {getTrendIcon(summary.trends.participation)}
                    <span className="text-xs">Participation {summary.trends.participation}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-lg font-bold">
                    <span className="text-green-600" data-testid="text-sentiment-positive">{sentimentTotal > 0 ? ((summary.overallSentiment.positive / sentimentTotal) * 100).toFixed(0) : 0}%</span>
                    <span className="text-xs text-muted-foreground mx-1">/</span>
                    <span className="text-gray-600" data-testid="text-sentiment-neutral">{sentimentTotal > 0 ? ((summary.overallSentiment.neutral / sentimentTotal) * 100).toFixed(0) : 0}%</span>
                    <span className="text-xs text-muted-foreground mx-1">/</span>
                    <span className="text-red-600" data-testid="text-sentiment-negative">{sentimentTotal > 0 ? ((summary.overallSentiment.negative / sentimentTotal) * 100).toFixed(0) : 0}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Sentiment (Pos/Neu/Neg)</p>
                  <div className="flex items-center gap-1 mt-2">
                    {getTrendIcon(summary.trends.sentiment)}
                    <span className="text-xs">Sentiment {summary.trends.sentiment}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold" data-testid="text-critical-issues">{summary.topIssues.filter(i => i.severity === 'critical' || i.severity === 'high').length}</div>
                  <p className="text-xs text-muted-foreground">Critical/High Issues</p>
                  {summary.topIssues.filter(i => i.severity === 'critical').length > 0 && (
                    <Badge variant="destructive" className="mt-2">
                      {summary.topIssues.filter(i => i.severity === 'critical').length} Critical
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sentiment Distribution */}
            <Card>
              <CardHeader className="pb-3">
                <h4 className="font-semibold">Organization Sentiment Distribution</h4>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Positive</span>
                    <span className="text-sm font-semibold">{summary.overallSentiment.positive} responses</span>
                  </div>
                  <Progress value={sentimentTotal > 0 ? (summary.overallSentiment.positive / sentimentTotal) * 100 : 0} className="h-3" />
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Neutral</span>
                    <span className="text-sm font-semibold">{summary.overallSentiment.neutral} responses</span>
                  </div>
                  <Progress value={sentimentTotal > 0 ? (summary.overallSentiment.neutral / sentimentTotal) * 100 : 0} className="h-3" />
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Negative</span>
                    <span className="text-sm font-semibold">{summary.overallSentiment.negative} responses</span>
                  </div>
                  <Progress value={sentimentTotal > 0 ? (summary.overallSentiment.negative / sentimentTotal) * 100 : 0} className="h-3" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="teams" className="mt-4">
            <ScrollArea className="h-[600px] w-full">
              <div className="space-y-4">
                {summary.teamComparisons.map((team, index) => (
                  <Card key={team.teamId} data-testid={`team-comparison-${team.teamId}`}>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-center">
                        <h4 className="font-semibold">{team.teamName}</h4>
                        <div className="flex gap-2">
                          {index === 0 && <Badge variant="default">Top Performing</Badge>}
                          {team.moodTrend === 'improving' && <Badge variant="outline">Improving</Badge>}
                          {team.moodTrend === 'declining' && <Badge variant="destructive">Declining</Badge>}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Completion</p>
                          <p className="text-lg font-semibold">{team.completionRate.toFixed(0)}%</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Avg Mood</p>
                          <p className="text-lg font-semibold">{team.averageMood.toFixed(1)}/5</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Team Size</p>
                          <p className="text-lg font-semibold">{team.totalMembers}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Submitted</p>
                          <p className="text-lg font-semibold">{team.completedCheckins}/{team.totalMembers}</p>
                        </div>
                      </div>
                      {team.keyIssues.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm text-muted-foreground">Top Issues:</p>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {team.keyIssues.slice(0, 3).map((issue, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {issue.category} ({issue.mentions})
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="issues" className="space-y-4 mt-4">
            {summary.topIssues.length === 0 ? (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  No significant issues detected across the organization this week.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {summary.topIssues.map((issue, i) => (
                  <Card key={i} data-testid={`top-issue-${i}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">{issue.issue}</h4>
                        <Badge variant={getSeverityVariant(issue.severity)}>
                          {issue.severity.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{issue.teamCount} teams affected</Badge>
                        <span className="text-sm text-muted-foreground">
                          {((issue.teamCount / summary.teamCount) * 100).toFixed(0)}% of organization
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="recommendations" className="space-y-4 mt-4">
            {summary.recommendations.length === 0 ? (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  No specific recommendations at this time. Keep up the great work!
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {summary.recommendations.map((recommendation, i) => (
                  <Alert key={i} data-testid={`recommendation-${i}`}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="font-medium">
                      {recommendation}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            {/* Quick Actions based on Issues */}
            {summary.topIssues.filter(i => i.severity === 'critical' || i.severity === 'high').length > 0 && (
              <Card className="bg-orange-50 dark:bg-orange-950/20">
                <CardHeader>
                  <h4 className="font-semibold flex items-center gap-2">
                    <TrendingUpIcon className="w-4 h-4" />
                    Suggested Actions
                  </h4>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {summary.topIssues.filter(i => i.severity === 'critical' || i.severity === 'high').map((issue, i) => (
                      <li key={i} className="text-sm" data-testid={`action-${i}`}>
                        • Schedule meeting with {issue.teamCount > 1 ? 'affected teams' : 'affected team'} to address {issue.issue} concerns
                      </li>
                    ))}
                    {summary.overallCompletion < 70 && (
                      <li className="text-sm">• Send organization-wide reminder about check-in importance</li>
                    )}
                    {summary.trends.mood === 'down' && (
                      <li className="text-sm">• Consider morale-boosting initiatives or team events</li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}