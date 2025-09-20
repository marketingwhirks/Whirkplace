import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { RoleSwitchProvider } from "@/hooks/useViewAsRole";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpButton } from "@/components/support/HelpButton";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Checkins from "@/pages/checkins";
import OneOnOnesPage from "@/pages/one-on-ones";
import KraManagementPage from "@/pages/kra-management";
import Team from "@/pages/team";
import Wins from "@/pages/wins";
import ShoutoutsPage from "@/pages/shoutouts";
import Questions from "@/pages/questions";
import Reviews from "@/pages/reviews";
import LeadershipDashboard from "@/pages/leadership-dashboard";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import Admin from "@/pages/admin";
import SuperAdminPage from "@/pages/SuperAdminPage";
import LoginPage from "@/pages/login";
import BusinessSignupPage from "@/pages/BusinessSignupPage";
import Sidebar from "@/components/layout/sidebar";
import { BrandGuideViewer } from "@/components/BrandGuideViewer";

function Router() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/checkins" component={Checkins} />
          <Route path="/one-on-ones" component={OneOnOnesPage} />
          <Route path="/kra-management" component={KraManagementPage} />
          <Route path="/team" component={Team} />
          <Route path="/wins" component={Wins} />
          <Route path="/shoutouts" component={ShoutoutsPage} />
          <Route path="/questions" component={Questions} />
          <Route path="/reviews" component={Reviews} />
          <Route path="/leadership-dashboard" component={LeadershipDashboard} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/settings" component={Settings} />
          <Route path="/admin" component={Admin} />
          <Route path="/super-admin" component={SuperAdminPage} />
          <Route path="/brand-guide" component={BrandGuideViewer} />
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

  // If authentication failed or no user, redirect to login
  if (error || !currentUser) {
    return <LoginPage />;
  }

  // Show main app if authenticated
  return (
    <>
      <Router />
      <HelpButton />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RoleSwitchProvider>
          <Toaster />
          <Switch>
            <Route path="/signup" component={BusinessSignupPage} />
            <Route path="/login" component={LoginPage} />
            <Route component={AuthenticatedApp} />
          </Switch>
        </RoleSwitchProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
