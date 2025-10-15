import { useState, useEffect, useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useViewAsRole, useViewAsPermissions } from "@/hooks/useViewAsRole";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format, subDays, subWeeks, subMonths, subYears } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  CalendarIcon, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Heart, 
  Target, 
  Activity,
  Trophy,
  AlertCircle,
  FileText 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TourGuide } from "@/components/TourGuide";
import { TOUR_IDS } from "@/lib/tours/tour-configs";
import { useManagedTour } from "@/contexts/TourProvider";
import { WeeklySummary } from "@/components/analytics/WeeklySummary";

// Types and interfaces
interface FilterState {
  scope: 'organization' | 'team' | 'user';
  id?: string;
  period: 'day' | 'week' | 'month' | 'quarter' | 'year';
  from?: Date;
  to?: Date;
  direction?: 'given' | 'received' | 'all';
  visibility?: 'public' | 'private' | 'all';
}

interface OverviewData {
  pulseAvg: { current: number; previous: number; change: number };
  totalShoutouts: { current: number; previous: number; change: number };
  activeUsers: { current: number; previous: number; change: number };
  completedCheckins: { current: number; previous: number; change: number };
}

interface PulseMetric {
  periodStart: string;
  avgMood: number;
  checkinCount: number;
}

interface ShoutoutMetric {
  periodStart: string;
  count: number;
}

interface LeaderboardEntry {
  entityId: string;
  entityName: string;
  value: number;
}

interface Team {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
  role: string;
  teamId: string | null;
}

// Default filter values
const DEFAULT_FILTERS: FilterState = {
  scope: 'organization',
  period: 'month',
  direction: 'all',
  visibility: 'all'
};

// Utility functions
const formatDate = (date: Date | undefined) => {
  if (!date) return undefined;
  return format(date, 'yyyy-MM-dd');
};

const parseDate = (dateStr: string | null) => {
  if (!dateStr) return undefined;
  try {
    return new Date(dateStr);
  } catch {
    return undefined;
  }
};

const getDefaultDateRange = (period: string) => {
  const now = new Date();
  switch (period) {
    case 'day':
      return { from: subDays(now, 30), to: now };
    case 'week':
      return { from: subWeeks(now, 12), to: now };
    case 'month':
      return { from: subMonths(now, 12), to: now };
    case 'quarter':
      return { from: subYears(now, 2), to: now };
    case 'year':
      return { from: subYears(now, 5), to: now };
    default:
      return { from: subMonths(now, 12), to: now };
  }
};

// Hook for URL state management
const useUrlSync = (filters: FilterState, setFilters: (filters: FilterState) => void) => {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    const urlFilters: FilterState = {
      scope: (params.get('scope') as FilterState['scope']) || DEFAULT_FILTERS.scope,
      id: params.get('id') || undefined,
      period: (params.get('period') as FilterState['period']) || DEFAULT_FILTERS.period,
      from: parseDate(params.get('from')),
      to: parseDate(params.get('to')),
      direction: (params.get('direction') as FilterState['direction']) || DEFAULT_FILTERS.direction,
      visibility: (params.get('visibility') as FilterState['visibility']) || DEFAULT_FILTERS.visibility
    };

    setFilters(urlFilters);
  }, []);

  const updateUrl = (newFilters: FilterState) => {
    const params = new URLSearchParams();
    
    if (newFilters.scope !== DEFAULT_FILTERS.scope) params.set('scope', newFilters.scope);
    if (newFilters.id) params.set('id', newFilters.id);
    if (newFilters.period !== DEFAULT_FILTERS.period) params.set('period', newFilters.period);
    if (newFilters.from) params.set('from', formatDate(newFilters.from)!);
    if (newFilters.to) params.set('to', formatDate(newFilters.to)!);
    if (newFilters.direction && newFilters.direction !== DEFAULT_FILTERS.direction) params.set('direction', newFilters.direction);
    if (newFilters.visibility && newFilters.visibility !== DEFAULT_FILTERS.visibility) params.set('visibility', newFilters.visibility);

    const search = params.toString();
    const url = search ? `/analytics?${search}` : '/analytics';
    window.history.replaceState({}, '', url);
  };

  return updateUrl;
};

// Loading skeleton components
const OverviewCardSkeleton = () => (
  <Card>
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      <div className="mt-4">
        <Skeleton className="h-3 w-20" />
      </div>
    </CardContent>
  </Card>
);

