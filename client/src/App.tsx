import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { RoleSwitchProvider } from "@/hooks/useViewAsRole";
import { Skeleton } from "@/components/ui/skeleton";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Checkins from "@/pages/checkins";
import Team from "@/pages/team";
import Wins from "@/pages/wins";
import ShoutoutsPage from "@/pages/shoutouts";
import Questions from "@/pages/questions";
import Reviews from "@/pages/reviews";
import LeadershipDashboard from "@/pages/leadership-dashboard";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import Admin from "@/pages/admin";
import LoginPage from "@/pages/login";
import Sidebar from "@/components/layout/sidebar";

function Router() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/checkins" component={Checkins} />
          <Route path="/team" component={Team} />
          <Route path="/wins" component={Wins} />
          <Route path="/shoutouts" component={ShoutoutsPage} />
          <Route path="/questions" component={Questions} />
          <Route path="/reviews" component={Reviews} />
          <Route path="/leadership-dashboard" component={LeadershipDashboard} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/settings" component={Settings} />
          <Route path="/admin" component={Admin} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const { data: currentUser, isLoading, error } = useCurrentUser();

  // Show loading screen while checking authentication
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Skeleton className="w-12 h-12 mx-auto rounded-lg" />
          <Skeleton className="w-32 h-6 mx-auto" />
          <Skeleton className="w-24 h-4 mx-auto" />
        </div>
      </div>
    );
  }

  // Show login page only if definitely not authenticated (401 error)
  if (error && error.message.includes('401')) {
    return <LoginPage />;
  }
  
  // If we have an error but it's not 401, show loading (temporary issue)
  if (error && !currentUser) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Skeleton className="w-12 h-12 mx-auto rounded-lg" />
          <Skeleton className="w-32 h-6 mx-auto" />
          <div className="text-sm text-muted-foreground">Loading user data...</div>
        </div>
      </div>
    );
  }
  
  // Show login page if definitely no user
  if (!currentUser) {
    return <LoginPage />;
  }

  // Show main app if authenticated
  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RoleSwitchProvider>
          <Toaster />
          <AuthenticatedApp />
        </RoleSwitchProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
