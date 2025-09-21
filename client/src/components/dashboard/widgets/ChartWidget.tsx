import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent,
  type ChartConfig 
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

export interface ChartWidgetProps {
  title: string;
  description?: string;
  data: any[];
  config: ChartConfig;
  type: "bar" | "line" | "area" | "pie";
  isLoading?: boolean;
  className?: string;
  height?: number;
  dataKey?: string;
  xAxisKey?: string;
  colors?: string[];
}

export function ChartWidget({
  title,
  description,
  data,
  config,
  type,
  isLoading = false,
  className,
  height = 300,
  dataKey = "value",
  xAxisKey = "name",
  colors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))"],
}: ChartWidgetProps) {
  if (isLoading) {
    return (
      <Card className={className} data-testid="chart-widget-loading">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          {description && <Skeleton className="h-4 w-48" />}
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full" style={{ height: `${height}px` }} />
        </CardContent>
      </Card>
    );
  }

  // Check for empty data
  if (!data || data.length === 0) {
    return (
      <Card className={className} data-testid="chart-widget-empty">
        <CardHeader>
          <CardTitle data-testid="chart-title">{title}</CardTitle>
          {description && (
            <CardDescription data-testid="chart-description">{description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div 
            className="flex items-center justify-center text-muted-foreground"
            style={{ height: `${height}px` }}
          >
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderChart = () => {
    switch (type) {
      case "bar":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xAxisKey} />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey={dataKey} fill={colors[0]} />
            </BarChart>
          </ResponsiveContainer>
        );
      
      case "line":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xAxisKey} />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line 
                type="monotone" 
                dataKey={dataKey} 
                stroke={colors[0]} 
                strokeWidth={2}
                dot={{ fill: colors[0], strokeWidth: 2, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        );
      
      case "area":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[0]} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={colors[0]} stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xAxisKey} />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area 
                type="monotone" 
                dataKey={dataKey} 
                stroke={colors[0]} 
                fillOpacity={1} 
                fill="url(#colorValue)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        );
      
      case "pie":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey={dataKey}
                nameKey={xAxisKey}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ResponsiveContainer>
        );
      
      default:
        return (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Unsupported chart type
          </div>
        );
    }
  };

  return (
    <Card className={className} data-testid="chart-widget">
      <CardHeader>
        <CardTitle data-testid="chart-title">{title}</CardTitle>
        {description && (
          <CardDescription data-testid="chart-description">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={config}
          className="w-full"
          style={{ height: `${height}px` }}
        >
          {renderChart()}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// Preset chart widgets for common use cases
export function TeamMoodChart({ data, isLoading, ...props }: Omit<ChartWidgetProps, "title" | "config" | "type">) {
  const config = {
    mood: {
      label: "Average Mood",
      color: "hsl(var(--chart-1))",
    },
  } satisfies ChartConfig;

  return (
    <ChartWidget
      title="Team Mood Trend"
      description="Average team mood ratings over time"
      config={config}
      type="line"
      dataKey="mood"
      xAxisKey="date"
      data={data}
      isLoading={isLoading}
      {...props}
    />
  );
}

export function CheckinCompletionChart({ data, isLoading, ...props }: Omit<ChartWidgetProps, "title" | "config" | "type">) {
  const config = {
    completion: {
      label: "Completion Rate",
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig;

  return (
    <ChartWidget
      title="Check-in Completion"
      description="Daily check-in completion rates"
      config={config}
      type="bar"
      dataKey="completion"
      xAxisKey="date"
      data={data}
      isLoading={isLoading}
      {...props}
    />
  );
}

export function WinsCategoryChart({ data, isLoading, ...props }: Omit<ChartWidgetProps, "title" | "config" | "type">) {
  const config = {
    count: {
      label: "Wins Count",
      color: "hsl(var(--chart-3))",
    },
  } satisfies ChartConfig;

  return (
    <ChartWidget
      title="Wins by Category"
      description="Distribution of wins across different categories"
      config={config}
      type="pie"
      dataKey="count"
      xAxisKey="category"
      data={data}
      isLoading={isLoading}
      {...props}
    />
  );
}