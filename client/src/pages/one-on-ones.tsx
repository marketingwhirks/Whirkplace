import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, Plus, Clock, CheckSquare, User, Filter, Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useViewAsRole } from "@/hooks/useViewAsRole";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, isToday, isThisWeek, parseISO } from "date-fns";
import type { OneOnOne, User as UserType } from "@shared/schema";

interface OneOnOneMeeting extends OneOnOne {
  participant?: UserType;
  manager?: UserType;
}

interface UpcomingMeetingsResponse {
  meetings: OneOnOneMeeting[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface PastMeetingsResponse {
  meetings: OneOnOneMeeting[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

function ScheduleMeetingDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  
  const handleSchedule = () => {
    toast({
      title: "Coming Soon",
      description: "Meeting scheduling will be available soon!",
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule New One-on-One</DialogTitle>
          <DialogDescription>
            Schedule a one-on-one meeting with a team member.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-center py-8">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Meeting scheduling interface coming soon...
            </p>
            <Button 
              className="mt-4" 
              onClick={handleSchedule}
              data-testid="button-schedule-placeholder"
            >
              Schedule Meeting
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MeetingCard({ meeting }: { meeting: OneOnOneMeeting }) {
  const scheduledDate = typeof meeting.scheduledAt === 'string' 
    ? parseISO(meeting.scheduledAt) 
    : new Date(meeting.scheduledAt);
  const isUpcoming = scheduledDate > new Date();
  
  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`card-meeting-${meeting.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-4 h-4" />
              {meeting.participant?.name || "Unknown Participant"}
            </CardTitle>
            <CardDescription className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(scheduledDate, "PPP 'at' p")}
            </CardDescription>
          </div>
          <Badge variant={isUpcoming ? "default" : "secondary"}>
            {isUpcoming ? "Upcoming" : "Completed"}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-3">
          {meeting.notes && (
            <div>
              <p className="text-sm font-medium mb-1">Latest Notes:</p>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {meeting.notes}
              </p>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckSquare className="w-3 h-3" />
                Action Items: 0
              </span>
              <span>
                Status: {meeting.status}
              </span>
            </div>
            
            <Button variant="outline" size="sm" data-testid={`button-view-${meeting.id}`}>
              View Details
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UpcomingMeetings() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPeriod, setFilterPeriod] = useState<"all" | "today" | "week">("all");
  
  const { data: upcomingData, isLoading } = useQuery<UpcomingMeetingsResponse>({
    queryKey: ["/api/one-on-ones/upcoming", { page: 1, limit: 20 }],
    staleTime: 30 * 1000, // Cache for 30 seconds
  });

  const filteredMeetings = upcomingData?.meetings?.filter(meeting => {
    const meetingDate = typeof meeting.scheduledAt === 'string' 
      ? parseISO(meeting.scheduledAt) 
      : new Date(meeting.scheduledAt);
    const matchesSearch = !searchQuery || 
      meeting.participant?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesPeriod = filterPeriod === "all" || 
      (filterPeriod === "today" && isToday(meetingDate)) ||
      (filterPeriod === "week" && isThisWeek(meetingDate));
    
    return matchesSearch && matchesPeriod;
  }) || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by participant name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-meetings"
          />
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="justify-between min-w-32" data-testid="button-filter-period">
              <Filter className="w-4 h-4 mr-2" />
              {filterPeriod === "all" ? "All" : filterPeriod === "today" ? "Today" : "This Week"}
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setFilterPeriod("all")}>
              All Meetings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterPeriod("today")}>
              Today
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterPeriod("week")}>
              This Week
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Meetings List */}
      {filteredMeetings.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Upcoming Meetings</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "No meetings match your search criteria." : "You don't have any upcoming one-on-one meetings scheduled."}
              </p>
              <ScheduleMeetingDialog 
                trigger={
                  <Button data-testid="button-schedule-first">
                    <Plus className="w-4 h-4 mr-2" />
                    Schedule Your First Meeting
                  </Button>
                }
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredMeetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
          
          {filteredMeetings.length < (upcomingData?.pagination.total || 0) && (
            <div className="text-center py-4">
              <Button variant="outline" data-testid="button-load-more-upcoming">
                Load More Meetings
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PastMeetings() {
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: pastData, isLoading } = useQuery<PastMeetingsResponse>({
    queryKey: ["/api/one-on-ones/past", { page: 1, limit: 20 }],
    staleTime: 60 * 1000, // Cache for 1 minute
  });

  const filteredMeetings = pastData?.meetings?.filter(meeting => {
    return !searchQuery || 
      meeting.participant?.name?.toLowerCase().includes(searchQuery.toLowerCase());
  }) || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search past meetings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search-past-meetings"
        />
      </div>

      {/* Meetings List */}
      {filteredMeetings.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Past Meetings</h3>
              <p className="text-muted-foreground">
                {searchQuery ? "No past meetings match your search criteria." : "You haven't had any one-on-one meetings yet."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredMeetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
          
          {pastData?.pagination.hasMore && (
            <div className="text-center py-4">
              <Button variant="outline" data-testid="button-load-more-past">
                Load More Meetings
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OneOnOnesPage() {
  const { data: currentUser } = useViewAsRole();
  
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">One-on-One Meetings</h2>
          <p className="text-muted-foreground">
            Manage your one-on-one meetings and track progress with your team.
          </p>
        </div>
        
        <ScheduleMeetingDialog 
          trigger={
            <Button data-testid="button-schedule-meeting">
              <Plus className="w-4 h-4 mr-2" />
              Schedule Meeting
            </Button>
          }
        />
      </div>

      {/* Main Content */}
      <Tabs defaultValue="upcoming" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">
            Upcoming Meetings
          </TabsTrigger>
          <TabsTrigger value="past" data-testid="tab-past">
            Past Meetings
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="upcoming" className="space-y-4">
          <UpcomingMeetings />
        </TabsContent>
        
        <TabsContent value="past" className="space-y-4">
          <PastMeetings />
        </TabsContent>
      </Tabs>
    </div>
  );
}