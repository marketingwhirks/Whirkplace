import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Users, AlertCircle, CheckCircle, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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

interface WeeklySummaryProps {
  shouldFetch?: boolean;
}

export function WeeklySummary({ shouldFetch = true }: WeeklySummaryProps) {
  const { data: summary, isLoading } = useQuery<TeamSummary>({
    queryKey: ["/api/analytics/team-summary"],
    enabled: shouldFetch,
  });

  if (!shouldFetch) {
    return null;
  }

  if (isLoading) {
    return (
      <Card data-testid="weekly-summary-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  const sentimentTotal = summary.sentiment.positive + summary.sentiment.neutral + summary.sentiment.negative;

  return (
    <Card className="mb-6" data-testid="weekly-summary-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Weekly Team Summary
        </CardTitle>
        <CardDescription>
          Week of {new Date(summary.weekOf).toLocaleDateString()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="sentiment" data-testid="tab-sentiment">Sentiment</TabsTrigger>
            <TabsTrigger value="issues" data-testid="tab-issues">Issues</TabsTrigger>
            <TabsTrigger value="members" data-testid="tab-members">Team Members</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold" data-testid="text-completion-rate">{summary.completionRate.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground">Check-in Completion</p>
                  <Progress value={summary.completionRate} className="mt-2" />
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold" data-testid="text-average-mood">{summary.averageMood.toFixed(1)}/5</div>
                  <p className="text-xs text-muted-foreground">Average Mood</p>
                  <div className="flex items-center gap-1 mt-2">
                    {summary.moodTrend === 'improving' && <TrendingUp className="w-4 h-4 text-green-500" />}
                    {summary.moodTrend === 'declining' && <TrendingDown className="w-4 h-4 text-red-500" />}
                    <span className="text-xs" data-testid="text-mood-trend">{summary.moodTrend}</span>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold" data-testid="text-response-count">{summary.completedCheckins}/{summary.totalMembers}</div>
                  <p className="text-xs text-muted-foreground">Responses</p>
                  {summary.pendingCheckins > 0 && (
                    <Badge variant="outline" className="mt-2" data-testid="badge-pending">
                      {summary.pendingCheckins} pending
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </div>

            {summary.actionItems.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Recommended Actions</h4>
                <div className="space-y-2">
                  {summary.actionItems.map((item, i) => (
                    <div key={i} className="flex items-start gap-2" data-testid={`action-item-${i}`}>
                      <Badge variant={
                        item.priority === 'high' ? 'destructive' : 
                        item.priority === 'medium' ? 'default' : 'secondary'
                      }>
                        {item.priority}
                      </Badge>
                      <span className="text-sm">{item.item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="sentiment" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Positive</span>
                <span className="text-sm font-semibold" data-testid="text-sentiment-positive">
                  {sentimentTotal > 0 ? ((summary.sentiment.positive / sentimentTotal) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <Progress value={sentimentTotal > 0 ? (summary.sentiment.positive / sentimentTotal) * 100 : 0} className="h-2" />
              
              <div className="flex justify-between items-center">
                <span className="text-sm">Neutral</span>
                <span className="text-sm font-semibold" data-testid="text-sentiment-neutral">
                  {sentimentTotal > 0 ? ((summary.sentiment.neutral / sentimentTotal) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <Progress value={sentimentTotal > 0 ? (summary.sentiment.neutral / sentimentTotal) * 100 : 0} className="h-2" />
              
              <div className="flex justify-between items-center">
                <span className="text-sm">Negative</span>
                <span className="text-sm font-semibold" data-testid="text-sentiment-negative">
                  {sentimentTotal > 0 ? ((summary.sentiment.negative / sentimentTotal) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <Progress value={sentimentTotal > 0 ? (summary.sentiment.negative / sentimentTotal) * 100 : 0} className="h-2" />
            </div>

            {summary.highlights.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Highlights
                </h4>
                <ul className="space-y-1">
                  {summary.highlights.map((highlight, i) => (
                    <li key={i} className="text-sm text-muted-foreground" data-testid={`highlight-${i}`}>• {highlight}</li>
                  ))}
                </ul>
              </div>
            )}

            {summary.concerns.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  Concerns
                </h4>
                <ul className="space-y-1">
                  {summary.concerns.map((concern, i) => (
                    <li key={i} className="text-sm text-muted-foreground" data-testid={`concern-${i}`}>• {concern}</li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent value="issues" className="space-y-4 mt-4">
            {summary.keyIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">No significant issues detected this week.</p>
            ) : (
              summary.keyIssues.map((issue, i) => (
                <div key={i} className="border rounded-lg p-3" data-testid={`issue-${i}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{issue.category}</span>
                    <Badge variant="outline">{issue.mentions} mentions</Badge>
                  </div>
                  {issue.examples.length > 0 && (
                    <div className="text-sm text-muted-foreground space-y-1">
                      {issue.examples.map((example, j) => (
                        <p key={j} className="italic">"{example}"</p>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <div className="space-y-2">
              {summary.teamMemberDetails.map((member) => (
                <div key={member.userId} className="flex items-center justify-between p-2 border rounded" data-testid={`member-${member.userId}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{member.name}</span>
                    {member.flagged && <AlertCircle className="w-4 h-4 text-orange-500" />}
                  </div>
                  <div className="flex items-center gap-2">
                    {member.submitted ? (
                      <>
                        <span className="text-sm">Mood: {member.mood}/5</span>
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      </>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}