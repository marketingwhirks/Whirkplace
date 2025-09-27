import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { RoleSwitchProvider } from "@/hooks/useViewAsRole";
import { Skeleton } from "@/components/ui/skeleton";
import { DynamicThemeProvider } from "@/components/theme/DynamicThemeProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
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
import SuperAdmin from "@/pages/SuperAdmin";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import BusinessSignupPage from "@/pages/BusinessSignupPage";
import LandingPage from "@/pages/LandingPage";
import PartnerPage from "@/pages/PartnerPage";
import DevLogin from "@/pages/DevLogin";
import SelectOrganizationPage from "@/pages/select-organization";
import DemoPage from "@/pages/demo";
import DemoLoginPage from "@/pages/demo-login";
import RoadmapPage from "@/pages/roadmap";
import { OnboardingPage } from "@/pages/onboarding";
import OAuthCallbackPage from "@/pages/oauth-callback";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { BrandGuideViewer } from "@/components/BrandGuideViewer";
import { ThemeCustomizer } from "@/components/ThemeCustomizer";
import { TourProvider } from "@/contexts/TourProvider";

function Router() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Whirkplace" description="Team Culture Platform" />
        <main className="flex-1 overflow-auto">
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
            <Route path="/roadmap" component={RoadmapPage} />
            <Route path="/super-admin" component={SuperAdmin} />
            <Route path="/select-organization" component={SelectOrganizationPage} />
            <Route path="/brand-guide" component={BrandGuideViewer} />
            <Route path="/theme-customizer" component={ThemeCustomizer} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const { data: currentUser, isLoading } = useCurrentUser();

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

  // If no user (unauthenticated), show landing page
  if (!currentUser) {
    return <LandingPage />;
  }

  // Show main app if authenticated
  return (
    <DynamicThemeProvider>
      <TourProvider>
        <Router />
      </TourProvider>
    </DynamicThemeProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="whirkplace-ui-theme">
        <TooltipProvider>
          <RoleSwitchProvider>
            <Toaster />
            <Switch>
              <Route path="/demo" component={DemoPage} />
              <Route path="/demo/login" component={DemoLoginPage} />
              <Route path="/signup" component={SignupPage} />
              <Route path="/business-signup" component={BusinessSignupPage} />
              <Route path="/login" component={LoginPage} />
              <Route path="/partners" component={PartnerPage} />
              <Route path="/dev-login" component={DevLogin} />
              <Route path="/onboarding" component={OnboardingPage} />
              <Route path="/oauth-callback" component={OAuthCallbackPage} />
              <Route component={AuthenticatedApp} />
            </Switch>
          </RoleSwitchProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
