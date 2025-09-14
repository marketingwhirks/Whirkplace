import { formatDistanceToNow } from "date-fns";
import type { Win, User } from "@shared/schema";

interface WinCardProps {
  win: Win;
  user?: User;
  nominator?: User;
}

export default function WinCard({ win, user, nominator }: WinCardProps) {
  const borderColors = [
    "border-l-yellow-400 bg-yellow-50",
    "border-l-green-400 bg-green-50",
    "border-l-blue-400 bg-blue-50",
    "border-l-purple-400 bg-purple-50",
  ];

  const randomColor = borderColors[Math.floor(Math.random() * borderColors.length)];

  return (
    <div className={`p-3 border-l-4 rounded-r-lg ${randomColor}`}>
      <div className="flex items-start space-x-3">
        {user?.avatar ? (
          <img
            src={user.avatar}
            alt={`${user.name} avatar`}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-sm font-medium">
              {user?.name?.[0] || "?"}
            </span>
          </div>
        )}
        <div className="flex-1">
          <p className="font-medium text-foreground text-sm" data-testid={`text-win-title-${win.id}`}>
            {win.title}
          </p>
          <p className="text-xs text-muted-foreground" data-testid={`text-win-description-${win.id}`}>
            {win.description}
          </p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground" data-testid={`text-win-timestamp-${win.id}`}>
              {formatDistanceToNow(new Date(win.createdAt), { addSuffix: true })}
            </p>
            {nominator && (
              <p className="text-xs text-muted-foreground">
                Nominated by {nominator.name}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
