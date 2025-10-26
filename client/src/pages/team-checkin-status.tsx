import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, addWeeks, differenceInDays } from "date-fns";
import { 
  CheckCircle, XCircle, Clock, Plane, Download, Filter, 
  AlertCircle, Users, TrendingDown, TrendingUp, Calendar,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import Papa from "papaparse";
import { getCheckinDueDate, getWeekStartCentral } from "@shared/utils/dueDates";
import type { User, Checkin, Team, Vacation, Organization } from "@shared/schema";

interface TeamMemberStatus {
  user: User;
  checkin: Checkin | null;
  vacation: Vacation | null;
  status: 'submitted' | 'missing' | 'on-vacation' | 'overdue';
  submittedAt?: Date;
  daysOverdue?: number;
  moodRating?: number;
  teamName?: string;
}

export default function TeamCheckinStatus() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [selectedWeek, setSelectedWeek] = useState(0); // 0 = current week, -1 = last week, etc.
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Calculate the week we're viewing
  const viewingWeekStart = useMemo(() => {
    return addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), selectedWeek);
  }, [selectedWeek]);
  
  const viewingWeekEnd = useMemo(() => {
    return addWeeks(viewingWeekStart, 1);
  }, [viewingWeekStart]);

  // Fetch organization data
  const { data: organization } = useQuery<Organization>({
    queryKey: ["/api/organizations", currentUser?.organizationId],
    enabled: !!currentUser?.organizationId,
  });

  // Fetch all teams
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    enabled: !!currentUser,
  });

  // Fetch all users (for admins) or team members (for managers)
  const { data: allUsers = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: currentUser?.role === 'admin' 
      ? ["/api/users?includeInactive=false"]
      : ["/api/users", currentUser?.id, "reports"],
    queryFn: async () => {
      if (!currentUser) return [];
      
      if (currentUser.role === 'admin') {
        const response = await apiRequest("GET", "/api/users?includeInactive=false");
        if (!response.ok) throw new Error('Failed to fetch users');
        return response.json();
      }
      
      // Managers see their direct reports
      if (currentUser.role === 'manager') {
        const response = await apiRequest("GET", `/api/users/${currentUser.id}/reports`);
        if (!response.ok) throw new Error('Failed to fetch reports');
        return response.json();
      }
      
      return [];
    },
    enabled: !!currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager'),
  });

  // Fetch check-ins for the selected week
  const { data: weekCheckins = [], isLoading: checkinsLoading } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins", "week", viewingWeekStart.toISOString()],
    queryFn: async () => {
      if (!currentUser || allUsers.length === 0) return [];
      
      // Fetch check-ins for all visible users for this specific week
      const allCheckins: Checkin[] = [];
      
      // We'll batch fetch for better performance
      const response = await apiRequest("GET", `/api/checkins?weekStart=${viewingWeekStart.toISOString()}`);
      if (response.ok) {
        const checkins = await response.json();
        // Filter to only include check-ins from users we can see
        const userIds = new Set(allUsers.map(u => u.id));
        return checkins.filter((c: Checkin) => userIds.has(c.userId));
      }
      
      return [];
    },
    enabled: !!currentUser && allUsers.length > 0,
  });

  // Fetch vacations for all team members
  const { data: allVacations = [], isLoading: vacationsLoading } = useQuery<Vacation[]>({
    queryKey: ["/api/vacations/team", allUsers.map(u => u.id).join(','), viewingWeekStart.toISOString()],
    queryFn: async () => {
      if (!currentUser || allUsers.length === 0) return [];
      
      const vacations: Vacation[] = [];
      
      // Batch fetch vacations (in production, we'd have a batch endpoint)
      for (const user of allUsers) {
        try {
          const response = await apiRequest("GET", `/api/vacations?userId=${user.id}`);
          if (response.ok) {
            const userVacations = await response.json();
            vacations.push(...userVacations);
          }
        } catch (error) {
          console.error(`Failed to fetch vacations for ${user.name}:`, error);
        }
      }
      
      return vacations;
    },
    enabled: !!currentUser && allUsers.length > 0,
  });

  // Process team member statuses
  const teamMemberStatuses = useMemo((): TeamMemberStatus[] => {
    if (!allUsers.length) return [];
    
    const dueDate = organization ? getCheckinDueDate(organization) : new Date();
    const now = new Date();
    
    return allUsers.map(user => {
      // Find check-in for this week
      const checkin = weekCheckins.find(c => 
        c.userId === user.id && 
        new Date(c.weekOf) >= viewingWeekStart && 
        new Date(c.weekOf) < viewingWeekEnd
      );
      
      // Check if user is on vacation this week
      const vacation = allVacations.find(v => 
        v.userId === user.id && 
        new Date(v.weekOf).getTime() === viewingWeekStart.getTime()
      );
      
      // Find team name
      const team = teams.find(t => t.id === user.teamId);
      
      // Determine status
      let status: TeamMemberStatus['status'] = 'missing';
      let daysOverdue: number | undefined;
      
      if (vacation) {
        status = 'on-vacation';
      } else if (checkin) {
        status = 'submitted';
      } else if (selectedWeek === 0 && now > dueDate) {
        // Only show overdue for current week
        status = 'overdue';
        daysOverdue = Math.floor(differenceInDays(now, dueDate));
      }
      
      return {
        user,
        checkin,
        vacation,
        status,
        submittedAt: checkin ? new Date(checkin.createdAt) : undefined,
        daysOverdue,
        moodRating: checkin?.overallMood,
        teamName: team?.name,
      };
    });
  }, [allUsers, weekCheckins, allVacations, teams, organization, viewingWeekStart, viewingWeekEnd, selectedWeek]);

  // Apply filters
  const filteredStatuses = useMemo(() => {
    let filtered = [...teamMemberStatuses];
    
    // Team filter
    if (selectedTeam !== "all") {
      filtered = filtered.filter(s => s.user.teamId === selectedTeam);
    }
    
    // Status filter
    if (statusFilter !== "all") {
      switch (statusFilter) {
        case "submitted":
          filtered = filtered.filter(s => s.status === 'submitted');
          break;
        case "missing":
          filtered = filtered.filter(s => s.status === 'missing' || s.status === 'overdue');
          break;
        case "on-vacation":
          filtered = filtered.filter(s => s.status === 'on-vacation');
          break;
      }
    }
    
    // Sort by status (overdue first, then missing, then vacation, then submitted)
    filtered.sort((a, b) => {
      const statusOrder = { overdue: 0, missing: 1, 'on-vacation': 2, submitted: 3 };
      return statusOrder[a.status] - statusOrder[b.status];
    });
    
    return filtered;
  }, [teamMemberStatuses, selectedTeam, statusFilter]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = filteredStatuses.length;
    const submitted = filteredStatuses.filter(s => s.status === 'submitted').length;
    const missing = filteredStatuses.filter(s => s.status === 'missing').length;
    const overdue = filteredStatuses.filter(s => s.status === 'overdue').length;
    const onVacation = filteredStatuses.filter(s => s.status === 'on-vacation').length;
    
    const submissionRate = total > 0 ? Math.round((submitted / (total - onVacation)) * 100) : 0;
    
    return { total, submitted, missing, overdue, onVacation, submissionRate };
  }, [filteredStatuses]);

  // Export to CSV
  const handleExportCSV = () => {
    const csvData = filteredStatuses.map(status => ({
      'Team Member': status.user.name,
      'Email': status.user.email,
      'Team': status.teamName || 'No Team',
      'Status': status.status === 'on-vacation' ? 'On Vacation' : 
                status.status === 'submitted' ? 'Submitted' : 
                status.status === 'overdue' ? 'Overdue' : 'Not Submitted',
      'Submitted At': status.submittedAt ? format(status.submittedAt, 'MMM dd, yyyy HH:mm') : '',
      'Mood Rating': status.moodRating || '',
      'Days Overdue': status.daysOverdue || '',
      'Vacation Note': status.vacation?.note || '',
    }));
    
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `team-checkin-status-${format(viewingWeekStart, 'yyyy-MM-dd')}.csv`;
    link.click();
    
    toast({
      title: "Export Successful",
      description: `Exported ${filteredStatuses.length} team member statuses to CSV`,
    });
  };

  // Check access
  if (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'manager') {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">This page is only accessible to managers and administrators.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = userLoading || usersLoading || checkinsLoading || vacationsLoading;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">Team Check-in Status</h1>
            <p className="text-muted-foreground mt-2">
              Monitor team check-in compliance and submission status
            </p>
          </div>
          <Button onClick={handleExportCSV} className="gap-2" data-testid="button-export-csv">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Members</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Submitted</p>
                  <p className="text-2xl font-bold text-green-600">{stats.submitted}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Missing</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats.missing}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Overdue</p>
                  <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Submission Rate</p>
                  <p className="text-2xl font-bold">{stats.submissionRate}%</p>
                </div>
                {stats.submissionRate >= 80 ? (
                  <TrendingUp className="w-8 h-8 text-green-600" />
                ) : (
                  <TrendingDown className="w-8 h-8 text-red-600" />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {/* Week Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSelectedWeek(selectedWeek - 1)}
                  data-testid="button-prev-week"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="min-w-[200px] text-center">
                  <div className="font-medium">
                    {format(viewingWeekStart, 'MMM dd')} - {format(addWeeks(viewingWeekStart, 1), 'MMM dd, yyyy')}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedWeek === 0 ? 'Current Week' : 
                     selectedWeek === -1 ? 'Last Week' : 
                     `${Math.abs(selectedWeek)} weeks ${selectedWeek < 0 ? 'ago' : 'ahead'}`}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSelectedWeek(selectedWeek + 1)}
                  disabled={selectedWeek >= 0}
                  data-testid="button-next-week"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {/* Team Filter (for admins) */}
              {currentUser?.role === 'admin' && (
                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                  <SelectTrigger className="w-48" data-testid="select-team-filter">
                    <SelectValue placeholder="Filter by team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Teams</SelectItem>
                    {teams.map(team => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="missing">Missing/Overdue</SelectItem>
                  <SelectItem value="on-vacation">On Vacation</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Team Member Status Grid */}
        <Card>
          <CardHeader>
            <CardTitle>Team Member Status</CardTitle>
            <CardDescription>
              Detailed check-in status for each team member
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : filteredStatuses.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Team Members Found</h3>
                <p className="text-muted-foreground">
                  No team members match the selected filters.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-muted/50 rounded-lg font-medium text-sm">
                  <div className="col-span-3">Team Member</div>
                  <div className="col-span-2">Team</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Submitted</div>
                  <div className="col-span-1">Mood</div>
                  <div className="col-span-2">Notes</div>
                </div>

                {/* Table Rows */}
                {filteredStatuses.map((status) => (
                  <div
                    key={status.user.id}
                    className={cn(
                      "grid grid-cols-12 gap-4 px-4 py-3 rounded-lg border transition-colors",
                      status.status === 'submitted' && "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800",
                      status.status === 'missing' && "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800",
                      status.status === 'overdue' && "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800",
                      status.status === 'on-vacation' && "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
                    )}
                    data-testid={`status-row-${status.user.id}`}
                  >
                    {/* Team Member */}
                    <div className="col-span-3 flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={status.user.avatar || undefined} />
                        <AvatarFallback>
                          {status.user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{status.user.name}</div>
                        <div className="text-xs text-muted-foreground">{status.user.email}</div>
                      </div>
                    </div>

                    {/* Team */}
                    <div className="col-span-2 flex items-center">
                      {status.teamName || 'No Team'}
                    </div>

                    {/* Status */}
                    <div className="col-span-2 flex items-center">
                      {status.status === 'submitted' && (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Submitted
                        </Badge>
                      )}
                      {status.status === 'missing' && (
                        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                          <Clock className="w-3 h-3 mr-1" />
                          Not Submitted
                        </Badge>
                      )}
                      {status.status === 'overdue' && (
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                          <XCircle className="w-3 h-3 mr-1" />
                          Overdue
                        </Badge>
                      )}
                      {status.status === 'on-vacation' && (
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          <Plane className="w-3 h-3 mr-1" />
                          On Vacation
                        </Badge>
                      )}
                    </div>

                    {/* Submitted Date/Time */}
                    <div className="col-span-2 flex items-center text-sm">
                      {status.submittedAt ? (
                        <div>
                          <div>{format(status.submittedAt, 'MMM dd')}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(status.submittedAt, 'h:mm a')}
                          </div>
                        </div>
                      ) : status.daysOverdue ? (
                        <span className="text-red-600 font-medium">
                          {status.daysOverdue} days overdue
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>

                    {/* Mood Rating */}
                    <div className="col-span-1 flex items-center">
                      {status.moodRating ? (
                        <div className="flex items-center gap-1">
                          <span className="text-lg">
                            {status.moodRating === 5 && '😄'}
                            {status.moodRating === 4 && '😊'}
                            {status.moodRating === 3 && '😐'}
                            {status.moodRating === 2 && '😕'}
                            {status.moodRating === 1 && '😔'}
                          </span>
                          <span className="text-sm">{status.moodRating}/5</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>

                    {/* Notes */}
                    <div className="col-span-2 flex items-center text-sm text-muted-foreground">
                      {status.vacation?.note || '-'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}