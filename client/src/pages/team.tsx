import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Team() {
  return (
    <>
      <Header
        title="Team"
        description="Manage your team structure and members"
      />

      <main className="flex-1 overflow-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Team Management</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Team management functionality will be implemented here.
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