const ChartSkeleton = () => (
  <Card>
    <CardHeader>
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-4 w-48" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-[300px] w-full" />
    </CardContent>
  </Card>
);

const TableSkeleton = () => (
  <Card>
    <CardHeader>
      <Skeleton className="h-6 w-32" />
    </CardHeader>
    <CardContent>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

// Filters Bar Component
const FiltersBar = ({ 
  filters, 
  onFiltersChange,
  teams,
  users,
  currentUser,
  canViewScope
}: {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  teams: Team[];
  users: User[];
  currentUser?: User;
  canViewScope: (scope: "organization" | "team" | "user") => boolean;
}) => {
  const entityOptions = useMemo(() => {
    if (filters.scope === 'team') return teams;
    if (filters.scope === 'user') return users;
    return [];
  }, [filters.scope, teams, users]);
  
  // Get available scope options based on user role
  const availableScopeOptions = useMemo(() => {
    const options = [];
    
    if (canViewScope('organization')) {
      options.push({ value: 'organization', label: 'Organization' });
    }
    
    if (canViewScope('team')) {
      options.push({ value: 'team', label: 'Team' });
    }
    
    if (canViewScope('user')) {
      options.push({ value: 'user', label: 'User' });
    }
    
    return options;
  }, [canViewScope]);

  const defaultRange = getDefaultDateRange(filters.period);
  const actualFrom = filters.from || defaultRange.from;
  const actualTo = filters.to || defaultRange.to;

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {/* Scope Selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Scope</Label>
            <Select 
              value={filters.scope} 
              onValueChange={(scope: FilterState['scope']) => 
                onFiltersChange({ ...filters, scope, id: undefined })
              }
              data-testid="filter-scope"
              disabled={availableScopeOptions.length <= 1}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select scope" />
              </SelectTrigger>
              <SelectContent>
                {availableScopeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Show role restriction hint */}
            {currentUser?.role === 'member' && (
              <div className="text-xs text-muted-foreground">
                <AlertCircle className="inline h-3 w-3 mr-1" />
                Restricted to your personal data
              </div>
            )}
            {currentUser?.role === 'manager' && (
              <div className="text-xs text-muted-foreground">
                <AlertCircle className="inline h-3 w-3 mr-1" />
                Restricted to your team data
              </div>
            )}
          </div>

          {/* Entity Picker */}
          {(filters.scope === 'team' || filters.scope === 'user') && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {filters.scope === 'team' ? 'Team' : 'User'}
              </Label>
              <Select 
                value={filters.id || ''} 
                onValueChange={(id) => onFiltersChange({ ...filters, id: id || undefined })}
                data-testid="filter-entity"
                disabled={entityOptions.length <= 1}
              >
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${filters.scope}`} />
                </SelectTrigger>
                <SelectContent>
                  {entityOptions.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {entity.name}
                      {/* Show "you" indicator for current user */}
                      {entity.id === currentUser?.id && (
                        <span className="text-muted-foreground ml-1">(you)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Show locked entity hint */}
              {entityOptions.length === 1 && (
                <div className="text-xs text-muted-foreground">
                  <AlertCircle className="inline h-3 w-3 mr-1" />
                  {currentUser?.role === 'member' ? 'Locked to your account' : 'Locked to your team'}
                </div>
              )}
            </div>
          )}

          {/* Period Selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Period</Label>
            <Select 
              value={filters.period} 
              onValueChange={(period: FilterState['period']) => {
                const defaultRange = getDefaultDateRange(period);
                onFiltersChange({ 
                  ...filters, 
                  period,
                  from: defaultRange.from,
                  to: defaultRange.to
                });
              }}
              data-testid="filter-period"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily</SelectItem>
                <SelectItem value="week">Weekly</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="quarter">Quarterly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="space-y-2 col-span-1 md:col-span-2">
            <Label className="text-sm font-medium">Date Range</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start text-left font-normal"
                    data-testid="filter-date-from"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {actualFrom ? format(actualFrom, "MMM dd, yyyy") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={actualFrom}
                    onSelect={(date) => onFiltersChange({ ...filters, from: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start text-left font-normal"
                    data-testid="filter-date-to"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {actualTo ? format(actualTo, "MMM dd, yyyy") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={actualTo}
                    onSelect={(date) => onFiltersChange({ ...filters, to: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Direction & Visibility for Shoutouts */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Direction</Label>
            <Select 
              value={filters.direction || 'all'} 
              onValueChange={(direction: string) => 
                onFiltersChange({ ...filters, direction: direction as FilterState['direction'] })
              }
              data-testid="filter-direction"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="given">Given</SelectItem>
                <SelectItem value="received">Received</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Overview Cards Component
const OverviewCards = ({ filters }: { filters: FilterState }) => {
  const queryKey = [
    '/api/analytics/overview',
    {
      scope: filters.scope,
      id: filters.id,
      period: filters.period,
      from: formatDate(filters.from),
      to: formatDate(filters.to)
    }
  ];

  const { data: overview, isLoading, error } = useQuery<OverviewData>({
    queryKey,
    placeholderData: keepPreviousData,
    enabled: filters.scope === 'organization' || !!filters.id
  });

  if (error) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load overview data</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <OverviewCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Average Pulse",
      value: overview?.pulseAvg.current || 0,
      change: overview?.pulseAvg.change || 0,
      icon: Heart,
      format: (val: number) => val.toFixed(1),
      testId: "card-pulse-avg"
    },
    {
      title: "Total Shoutouts",
      value: overview?.totalShoutouts.current || 0,
      change: overview?.totalShoutouts.change || 0,
      icon: Trophy,
      format: (val: number) => val.toString(),
      testId: "card-total-shoutouts"
    },
    {
      title: "Active Users",
      value: overview?.activeUsers.current || 0,
      change: overview?.activeUsers.change || 0,
      icon: Users,
      format: (val: number) => val.toString(),
      testId: "card-active-users"
    },
    {
      title: "Completed Check-ins",
      value: overview?.completedCheckins.current || 0,
      change: overview?.completedCheckins.change || 0,
      icon: Activity,
      format: (val: number) => val.toString(),
      testId: "card-completed-checkins"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const isPositive = card.change >= 0;

        return (
          <Card key={card.title} data-testid={card.testId}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold" data-testid={`${card.testId}-value`}>
                    {card.format(card.value)}
                  </p>
                </div>
                <Icon className="h-10 w-10 text-muted-foreground" />
              </div>
              <div className="mt-4 flex items-center text-sm">
                {isPositive ? (
                  <TrendingUp className="mr-1 h-3 w-3 text-green-600" />
                ) : (
                  <TrendingDown className="mr-1 h-3 w-3 text-red-600" />
                )}
                <span 
                  className={cn(
                    "font-medium",
                    isPositive ? "text-green-600" : "text-red-600"
                  )}
                  data-testid={`${card.testId}-change`}
                >
                  {isPositive ? '+' : ''}{card.change.toFixed(1)}%
                </span>
                <span className="text-muted-foreground ml-1">vs last period</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

// Pulse Chart Component
const PulseChart = ({ filters }: { filters: FilterState }) => {
  const queryKey = [
    '/api/analytics/pulse',
    {
      scope: filters.scope,
      id: filters.id,
      period: filters.period,
      from: formatDate(filters.from),
      to: formatDate(filters.to)
    }
  ];

  const { data: pulseData, isLoading, error } = useQuery<PulseMetric[]>({
    queryKey,
    placeholderData: keepPreviousData,
    enabled: filters.scope === 'organization' || !!filters.id
  });

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pulse Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to load pulse data</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <ChartSkeleton />;
  }

  const chartData = pulseData?.map(item => ({
    period: format(new Date(item.periodStart), filters.period === 'day' ? 'MMM dd' : 'MMM yyyy'),
    avgMood: item.avgMood,
    checkinCount: item.checkinCount
  })) || [];

  return (
    <Card data-testid="chart-pulse">
      <CardHeader>
        <CardTitle>Pulse Trend</CardTitle>
        <p className="text-sm text-muted-foreground">
          Average mood ratings over time
        </p>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis domain={[0, 5]} />
              <Tooltip 
                formatter={(value: number) => [value.toFixed(1), 'Avg Mood']}
                labelFormatter={(label) => `Period: ${label}`}
              />
              <Area 
                type="monotone" 
                dataKey="avgMood" 
                stroke="#8884d8" 
                fill="#8884d8" 
                fillOpacity={0.3} 
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No pulse data available for the selected period
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Shoutouts Chart Component
const ShoutoutsChart = ({ filters }: { filters: FilterState }) => {
  const queryKey = [
    '/api/analytics/shoutouts',
    {
      scope: filters.scope,
      id: filters.id,
      period: filters.period,
      from: formatDate(filters.from),
      to: formatDate(filters.to),
      direction: filters.direction,
      visibility: filters.visibility
    }
  ];

  const { data: shoutoutData, isLoading, error } = useQuery<ShoutoutMetric[]>({
    queryKey,
    placeholderData: keepPreviousData,
    enabled: filters.scope === 'organization' || !!filters.id
  });

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Shoutouts Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to load shoutouts data</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <ChartSkeleton />;
  }

  const chartData = shoutoutData?.map(item => ({
    period: format(new Date(item.periodStart), filters.period === 'day' ? 'MMM dd' : 'MMM yyyy'),
    count: item.count
  })) || [];

  return (
    <Card data-testid="chart-shoutouts">
      <CardHeader>
        <CardTitle>Shoutouts Trend</CardTitle>
        <p className="text-sm text-muted-foreground">
          Number of shoutouts over time ({filters.direction} · {filters.visibility})
        </p>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip 
                formatter={(value: number) => [value, 'Shoutouts']}
                labelFormatter={(label) => `Period: ${label}`}
              />
              <Bar dataKey="count" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No shoutout data available for the selected period
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Leaderboard Component
const Leaderboard = ({ filters }: { filters: FilterState }) => {
  const [metric, setMetric] = useState<'shoutouts_received' | 'shoutouts_given' | 'pulse_avg'>('shoutouts_received');

  const queryKey = [
    '/api/analytics/leaderboard',
    {
      metric,
      scope: filters.scope,
      id: filters.id,
      period: filters.period,
      from: formatDate(filters.from),
      to: formatDate(filters.to)
    }
  ];

  const { data: leaderboard, isLoading, error } = useQuery<LeaderboardEntry[]>({
    queryKey,
    placeholderData: keepPreviousData,
    enabled: filters.scope === 'organization' || !!filters.id
  });

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to load leaderboard data</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <TableSkeleton />;
  }

  return (
    <Card data-testid="leaderboard">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Leaderboard</CardTitle>
          <Select 
            value={metric} 
            onValueChange={(value: string) => setMetric(value as typeof metric)}
            data-testid="leaderboard-metric"
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shoutouts_received">Shoutouts Received</SelectItem>
              <SelectItem value="shoutouts_given">Shoutouts Given</SelectItem>
              <SelectItem value="pulse_avg">Average Pulse</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {leaderboard && leaderboard.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">
                  {metric === 'pulse_avg' ? 'Avg Rating' : 'Count'}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.slice(0, 10).map((entry, index) => (
                <TableRow key={entry.entityId} data-testid={`leaderboard-row-${index}`}>
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      <span className="mr-2">#{index + 1}</span>
                      {index < 3 && (
                        <Trophy className={cn(
                          "h-4 w-4",
                          index === 0 && "text-yellow-500",
                          index === 1 && "text-gray-400", 
                          index === 2 && "text-orange-600"
                        )} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell data-testid={`leaderboard-name-${index}`}>
                    {entry.entityName}
                  </TableCell>
                  <TableCell className="text-right" data-testid={`leaderboard-value-${index}`}>
                    {metric === 'pulse_avg' ? entry.value.toFixed(1) : entry.value}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            No leaderboard data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Main Analytics Component
export default function Analytics() {
  // Get current user and permissions
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const { canViewScope, getDefaultScope, getEntityId } = useViewAsPermissions();
  
  // Tour management
  const tourManager = useManagedTour(TOUR_IDS.ANALYTICS_GUIDE);
  
  // Initialize filters based on user role
  const getInitialFilters = (): FilterState => {
    if (!currentUser) return DEFAULT_FILTERS;
    
    const defaultScope = getDefaultScope();
    const defaultEntityId = getEntityId(defaultScope);
    
    return {
      ...DEFAULT_FILTERS,
      scope: defaultScope,
      id: defaultEntityId
    };
  };

  const [filters, setFilters] = useState<FilterState>(getInitialFilters);
  const updateUrl = useUrlSync(filters, setFilters);
  const [showWeeklySummary, setShowWeeklySummary] = useState(false);

  // Update filters when user data loads
  useEffect(() => {
    if (currentUser && filters.scope === DEFAULT_FILTERS.scope) {
      const roleBasedFilters = getInitialFilters();
      setFilters(roleBasedFilters);
      updateUrl(roleBasedFilters);
    }
  }, [currentUser]);

  // Load teams and users for filter options (filtered by user permissions)
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ['/api/teams'],
    enabled: !!currentUser
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/users'], 
    enabled: !!currentUser
  });

  // Filter teams and users based on user permissions
  const availableTeams = useMemo(() => {
    if (!currentUser) return [];
    
    switch (currentUser.role) {
      case 'admin':
        return teams; // Admins see all teams
      case 'manager':
        return teams.filter(team => team.id === currentUser.teamId); // Managers see only their team
      case 'member':
        return []; // Members don't see team options
      default:
        return [];
    }
  }, [teams, currentUser]);

  const availableUsers = useMemo(() => {
    if (!currentUser) return [];
    
    switch (currentUser.role) {
      case 'admin':
        return users; // Admins see all users
      case 'manager':
        return users.filter(user => user.teamId === currentUser.teamId); // Managers see team members
      case 'member':
        return users.filter(user => user.id === currentUser.id); // Members see only themselves
      default:
        return [];
    }
  }, [users, currentUser]);

  const handleFiltersChange = (newFilters: FilterState) => {
    // Validate that the new filters are allowed for the current user
    if (!canViewScope(newFilters.scope)) {
      // If scope is not allowed, enforce the user's default scope
      const allowedScope = getDefaultScope();
      const allowedEntityId = getEntityId(allowedScope);
      
      newFilters = {
        ...newFilters,
        scope: allowedScope,
        id: allowedEntityId
      };
    }
    
    // For members, always enforce their own user ID
    if (currentUser?.role === 'member' && newFilters.scope === 'user') {
      newFilters = {
        ...newFilters,
        id: currentUser.id
      };
    }
    
    // For managers with team scope, enforce their team ID
    if (currentUser?.role === 'manager' && newFilters.scope === 'team') {
      newFilters = {
        ...newFilters,
        id: currentUser.teamId || undefined
      };
    }
    
    setFilters(newFilters);
    updateUrl(newFilters);
  };

  // Set default date range if not provided
  const filtersWithDefaults = useMemo(() => {
    const defaultRange = getDefaultDateRange(filters.period);
    return {
      ...filters,
      from: filters.from || defaultRange.from,
      to: filters.to || defaultRange.to
    };
  }, [filters]);

  // Show loading state while user data is being fetched
  if (userLoading || !currentUser) {
    return (
        <main className="flex-1 overflow-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <OverviewCardSkeleton key={i} />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
          <TableSkeleton />
        </main>
    );
  }

  return (
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* Tour Guide for analytics */}
        {tourManager.shouldShow && (
          <TourGuide
            tourId={TOUR_IDS.ANALYTICS_GUIDE}
            onComplete={tourManager.handleComplete}
            onSkip={tourManager.handleSkip}
            autoStart={true}
            delay={1000}
          />
        )}
        
        {/* User Role Badge */}
        {currentUser && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge 
                variant={currentUser.role === 'admin' ? 'default' : currentUser.role === 'manager' ? 'secondary' : 'outline'}
                data-testid="user-role-badge"
              >
                {currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)} Access
              </Badge>
              <span className="text-sm text-muted-foreground">
                Viewing as: {currentUser.name}
              </span>
            </div>
          </div>
        )}

        {/* Weekly Summary - Show for managers and admins */}
        {currentUser?.role !== 'member' && (
          <div className="space-y-4">
            {!showWeeklySummary && (
              <div className="flex justify-start">
                <Button 
                  onClick={() => setShowWeeklySummary(true)}
                  className="flex items-center gap-2"
                  data-testid="button-generate-weekly-summary"
                >
                  <FileText className="w-4 h-4" />
                  Generate Weekly Summary
                </Button>
              </div>
            )}
            <WeeklySummary shouldFetch={showWeeklySummary} />
          </div>
        )}

        {/* Filters */}
        <div data-testid="analytics-filters">
          <FiltersBar 
            filters={filters}
            onFiltersChange={handleFiltersChange}
            teams={availableTeams}
            users={availableUsers}
            currentUser={currentUser}
            canViewScope={canViewScope}
          />
        </div>

        {/* Overview Cards */}
        <OverviewCards filters={filtersWithDefaults} />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PulseChart filters={filtersWithDefaults} />
          <ShoutoutsChart filters={filtersWithDefaults} />
        </div>

        {/* Leaderboard */}
        <Leaderboard filters={filtersWithDefaults} />
      </main>
  );
}