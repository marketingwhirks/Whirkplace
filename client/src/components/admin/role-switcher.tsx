import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRoleSwitch, type ViewAsRole } from "@/hooks/useViewAsRole";
import { Eye, EyeOff, Shield, UserCog, User, AlertTriangle } from "lucide-react";

export default function RoleSwitcher() {
  const {
    viewAsRole,
    actualUser,
    isViewingAsRole,
    canSwitchRoles,
    switchToRole,
    clearRoleSwitch,
  } = useRoleSwitch();

  // Only show to super admins
  if (!canSwitchRoles) {
    return null;
  }

  const handleRoleChange = (role: string) => {
    if (role === "actual") {
      clearRoleSwitch();
    } else {
      switchToRole(role as ViewAsRole);
    }
  };

  const getRoleIcon = (role: ViewAsRole) => {
    switch (role) {
      case "admin":
        return <Shield className="w-4 h-4" />;
      case "manager":
        return <UserCog className="w-4 h-4" />;
      case "member":
        return <User className="w-4 h-4" />;
    }
  };

  const getRoleBadge = (role: ViewAsRole) => {
    switch (role) {
      case "admin":
        return <Badge variant="destructive" className="flex items-center gap-1" data-testid="badge-viewing-admin">{getRoleIcon(role)}Admin</Badge>;
      case "manager":
        return <Badge variant="secondary" className="flex items-center gap-1" data-testid="badge-viewing-manager">{getRoleIcon(role)}Manager</Badge>;
      case "member":
        return <Badge variant="outline" className="flex items-center gap-1" data-testid="badge-viewing-member">{getRoleIcon(role)}Member</Badge>;
    }
  };

  return (
    <Card data-testid="card-role-switcher" className="border-orange-200 dark:border-orange-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          Role Testing Mode
          <Badge variant="outline" className="text-xs">Super Admin Only</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Current View: <strong>{actualUser?.name}</strong>
            </p>
            <div className="flex items-center gap-2">
              {isViewingAsRole ? (
                <>
                  <Eye className="w-4 h-4 text-orange-500" />
                  <span className="text-sm">Viewing as {getRoleBadge(viewAsRole!)}</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Viewing as actual role: {getRoleBadge(actualUser?.role as ViewAsRole)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={viewAsRole || "actual"}
            onValueChange={handleRoleChange}
            data-testid="select-view-as-role"
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select role to view as" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="actual" data-testid="option-actual-role">
                <div className="flex items-center gap-2">
                  <EyeOff className="w-4 h-4" />
                  Actual Role ({actualUser?.role})
                </div>
              </SelectItem>
              <SelectItem value="admin" data-testid="option-admin-role">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Admin
                </div>
              </SelectItem>
              <SelectItem value="manager" data-testid="option-manager-role">
                <div className="flex items-center gap-2">
                  <UserCog className="w-4 h-4" />
                  Manager
                </div>
              </SelectItem>
              <SelectItem value="member" data-testid="option-member-role">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Member
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {isViewingAsRole && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearRoleSwitch}
              data-testid="button-clear-role-switch"
            >
              Reset to Actual
            </Button>
          )}
        </div>

        {isViewingAsRole && (
          <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-md">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5" />
              <div className="text-sm text-orange-700 dark:text-orange-300">
                <p className="font-medium">Testing Mode Active</p>
                <p className="text-xs">
                  You are viewing the application as a <strong>{viewAsRole}</strong>. 
                  UI permissions and access will reflect this role for testing purposes.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}