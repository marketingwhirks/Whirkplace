import { MobileSidebarTrigger } from "./sidebar";
import { UserProfile } from "./user-profile";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import NotificationsDropdown from "./notifications-dropdown";
import OrganizationSwitcher from "./organization-switcher";

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
          {/* Organization Switcher */}
          <OrganizationSwitcher />
          {/* Notifications */}
          <NotificationsDropdown />
          {/* Theme Toggle */}
          <ThemeToggle />
          {/* User Profile */}
          <UserProfile />
        </div>
      </div>
    </header>
  );
}
