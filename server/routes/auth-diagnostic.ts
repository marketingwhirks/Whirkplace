import { Express } from "express";
import { storage } from "../storage";

export function registerAuthDiagnosticRoutes(app: Express) {
  // Comprehensive authentication diagnostic endpoint
  app.get("/api/auth/diagnostic", async (req, res) => {
    console.log("🔍 Running comprehensive authentication diagnostic...");
    
    const diagnostic = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        isReplit: !!process.env.REPL_SLUG,
        port: process.env.PORT,
      },
      credentials: {
        slack: {
          clientId: !!process.env.SLACK_CLIENT_ID,
          clientSecret: !!process.env.SLACK_CLIENT_SECRET,
          botToken: !!process.env.SLACK_BOT_TOKEN,
          configured: false
        },
        microsoft: {
          clientId: !!process.env.MICROSOFT_CLIENT_ID,
          clientSecret: !!process.env.MICROSOFT_CLIENT_SECRET,
          tenantId: !!process.env.MICROSOFT_TENANT_ID,
          configured: false
        },
        backdoor: {
          user: process.env.BACKDOOR_USER || null,
          keyConfigured: !!process.env.BACKDOOR_KEY,
          enabled: false
        }
      },
      sessionInfo: {
        hasSession: !!req.session,
        sessionId: req.sessionID,
        userId: (req.session as any)?.userId || null,
        organizationId: (req.session as any)?.organizationId || null
      },
      currentRequest: {
        host: req.get('host'),
        protocol: req.protocol,
        headers: {
          'x-backdoor-user': req.headers['x-backdoor-user'] || null,
          'x-backdoor-key': req.headers['x-backdoor-key'] ? '[PRESENT]' : null,
        }
      },
      database: {
        organizations: [] as Array<{
          id: string;
          name: string;
          slug: string;
          plan: string;
          slackEnabled: boolean;
          slackWorkspaceId: string | null;
          microsoftEnabled: boolean;
          microsoftTenantId: string | null;
          isActive: boolean;
        }>,
        superAdmins: [] as Array<{
          id: string;
          email: string;
          name: string;
          role: string;
          isSuperAdmin: boolean;
          authProvider: string;
          isActive: boolean;
          organizationId: string;
        }>,
        issues: [] as string[]
      },
      recommendations: [] as Array<{
        priority: string;
        action: string;
      }>
    };

    // Check if OAuth providers are properly configured
    diagnostic.credentials.slack.configured = 
      !!process.env.SLACK_CLIENT_ID && !!process.env.SLACK_CLIENT_SECRET;
    
    diagnostic.credentials.microsoft.configured = 
      !!process.env.MICROSOFT_CLIENT_ID && 
      !!process.env.MICROSOFT_CLIENT_SECRET && 
      !!process.env.MICROSOFT_TENANT_ID;
    
    diagnostic.credentials.backdoor.enabled = 
      !!process.env.BACKDOOR_USER && !!process.env.BACKDOOR_KEY;

    try {
      // Get all organizations
      const orgs = await storage.getAllOrganizations();
      diagnostic.database.organizations = orgs.map(org => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        slackEnabled: org.enableSlackIntegration,
        slackWorkspaceId: org.slackWorkspaceId || null,
        microsoftEnabled: org.enableMicrosoftAuth,
        microsoftTenantId: org.microsoftTenantId || null,
        isActive: org.isActive
      }));

      // Get super admin users
      const users = await storage.getAllUsers('whirkplace'); // Check whirkplace org
      diagnostic.database.superAdmins = users
        .filter(u => u.isSuperAdmin || u.role === 'admin')
        .map(u => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          isSuperAdmin: u.isSuperAdmin,
          authProvider: u.authProvider,
          isActive: u.isActive,
          organizationId: u.organizationId
        }));

      // Identify issues
      if (!diagnostic.credentials.backdoor.enabled) {
        diagnostic.database.issues.push("❌ BACKDOOR authentication not configured - Set BACKDOOR_USER and BACKDOOR_KEY environment variables");
        diagnostic.recommendations.push({
          priority: 'HIGH',
          action: 'Set BACKDOOR_USER and BACKDOOR_KEY environment variables for development access'
        });
      }

      // Check for duplicate organizations
      const slugCounts = new Map<string, number>();
      orgs.forEach(org => {
        const count = slugCounts.get(org.slug) || 0;
        slugCounts.set(org.slug, count + 1);
      });
      
      slugCounts.forEach((count, slug) => {
        if (count > 1) {
          diagnostic.database.issues.push(`⚠️ Duplicate organization slug: ${slug} (${count} organizations)`);
        }
      });

      // Check for orphaned default orgs
      const defaultOrgs = orgs.filter(org => 
        org.slug.includes('default') || org.name.includes('Default')
      );
      if (defaultOrgs.length > 1) {
        diagnostic.database.issues.push(`⚠️ Multiple default organizations found (${defaultOrgs.length})`);
        diagnostic.recommendations.push({
          priority: 'MEDIUM',
          action: 'Clean up duplicate default organizations'
        });
      }

      // Check if super admin org exists
      const superAdminOrg = orgs.find(org => org.id === 'whirkplace' || org.slug === 'whirkplace');
      if (!superAdminOrg) {
        diagnostic.database.issues.push("❌ Super admin organization 'whirkplace' not found");
        diagnostic.recommendations.push({
          priority: 'HIGH',
          action: 'Create super admin organization with ID and slug "whirkplace"'
        });
      }

      // Check for super admin users
      if (diagnostic.database.superAdmins.length === 0) {
        diagnostic.database.issues.push("❌ No super admin users found");
        diagnostic.recommendations.push({
          priority: 'HIGH',
          action: 'Create at least one super admin user'
        });
      }

      // OAuth configuration checks
      if (!diagnostic.credentials.slack.configured && orgs.some(o => o.enableSlackIntegration)) {
        diagnostic.database.issues.push("⚠️ Slack integration enabled but OAuth not configured");
      }

      if (!diagnostic.credentials.microsoft.configured && orgs.some(o => o.enableMicrosoftAuth)) {
        diagnostic.database.issues.push("⚠️ Microsoft auth enabled but OAuth not configured");
      }

    } catch (error) {
      diagnostic.database.issues.push(`Database error: ${error.message}`);
    }

    // Generate final recommendations
    if (diagnostic.database.issues.length === 0) {
      diagnostic.recommendations.push({
        priority: 'INFO',
        action: 'Authentication system appears properly configured'
      });
    }

    res.json(diagnostic);
  });

  // Quick login test endpoint for backdoor auth
  app.post("/api/auth/diagnostic/test-backdoor", async (req, res) => {
    const { username, key } = req.body;
    
    if (!username || !key) {
      return res.status(400).json({
        success: false,
        message: "Username and key required"
      });
    }

    const envUser = process.env.BACKDOOR_USER;
    const envKey = process.env.BACKDOOR_KEY;

    if (!envUser || !envKey) {
      return res.status(500).json({
        success: false,
        message: "Backdoor authentication not configured on server",
        recommendation: "Set BACKDOOR_USER and BACKDOOR_KEY environment variables"
      });
    }

    if (username === envUser && key === envKey) {
      // Try to find the user across all organizations
      try {
        // First, check if this is the super admin (mpatrick@whirks.com)
        // They should be in the whirkplace organization
        if (username === 'mpatrick@whirks.com') {
          const whirkplaceUsers = await storage.getAllUsers('whirkplace');
          const superAdminUser = whirkplaceUsers.find(u => u.email === username || u.username === username);
          
          if (superAdminUser) {
            // Get the whirkplace organization details
            const whirkplaceOrg = await storage.getOrganizationBySlug('whirkplace');
            
            (req.session as any).userId = superAdminUser.id;
            (req.session as any).organizationId = superAdminUser.organizationId;
            
            req.session.save((err) => {
              if (err) {
                return res.status(500).json({
                  success: false,
                  message: "Session save failed",
                  error: err.message
                });
              }
              
              res.json({
                success: true,
                message: "Backdoor login successful (super admin)",
                user: {
                  id: superAdminUser.id,
                  email: superAdminUser.email,
                  name: superAdminUser.name,
                  role: superAdminUser.role,
                  isSuperAdmin: superAdminUser.isSuperAdmin,
                  organizationId: superAdminUser.organizationId,
                  organizationName: whirkplaceOrg?.name,
                  organizationSlug: whirkplaceOrg?.slug,
                  organizationPlan: whirkplaceOrg?.plan
                }
              });
            });
            return;
          }
        }
        
        // For all other users, search across all organizations
        const allUsers = await storage.getAllUsersGlobal(false); // Don't include inactive users
        const user = allUsers.find(u => u.email === username || u.username === username);
        
        if (user) {
          // Get the organization to verify it's active
          const organization = await storage.getOrganization(user.organizationId);
          
          if (!organization || !organization.isActive) {
            return res.status(403).json({
              success: false,
              message: "User's organization is not active",
              organizationId: user.organizationId
            });
          }
          
          (req.session as any).userId = user.id;
          (req.session as any).organizationId = user.organizationId;
          
          req.session.save((err) => {
            if (err) {
              return res.status(500).json({
                success: false,
                message: "Session save failed",
                error: err.message
              });
            }
            
            res.json({
              success: true,
              message: "Backdoor login successful",
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                isSuperAdmin: user.isSuperAdmin,
                organizationId: user.organizationId,
                organizationName: organization.name,
                organizationSlug: organization.slug,
                organizationPlan: organization.plan
              }
            });
          });
        } else {
          res.status(404).json({
            success: false,
            message: `User ${username} not found in any organization`,
            recommendation: "Ensure user account exists in the database"
          });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Database error",
          error: error.message
        });
      }
    } else {
      res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }
  });
}