import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Wins() {
  return (
    <>
      <Header
        title="Wins"
        description="Celebrate team achievements and successes"
      />

      <main className="flex-1 overflow-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Team Wins</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Wins celebration functionality will be implemented here.
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
