import type { User } from "@shared/schema";
import { cn } from "@/lib/utils";

interface TeamMemberCardProps {
  user: User;
  isLead?: boolean;
  status?: "active" | "needs-checkin" | "inactive";
  onClick?: () => void;
}

export default function TeamMemberCard({
  user,
  isLead = false,
  status = "active",
  onClick,
}: TeamMemberCardProps) {
  const statusConfig = {
    active: {
      dot: "bg-green-500",
      text: "Active",
    },
    "needs-checkin": {
      dot: "bg-yellow-500",
      text: "Needs Check-in",
    },
    inactive: {
      dot: "bg-gray-500",
      text: "Inactive",
    },
  };

  return (
    <div
      className={cn(
        "flex items-center space-x-3 p-3 rounded-lg border border-border",
        isLead ? "bg-primary/10" : "bg-card",
        onClick && "cursor-pointer hover:bg-accent"
      )}
      onClick={onClick}
      data-testid={`card-team-member-${user.id}`}
    >
      {user.avatar ? (
        <img
          src={user.avatar}
          alt={`${user.name} avatar`}
          className={cn("rounded-full", isLead ? "w-10 h-10" : "w-8 h-8")}
        />
      ) : (
        <div
          className={cn(
            "rounded-full bg-primary flex items-center justify-center",
            isLead ? "w-10 h-10" : "w-8 h-8"
          )}
        >
          <span className="text-primary-foreground text-sm font-medium">
            {user.name[0]}
          </span>
        </div>
      )}
      <div className="flex-1">
        <p
          className={cn(
            "text-foreground",
            isLead ? "font-medium" : "font-medium text-sm"
          )}
          data-testid={`text-member-name-${user.id}`}
        >
          {user.name}
        </p>
        <p
          className={cn(
            "text-muted-foreground",
            isLead ? "text-sm" : "text-xs"
          )}
          data-testid={`text-member-role-${user.id}`}
        >
          {user.role}
        </p>
      </div>
      {isLead ? (
        <span className="px-2 py-1 bg-primary text-primary-foreground text-xs rounded-full">
          Lead
        </span>
      ) : (
        <div className="flex items-center space-x-1">
          <div className={`w-2 h-2 rounded-full ${statusConfig[status].dot}`} />
          <span className="text-xs text-muted-foreground">
            {statusConfig[status].text}
          </span>
        </div>
      )}
    </div>
  );
}
