import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Server, Package, GitBranch, Database, Globe } from "lucide-react";
import { useState, useEffect } from "react";

export default function DeploymentTest() {
  const [versionInfo, setVersionInfo] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const currentTime = new Date().toISOString();

  useEffect(() => {
    // Try to load version.json
    fetch('/version.json')
      .then(res => {
        if (!res.ok) {
          throw new Error(`Version file not found (${res.status})`);
        }
        return res.json();
      })
      .then(data => setVersionInfo(data))
      .catch(err => setLoadError(err.message));
  }, []);

  const features = [
    { name: "Password Reset", status: "Implemented", date: "2024-01-20" },
    { name: "Question Bank Status", status: "Implemented", date: "2024-01-20" },
    { name: "Demo Mode", status: "Implemented", date: "2024-01-19" },
    { name: "Microsoft Teams Integration", status: "Implemented", date: "2024-01-18" },
    { name: "Slack Integration", status: "Implemented", date: "2024-01-17" },
    { name: "Theme Customization", status: "Implemented", date: "2024-01-16" },
    { name: "Tour Guide System", status: "Implemented", date: "2024-01-15" },
    { name: "Role-Based Access", status: "Implemented", date: "2024-01-14" },
  ];

  const environment = {
    nodeEnv: import.meta.env.MODE,
    isDevelopment: import.meta.env.DEV,
    isProduction: import.meta.env.PROD,
    baseUrl: window.location.origin,
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    port: window.location.port || "80",
    pathname: window.location.pathname,
    userAgent: navigator.userAgent,
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Deployment Test Page</h1>
        <p className="text-muted-foreground">
          Verify build version and deployment status across environments
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Build Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Build Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {versionInfo ? (
              <>
                <div>
                  <div className="text-sm text-muted-foreground">Build Timestamp</div>
                  <div className="font-mono text-sm">{versionInfo.buildTime}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Build Number</div>
                  <div className="font-mono text-sm">{versionInfo.buildNumber || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Version</div>
                  <div className="font-mono text-sm">{versionInfo.version || '1.0.0'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Git Commit</div>
                  <div className="font-mono text-sm truncate">{versionInfo.gitCommit || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Build Environment</div>
                  <Badge variant={versionInfo.environment === 'production' ? 'default' : 'secondary'}>
                    {versionInfo.environment || 'unknown'}
                  </Badge>
                </div>
              </>
            ) : loadError ? (
              <div className="text-sm text-destructive">
                Version file error: {loadError}
                <div className="text-xs text-muted-foreground mt-2">
                  This is normal in development. The version.json file is created during build.
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Loading version info...</div>
            )}
          </CardContent>
        </Card>

        {/* Runtime Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Runtime Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground">Current Time</div>
              <div className="font-mono text-sm">{currentTime}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Environment Mode</div>
              <Badge variant={environment.isProduction ? 'default' : 'outline'}>
                {environment.nodeEnv}
              </Badge>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Base URL</div>
              <div className="font-mono text-sm">{environment.baseUrl}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Hostname</div>
              <div className="font-mono text-sm">{environment.hostname}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Port</div>
              <div className="font-mono text-sm">{environment.port}</div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Features */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Recently Deployed Features
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="font-medium">{feature.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline">{feature.status}</Badge>
                    <span className="text-sm text-muted-foreground">{feature.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Environment Details */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Environment Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Development Mode</div>
                <Badge variant={environment.isDevelopment ? 'default' : 'outline'}>
                  {environment.isDevelopment ? 'Yes' : 'No'}
                </Badge>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Production Mode</div>
                <Badge variant={environment.isProduction ? 'default' : 'outline'}>
                  {environment.isProduction ? 'Yes' : 'No'}
                </Badge>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Protocol</div>
                <div className="font-mono text-sm">{environment.protocol}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Current Path</div>
                <div className="font-mono text-sm">{environment.pathname}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-muted-foreground">User Agent</div>
                <div className="font-mono text-xs p-2 bg-muted rounded mt-1 break-all">
                  {environment.userAgent}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Checks */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Deployment Verification Checklist
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className={versionInfo ? "h-5 w-5 text-green-500" : "h-5 w-5 text-muted-foreground"} />
                <span>Version file is accessible</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={environment.baseUrl ? "h-5 w-5 text-green-500" : "h-5 w-5 text-muted-foreground"} />
                <span>Base URL is defined</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span>Page renders without errors</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                <span className="text-sm">
                  Compare build timestamp with deployment time to verify if latest code is deployed
                </span>
              </div>
            </div>
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-2">How to use this page:</p>
              <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
                <li>Check the Build Timestamp to see when this version was built</li>
                <li>Compare with your last deployment time</li>
                <li>Verify that recent features are listed and working</li>
                <li>If build time is old, the deployment may be using cached code</li>
                <li>Check both development and production environments</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}