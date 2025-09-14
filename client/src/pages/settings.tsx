import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Settings() {
  return (
    <>
      <Header
        title="Settings"
        description="Configure your TeamPulse preferences"
      />

      <main className="flex-1 overflow-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Application Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Settings functionality will be implemented here.
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
