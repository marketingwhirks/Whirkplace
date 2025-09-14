import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import RatingStars from "@/components/checkin/rating-stars";
import WinCard from "@/components/wins/win-card";
import TeamMemberCard from "@/components/team/team-member-card";
import CheckinDetail from "@/components/checkin/checkin-detail";
import { Heart, ClipboardCheck, Trophy, HelpCircle, Plus, Bell, UserCog } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Checkin, Win, User, Question } from "@shared/schema";

interface DashboardStats {
  averageRating: number;
  completionRate: number;
  totalCheckins: number;
}

// Mock current user - in real app this would come from auth context
const currentUser = {
  id: "current-user-id",
  name: "Sarah Johnson",
  role: "manager",
};

export default function Dashboard() {
  const { toast } = useToast();
  const [checkinData, setCheckinData] = useState({
    overallMood: 0,
    responses: {} as Record<string, string>,
  });
  const [selectedCheckin, setSelectedCheckin] = useState<(Checkin & { user?: User }) | null>(null);

  // Fetch data
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["/api/analytics/team-health"],
  });

  const { data: recentCheckins = [] } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins"],
    queryFn: () => fetch("/api/checkins?limit=5").then(res => res.json()),
  });

  const { data: recentWins = [] } = useQuery<Win[]>({
    queryKey: ["/api/wins", "recent"],
    queryFn: () => fetch("/api/wins?limit=5").then(res => res.json()),
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: questions = [] } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
  });

  // Get current week check-in
  const { data: currentCheckin } = useQuery<Checkin | null>({
    queryKey: ["/api/users", currentUser.id, "current-checkin"],
  });

  // Enhanced data with user lookups
  const enrichedCheckins = recentCheckins.map(checkin => ({
    ...checkin,
    user: users.find(u => u.id === checkin.userId),
  }));

  const enrichedWins = recentWins.map(win => ({
    ...win,
    user: users.find(u => u.id === win.userId),
    nominator: win.nominatedBy ? users.find(u => u.id === win.nominatedBy) : undefined,
  }));

  // Team structure (manager's reports)
  const teamMembers = users.filter(user => user.managerId === currentUser.id);

  const handleRatingChange = (rating: number) => {
    setCheckinData(prev => ({ ...prev, overallMood: rating }));
  };

  const handleResponseChange = (questionId: string, response: string) => {
    setCheckinData(prev => ({
      ...prev,
      responses: { ...prev.responses, [questionId]: response },
    }));
  };

  const handleSubmitCheckin = async () => {
    try {
      if (checkinData.overallMood === 0) {
        toast({
          variant: "destructive",
          title: "Rating required",
          description: "Please provide an overall mood rating.",
        });
        return;
      }

      const checkinPayload = {
        userId: currentUser.id,
        weekOf: new Date(),
        overallMood: checkinData.overallMood,
        responses: checkinData.responses,
        isComplete: true,
      };

      if (currentCheckin) {
        await apiRequest("PATCH", `/api/checkins/${currentCheckin.id}`, checkinPayload);
      } else {
        await apiRequest("POST", "/api/checkins", checkinPayload);
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/users", currentUser.id, "current-checkin"] });

      toast({
        title: "Check-in submitted!",
        description: "Your weekly check-in has been recorded.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Submission failed",
        description: "There was an error submitting your check-in.",
      });
    }
  };

  const handleSendReminder = async () => {
    try {
      await apiRequest("POST", "/api/slack/send-checkin-reminder", {});
      toast({
        title: "Reminder sent!",
        description: "Check-in reminders have been sent to team members.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to send reminder",
        description: "There was an error sending the reminder.",
      });
    }
  };

  return (
    <>
      <Header
        title="Dashboard"
        description="Welcome back! Here's what's happening with your team."
      />

      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Team Health</p>
                  <p className="text-2xl font-bold text-foreground" data-testid="text-team-health">
                    {stats?.averageRating.toFixed(1) || "0.0"}
                  </p>
                  <p className="text-xs text-green-600">+0.3 from last week</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <Heart className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Check-ins Complete</p>
                  <p className="text-2xl font-bold text-foreground" data-testid="text-checkin-complete">
                    {stats?.completionRate || 0}%
                  </p>
                  <p className="text-xs text-blue-600">12 of 14 team members</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <ClipboardCheck className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Wins This Week</p>
                  <p className="text-2xl font-bold text-foreground" data-testid="text-wins-count">
                    {recentWins.length}
                  </p>
                  <p className="text-xs text-yellow-600">+5 from last week</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Active Questions</p>
                  <p className="text-2xl font-bold text-foreground" data-testid="text-questions-count">
                    {questions.length}
                  </p>
                  <p className="text-xs text-purple-600">3 pending responses</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <HelpCircle className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Check-ins */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Recent Check-ins</CardTitle>
                  <Button variant="link" data-testid="button-view-all-checkins">
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {enrichedCheckins.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No check-ins yet. Encourage your team to submit their weekly check-ins!
                  </p>
                ) : (
                  enrichedCheckins.map((checkin) => (
                    <div key={checkin.id} className="flex items-center space-x-4 p-4 bg-muted rounded-lg">
                      {checkin.user?.avatar ? (
                        <img
                          src={checkin.user.avatar}
                          alt={`${checkin.user.name} avatar`}
                          className="w-12 h-12 rounded-full"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-primary-foreground font-medium">
                            {checkin.user?.name?.[0] || "?"}
                          </span>
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-foreground" data-testid={`text-checkin-user-${checkin.id}`}>
                            {checkin.user?.name || "Unknown User"}
                          </p>
                          <div className="flex items-center space-x-1">
                            <span className="text-sm text-muted-foreground">Overall:</span>
                            <RatingStars rating={checkin.overallMood} readonly size="sm" />
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1" data-testid={`text-checkin-preview-${checkin.id}`}>
                          {Object.values(checkin.responses)[0] || "No responses provided"}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-muted-foreground" data-testid={`text-checkin-timestamp-${checkin.id}`}>
                            {formatDistanceToNow(new Date(checkin.createdAt), { addSuffix: true })}
                          </span>
                          <Button 
                            variant="link" 
                            size="sm" 
                            onClick={() => setSelectedCheckin(checkin)}
                            data-testid={`button-view-checkin-${checkin.id}`}
                          >
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions & Wins */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full justify-start" data-testid="button-create-question">
                  <Plus className="w-4 h-4 mr-2" />
                  Create New Question
                </Button>
                <Button 
                  variant="secondary" 
                  className="w-full justify-start"
                  onClick={handleSendReminder}
                  data-testid="button-send-reminder"
                >
                  <Bell className="w-4 h-4 mr-2" />
                  Send Check-in Reminder
                </Button>
                <Button variant="secondary" className="w-full justify-start" data-testid="button-celebrate-win">
                  <Trophy className="w-4 h-4 mr-2" />
                  Celebrate a Win
                </Button>
                <Button variant="secondary" className="w-full justify-start" data-testid="button-manage-team">
                  <UserCog className="w-4 h-4 mr-2" />
                  Manage Team
                </Button>
              </CardContent>
            </Card>

            {/* Recent Wins */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Recent Wins 🎉</CardTitle>
                  <Button variant="link" data-testid="button-view-all-wins">
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {enrichedWins.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No wins yet. Start celebrating your team's achievements!
                  </p>
                ) : (
                  enrichedWins.map((win) => (
                    <WinCard
                      key={win.id}
                      win={win}
                      user={win.user}
                      nominator={win.nominator}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Team Structure & Check-in Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team Structure */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Team Structure</CardTitle>
                <Button variant="link" data-testid="button-edit-team-structure">
                  Edit Structure
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Team Lead */}
                <TeamMemberCard
                  user={{
                    id: currentUser.id,
                    name: currentUser.name,
                    role: "Engineering Manager",
                    username: "sarah.johnson",
                    password: "",
                    email: "sarah@teampulse.com",
                    teamId: null,
                    managerId: null,
                    avatar: null,
                    isActive: true,
                    createdAt: new Date(),
                  }}
                  isLead
                />

                {/* Team Members */}
                {teamMembers.length > 0 ? (
                  <div className="ml-6 space-y-3">
                    {teamMembers.map((member) => (
                      <TeamMemberCard
                        key={member.id}
                        user={member}
                        status="active"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="ml-6">
                    <p className="text-muted-foreground text-sm">
                      No team members assigned yet.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Check-in Interface */}
          <Card>
            <CardHeader>
              <CardTitle>Weekly Check-in</CardTitle>
              <p className="text-sm text-muted-foreground">
                How are you feeling this week?
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Overall Mood Rating */}
              <div>
                <Label className="text-sm font-medium text-foreground mb-3 block">
                  Overall Mood
                </Label>
                <RatingStars
                  rating={checkinData.overallMood}
                  onRatingChange={handleRatingChange}
                  size="lg"
                />
              </div>

              {/* Questions */}
              <div className="space-y-4">
                {questions.map((question) => (
                  <div key={question.id}>
                    <Label className="text-sm font-medium text-foreground mb-2 block">
                      {question.text}
                    </Label>
                    <Textarea
                      placeholder="Share your thoughts..."
                      value={checkinData.responses[question.id] || ""}
                      onChange={(e) => handleResponseChange(question.id, e.target.value)}
                      className="resize-none"
                      rows={3}
                      data-testid={`textarea-question-${question.id}`}
                    />
                  </div>
                ))}
              </div>

              {/* Submit Button */}
              <div className="flex justify-end space-x-3">
                <Button variant="secondary" data-testid="button-save-draft">
                  Save Draft
                </Button>
                <Button onClick={handleSubmitCheckin} data-testid="button-submit-checkin">
                  Submit Check-in
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Check-in Detail Modal */}
      {selectedCheckin && (
        <CheckinDetail
          checkin={selectedCheckin}
          questions={questions}
          open={!!selectedCheckin}
          onOpenChange={(open) => !open && setSelectedCheckin(null)}
        />
      )}
    </>
  );
}
