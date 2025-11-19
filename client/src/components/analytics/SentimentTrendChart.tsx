import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Legend
} from "recharts";
import { TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";

interface SentimentTrendProps {
  weeks?: number;
}

interface SentimentWeekData {
  weekOf: string;
  weekLabel: string;
  averageSentiment: number;
  expectedCount: number;
  submittedCount: number;
  missingCount: number;
  vacationCount: number;
  exemptCount: number;
}

interface SentimentTrendData {
  weeks: SentimentWeekData[];
  summary: {
    currentWeekSentiment: number;
    averageSentiment: number;
    trend: number;
  };
}

export default function SentimentTrendChart({ weeks = 12 }: SentimentTrendProps) {
  const { data, isLoading, error } = useQuery<SentimentTrendData>({
    queryKey: ["/api/analytics/sentiment-trend", weeks],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("weeks", weeks.toString());
      const response = await fetch(`/api/analytics/sentiment-trend?${params.toString()}`);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team Sentiment Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team Sentiment Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p>Unable to load sentiment trend</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getTrendIcon = () => {
    if (data.summary.trend > 0.1) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (data.summary.trend < -0.1) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-600" />;
  };

  const getTrendText = () => {
    if (data.summary.trend > 0.1) return "Improving";
    if (data.summary.trend < -0.1) return "Declining";
    return "Stable";
  };

  // Custom tooltip to show more details
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload[0]) {
      const data = payload[0].payload as SentimentWeekData;
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="font-semibold">{data.weekLabel}</p>
          <p className="text-sm">
            Sentiment: <span className="font-bold">{data.averageSentiment.toFixed(2)}/5</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Submitted: {data.submittedCount}/{data.expectedCount}
          </p>
          {data.missingCount > 0 && (
            <p className="text-xs text-red-600">
              Missing: {data.missingCount}
            </p>
          )}
          {data.vacationCount + data.exemptCount > 0 && (
            <p className="text-xs text-blue-600">
              Excluded: {data.vacationCount + data.exemptCount}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Team Sentiment Trend</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="flex items-center gap-1">
              {getTrendIcon()}
              <span>{getTrendText()}</span>
            </Badge>
            <Badge variant="secondary">
              Avg: {data.summary.averageSentiment.toFixed(2)}/5
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data.weeks} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey="weekLabel" 
              tick={{ fontSize: 12 }}
              interval="preserveStartEnd"
            />
            <YAxis 
              domain={[0, 5]} 
              ticks={[0, 1, 2, 3, 4, 5]}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            
            {/* Reference lines for sentiment levels */}
            <ReferenceLine y={4} stroke="green" strokeDasharray="3 3" opacity={0.3} />
            <ReferenceLine y={3} stroke="orange" strokeDasharray="3 3" opacity={0.3} />
            <ReferenceLine y={2} stroke="red" strokeDasharray="3 3" opacity={0.3} />
            
            {/* Average sentiment line */}
            <ReferenceLine 
              y={data.summary.averageSentiment} 
              stroke="blue" 
              strokeDasharray="5 5" 
              opacity={0.5}
              label={{ value: "Average", position: "left" }}
            />
            
            {/* Main sentiment line */}
            <Line 
              type="monotone" 
              dataKey="averageSentiment" 
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              name="Sentiment"
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            
            {/* Participation rate line */}
            <Line 
              type="monotone" 
              dataKey={(data: SentimentWeekData) => 
                data.expectedCount > 0 ? (data.submittedCount / data.expectedCount) * 5 : 0
              }
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              strokeDasharray="5 5"
              name="Participation Rate"
              dot={false}
              opacity={0.5}
            />
          </LineChart>
        </ResponsiveContainer>
        
        {/* Legend for reference lines */}
        <div className="flex justify-center gap-4 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-600 opacity-30" />
            <span>Good (4+)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-orange-600 opacity-30" />
            <span>Neutral (3)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-600 opacity-30" />
            <span>Concern (2-)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}