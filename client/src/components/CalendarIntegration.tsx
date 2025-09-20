import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Users, ExternalLink, RefreshCw, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  timeZone?: string;
  location?: string;
  isOnlineMeeting?: boolean;
  meetingUrl?: string;
  attendees?: Array<{
    email: string;
    name?: string;
    type?: string;
  }>;
  organizer?: {
    email: string;
    name?: string;
  };
}

interface CalendarStatus {
  connected: boolean;
  provider: string;
}

export function CalendarIntegration() {
  const [view, setView] = useState<'overview' | 'events'>('overview');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check calendar connection status
  const { data: status, isLoading: statusLoading, error: statusError } = useQuery<CalendarStatus>({
    queryKey: ['/api/calendar/status'],
    retry: false
  });

  // Get upcoming calendar events
  const { data: events, isLoading: eventsLoading, refetch: refetchEvents } = useQuery<CalendarEvent[]>({
    queryKey: ['/api/calendar/events'],
    enabled: status?.connected,
    retry: false
  });

  // Refresh connection status
  const refreshStatus = useMutation({
    mutationFn: () => apiRequest('/api/calendar/status'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/status'] });
      toast({
        title: "Status refreshed",
        description: "Calendar connection status has been updated."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Refresh failed",
        description: error.message || "Failed to refresh connection status",
        variant: "destructive"
      });
    }
  });

  const formatEventTime = (startTime: string, endTime: string) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const today = new Date();
    
    const isToday = start.toDateString() === today.toDateString();
    const dateFormat = isToday ? '' : start.toLocaleDateString() + ' ';
    
    return `${dateFormat}${start.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })} - ${end.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })}`;
  };

  const isEventUpcoming = (startTime: string) => {
    const eventDate = new Date(startTime);
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    return eventDate > now && eventDate <= in24Hours;
  };

  const handleConnectCalendar = () => {
    // This would typically redirect to OAuth flow
    // For now, we'll show instructions
    toast({
      title: "Calendar Connection",
      description: "Please connect your Microsoft account in your Replit settings to enable calendar integration.",
    });
  };

  if (statusLoading) {
    return (
      <Card data-testid="calendar-loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Microsoft Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isConnected = status?.connected;

  return (
    <div className="space-y-6" data-testid="calendar-integration">
      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Microsoft Calendar Integration
            </div>
            <Badge variant={isConnected ? "default" : "secondary"} data-testid="connection-status">
              {isConnected ? "Connected" : "Not Connected"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Connect your Microsoft Calendar to schedule One-on-One meetings and sync events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusError && (
            <Alert data-testid="connection-error">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Unable to check calendar connection. Please try refreshing or contact support.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            {isConnected ? (
              <Button 
                variant="outline" 
                onClick={() => refreshStatus.mutate()}
                disabled={refreshStatus.isPending}
                data-testid="button-refresh-status"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshStatus.isPending ? 'animate-spin' : ''}`} />
                Refresh Status
              </Button>
            ) : (
              <Button 
                onClick={handleConnectCalendar}
                data-testid="button-connect-calendar"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Connect Calendar
              </Button>
            )}
          </div>

          {isConnected && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                <Calendar className="h-4 w-4" />
                <span className="font-medium">Calendar Connected</span>
              </div>
              <p className="text-sm text-green-600 dark:text-green-300 mt-1">
                Your Microsoft Calendar is connected and ready for scheduling meetings and events.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Events Overview */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Upcoming Events
              </div>
              <div className="flex gap-2">
                <Button
                  variant={view === 'overview' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setView('overview')}
                  data-testid="button-view-overview"
                >
                  Overview
                </Button>
                <Button
                  variant={view === 'events' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setView('events')}
                  data-testid="button-view-events"
                >
                  All Events
                </Button>
              </div>
            </CardTitle>
            <CardDescription>
              Your upcoming calendar events for better scheduling coordination
            </CardDescription>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="flex items-center justify-center p-8" data-testid="events-loading">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading events...</span>
              </div>
            ) : events && events.length > 0 ? (
              <div className="space-y-3" data-testid="events-list">
                {(view === 'overview' ? events.slice(0, 3) : events).map((event) => (
                  <div 
                    key={event.id} 
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    data-testid={`event-${event.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium" data-testid={`event-title-${event.id}`}>
                          {event.title}
                        </h4>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatEventTime(event.startTime, event.endTime)}
                          </span>
                          {event.attendees && event.attendees.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {event.location && (
                          <p className="text-sm text-muted-foreground mt-1" data-testid={`event-location-${event.id}`}>
                            📍 {event.location}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {isEventUpcoming(event.startTime) && (
                          <Badge variant="secondary" className="text-xs">
                            Soon
                          </Badge>
                        )}
                        {event.isOnlineMeeting && event.meetingUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            data-testid={`event-join-${event.id}`}
                          >
                            <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Join
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {view === 'overview' && events.length > 3 && (
                  <Button
                    variant="ghost"
                    onClick={() => setView('events')}
                    className="w-full mt-3"
                    data-testid="button-view-all-events"
                  >
                    View all {events.length} events
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center p-8 text-muted-foreground" data-testid="no-events">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No upcoming events found</p>
                <p className="text-sm mt-1">Your calendar events will appear here once you have them scheduled.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}