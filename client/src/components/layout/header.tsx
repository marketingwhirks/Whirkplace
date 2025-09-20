import { Bell, Slack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileSidebarTrigger } from "./sidebar";
import { UserProfile } from "./user-profile";

interface HeaderProps {
  title: string;
  description?: string;
}

export default function Header({ title, description }: HeaderProps) {
  return (
    <header className="bg-card border-b border-border p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MobileSidebarTrigger />
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-foreground">{title}</h2>
            {description && (
              <p className="text-muted-foreground text-sm md:text-base">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2 md:space-x-4">
          {/* Slack Integration Button - Hide text on mobile */}
          <Button
            variant="secondary"
            className="flex items-center space-x-2"
            data-testid="button-slack-integration"
          >
            <Slack className="w-4 h-4" />
            <span className="hidden sm:inline">Connected to Slack</span>
          </Button>
          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            data-testid="button-notifications"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 notification-badge bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
              3
            </span>
          </Button>
          {/* User Profile */}
          <UserProfile />
        </div>
      </div>
    </header>
  );
}
