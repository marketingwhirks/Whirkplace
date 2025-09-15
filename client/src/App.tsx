import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
