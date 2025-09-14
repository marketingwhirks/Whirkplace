import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Checkins() {
  return (
    <>
      <Header
        title="Check-ins"
        description="View and manage team check-ins"
      />

      <main className="flex-1 overflow-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Check-ins Page</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Check-ins functionality will be implemented here.
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
