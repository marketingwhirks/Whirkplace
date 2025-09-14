import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Questions() {
  return (
    <>
      <Header
        title="Questions"
        description="Manage check-in questions for your team"
      />

      <main className="flex-1 overflow-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Question Management</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Question management functionality will be implemented here.
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
