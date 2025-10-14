// Test endpoints for KRA template imports - bypasses authentication for testing
import type { Express } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { kraTemplates } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export function registerTestKraImportRoutes(app: Express) {
  console.log("🧪 Registering TEST KRA import endpoints (no auth required)");

  // Test endpoint to get a test organization ID or create a test org
  app.get("/api/test/kra/setup", async (req, res) => {
    try {
      console.log("🔧 Setting up test environment for KRA imports");
      
      // Try to find existing test org
      let testOrg = await storage.getOrganizationBySlug('test-kra-imports');
      
      if (!testOrg) {
        console.log("Creating new test organization...");
        testOrg = await storage.createOrganization({
          name: "Test KRA Imports",
          slug: "test-kra-imports",
          plan: "enterprise",
          isActive: true,
          onboardingStatus: "completed"
        });
      }
      
      // Create a test user if needed
      const testUserId = `test-user-${Date.now()}`;
      
      res.json({
        message: "Test environment ready",
        organizationId: testOrg.id,
        organizationName: testOrg.name,
        testUserId: testUserId,
        instructions: "Use this organizationId in the test import endpoints"
      });
    } catch (error) {
      console.error("Test setup error:", error);
      res.status(500).json({ 
        message: "Failed to setup test environment",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Test import-fallback endpoint - no auth required
  app.post("/api/test/kra/import-fallback", async (req, res) => {
    try {
      const { organizationId } = req.body;
      if (!organizationId) {
        return res.status(400).json({ 
          message: "organizationId is required in request body",
          hint: "First call /api/test/kra/setup to get a test organizationId"
        });
      }
      
      console.log(`\n🚨 TEST: KRA Import Fallback - Starting for orgId: "${organizationId}"`);
      console.log("====================================================");
      
      // Import fallback templates
      const { FALLBACK_TEMPLATES } = await import('./kraTemplatesFallback');
      console.log(`📦 Loaded ${FALLBACK_TEMPLATES.length} fallback templates`);
      
      let importedCount = 0;
      let skippedCount = 0;
      const errors: any[] = [];
      const importedTemplates: any[] = [];
      const skippedTemplates: string[] = [];
      
      for (const template of FALLBACK_TEMPLATES) {
        const startTime = Date.now();
        try {
          const templateName = `${template.name} (${template.organization})`;
          console.log(`\n📝 Processing template: ${templateName}`);
          
          // Check if template already exists
          const existingTemplates = await storage.getKraTemplatesByName(organizationId, templateName);
          if (existingTemplates && existingTemplates.length > 0) {
            console.log(`  ⏭️ Template already exists, skipping`);
            skippedCount++;
            skippedTemplates.push(templateName);
            continue;
          }
          
          // Validate template structure
          console.log(`  📊 Template structure:`);
          console.log(`     - Goals: ${Array.isArray(template.goals) ? `Array[${template.goals.length}]` : typeof template.goals}`);
          console.log(`     - Industries: ${Array.isArray(template.industries) ? `Array[${template.industries.length}]` : typeof template.industries}`);
          console.log(`     - Category: ${template.category}`);
          console.log(`     - Department: ${template.department}`);
          
          // Create template
          const dbTemplate = {
            organizationId: organizationId,
            name: templateName,
            description: template.description || '',
            goals: template.goals || [], // Must be array for jsonb column
            category: template.category || 'general',
            department: template.department || '',
            jobTitle: template.jobTitle || '',
            industries: template.industries || [], // Must be array for text[] column
            isGlobal: false,
            isActive: true,
            createdBy: 'test-import'
          };
          
          console.log(`  💾 Creating template in database...`);
          const created = await storage.createKraTemplate(organizationId, dbTemplate);
          
          // Verify the template was created correctly
          const verification = await db
            .select()
            .from(kraTemplates)
            .where(eq(kraTemplates.id, created.id))
            .limit(1);
          
          if (verification.length > 0) {
            const saved = verification[0];
            console.log(`  ✅ Template created successfully`);
            console.log(`     - ID: ${saved.id}`);
            console.log(`     - Goals saved: ${Array.isArray(saved.goals) ? `Array[${saved.goals.length}]` : 'ERROR: Not an array!'}`);
            console.log(`     - Industries saved: ${Array.isArray(saved.industries) ? `Array[${saved.industries.length}]` : 'ERROR: Not an array!'}`);
            
            importedCount++;
            importedTemplates.push({
              id: saved.id,
              name: saved.name,
              goalsCount: Array.isArray(saved.goals) ? saved.goals.length : 0,
              industriesCount: Array.isArray(saved.industries) ? saved.industries.length : 0,
              timeMs: Date.now() - startTime
            });
          } else {
            throw new Error("Template created but not found in database");
          }
          
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`  ❌ Failed to import template: ${errorMsg}`);
          if (err instanceof Error && err.stack) {
            console.error(`     Stack: ${err.stack.split('\n').slice(0, 3).join('\n     ')}`);
          }
          
          errors.push({
            template: template.name,
            error: errorMsg,
            timeMs: Date.now() - startTime
          });
        }
      }
      
      const totalTime = importedTemplates.reduce((sum, t) => sum + t.timeMs, 0) + 
                       errors.reduce((sum, e) => sum + e.timeMs, 0);
      
      console.log("\n====================================================");
      console.log(`🎉 TEST IMPORT FALLBACK COMPLETE`);
      console.log(`   ✅ Imported: ${importedCount}/${FALLBACK_TEMPLATES.length}`);
      console.log(`   ⏭️ Skipped: ${skippedCount}`);
      console.log(`   ❌ Failed: ${errors.length}`);
      console.log(`   ⏱️ Total time: ${totalTime}ms`);
      console.log("====================================================\n");
      
      res.json({
        success: importedCount > 0,
        message: `Test import completed: ${importedCount} imported, ${skippedCount} skipped, ${errors.length} failed`,
        stats: {
          imported: importedCount,
          skipped: skippedCount,
          failed: errors.length,
          total: FALLBACK_TEMPLATES.length,
          totalTimeMs: totalTime
        },
        importedTemplates,
        skippedTemplates,
        errors
      });
      
    } catch (error) {
      console.error("\n❌ TEST IMPORT FALLBACK - Fatal Error:", error);
      res.status(500).json({ 
        success: false,
        message: "Test import failed completely",
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  });

  // Test import-all endpoint - no auth required
  app.post("/api/test/kra/import-all", async (req, res) => {
    try {
      const { organizationId } = req.body;
      if (!organizationId) {
        return res.status(400).json({ 
          message: "organizationId is required in request body",
          hint: "First call /api/test/kra/setup to get a test organizationId"
        });
      }
      
      console.log(`\n🚀 TEST: KRA Import All - Starting for orgId: "${organizationId}"`);
      console.log("====================================================");
      
      // Import default templates module
      const templateModule = await import('@shared/defaultKraTemplates');
      
      // Try multiple ways to access templates
      const DEFAULT_KRA_TEMPLATES = 
        templateModule.DEFAULT_KRA_TEMPLATES || 
        templateModule.default?.DEFAULT_KRA_TEMPLATES ||
        [];
      
      console.log(`📦 Module keys available: ${Object.keys(templateModule).join(', ')}`);
      console.log(`📊 Found ${DEFAULT_KRA_TEMPLATES.length} templates to import`);
      
      if (!DEFAULT_KRA_TEMPLATES || DEFAULT_KRA_TEMPLATES.length === 0) {
        return res.status(500).json({ 
          success: false,
          message: "No templates found in module",
          moduleKeys: Object.keys(templateModule),
          hasDefault: !!templateModule.default,
          hasTemplates: !!templateModule.DEFAULT_KRA_TEMPLATES
        });
      }
      
      // List all template names
      console.log(`\n📋 Templates available:`);
      DEFAULT_KRA_TEMPLATES.forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.name} (${t.organization})`);
      });
      
      let importedCount = 0;
      let skippedCount = 0;
      const errors: any[] = [];
      const importedTemplates: any[] = [];
      const skippedTemplates: string[] = [];
      
      for (const template of DEFAULT_KRA_TEMPLATES) {
        const startTime = Date.now();
        try {
          const templateName = `${template.name} (${template.organization})`;
          console.log(`\n📝 Processing template ${importedCount + skippedCount + errors.length + 1}/${DEFAULT_KRA_TEMPLATES.length}: ${templateName}`);
          
          // Check if template already exists
          const existingTemplates = await storage.getKraTemplatesByName(organizationId, templateName);
          if (existingTemplates && existingTemplates.length > 0) {
            console.log(`  ⏭️ Template already exists, skipping`);
            skippedCount++;
            skippedTemplates.push(templateName);
            continue;
          }
          
          // Validate template structure
          console.log(`  📊 Validating structure...`);
          if (!Array.isArray(template.goals)) {
            throw new Error(`Goals is not an array: ${typeof template.goals}`);
          }
          
          // Create template
          const dbTemplate = {
            organizationId: organizationId,
            name: templateName,
            description: template.description || '',
            goals: template.goals || [], // Must be array for jsonb column
            category: template.category || 'general',
            department: template.department || '',
            jobTitle: template.jobTitle || '',
            industries: template.industries || [], // Must be array for text[] column
            isGlobal: false,
            isActive: true,
            createdBy: 'test-import-all'
          };
          
          console.log(`  💾 Saving to database...`);
          const created = await storage.createKraTemplate(organizationId, dbTemplate);
          console.log(`  ✅ Saved with ID: ${created.id}`);
          
          importedCount++;
          importedTemplates.push({
            id: created.id,
            name: created.name,
            timeMs: Date.now() - startTime
          });
          
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`  ❌ Failed: ${errorMsg}`);
          
          errors.push({
            template: template.name,
            error: errorMsg,
            timeMs: Date.now() - startTime
          });
        }
      }
      
      console.log("\n====================================================");
      console.log(`🎉 TEST IMPORT ALL COMPLETE`);
      console.log(`   ✅ Imported: ${importedCount}/${DEFAULT_KRA_TEMPLATES.length}`);
      console.log(`   ⏭️ Skipped: ${skippedCount}`);
      console.log(`   ❌ Failed: ${errors.length}`);
      console.log("====================================================\n");
      
      res.json({
        success: importedCount > 0,
        message: `Test import-all completed`,
        stats: {
          imported: importedCount,
          skipped: skippedCount,
          failed: errors.length,
          total: DEFAULT_KRA_TEMPLATES.length
        },
        importedTemplates,
        skippedTemplates,
        errors
      });
      
    } catch (error) {
      console.error("\n❌ TEST IMPORT ALL - Fatal Error:", error);
      res.status(500).json({ 
        success: false,
        message: "Test import-all failed completely",
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  });

  // Test import-defaults endpoint - no auth required
  app.post("/api/test/kra/import-defaults", async (req, res) => {
    try {
      const { organizationId, filter } = req.body;
      if (!organizationId) {
        return res.status(400).json({ 
          message: "organizationId is required in request body",
          hint: "First call /api/test/kra/setup to get a test organizationId"
        });
      }
      
      const filterType = filter || 'all'; // 'all', 'patrick', or 'whirks'
      
      console.log(`\n🎯 TEST: KRA Import Defaults - Filter: "${filterType}", OrgId: "${organizationId}"`);
      console.log("====================================================");
      
      // Import default templates
      const { DEFAULT_KRA_TEMPLATES } = await import('@shared/defaultKraTemplates');
      
      // Filter templates based on selection
      let templatesToImport = DEFAULT_KRA_TEMPLATES;
      if (filterType === 'patrick') {
        templatesToImport = DEFAULT_KRA_TEMPLATES.filter(t => t.organization === 'Patrick Accounting');
      } else if (filterType === 'whirks') {
        templatesToImport = DEFAULT_KRA_TEMPLATES.filter(t => t.organization === 'Whirks');
      }
      
      console.log(`📦 Templates after filtering: ${templatesToImport.length}`);
      
      let importedCount = 0;
      let skippedCount = 0;
      const errors: any[] = [];
      const importedTemplates: any[] = [];
      
      for (const template of templatesToImport) {
        try {
          const templateName = `${template.name} (${template.organization})`;
          
          // Check if exists
          const existing = await storage.getKraTemplatesByName(organizationId, templateName);
          if (existing && existing.length > 0) {
            skippedCount++;
            continue;
          }
          
          // Create template
          const dbTemplate = {
            organizationId: organizationId,
            name: templateName,
            description: template.description || '',
            goals: template.goals || [],
            category: template.category || 'general',
            department: template.department || '',
            jobTitle: template.jobTitle || '',
            industries: template.industries || [],
            isGlobal: false,
            isActive: true,
            createdBy: 'test-import-defaults'
          };
          
          const created = await storage.createKraTemplate(organizationId, dbTemplate);
          importedCount++;
          importedTemplates.push(created.name);
          
        } catch (err) {
          errors.push({
            template: template.name,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
      
      console.log("\n====================================================");
      console.log(`🎉 TEST IMPORT DEFAULTS COMPLETE`);
      console.log(`   Filter: ${filterType}`);
      console.log(`   ✅ Imported: ${importedCount}/${templatesToImport.length}`);
      console.log(`   ⏭️ Skipped: ${skippedCount}`);
      console.log(`   ❌ Failed: ${errors.length}`);
      console.log("====================================================\n");
      
      res.json({
        success: importedCount > 0,
        filter: filterType,
        stats: {
          imported: importedCount,
          skipped: skippedCount,
          failed: errors.length,
          total: templatesToImport.length
        },
        importedTemplates,
        errors
      });
      
    } catch (error) {
      console.error("\n❌ TEST IMPORT DEFAULTS - Fatal Error:", error);
      res.status(500).json({ 
        success: false,
        message: "Test import-defaults failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Test endpoint to verify imported templates structure
  app.get("/api/test/kra/verify/:organizationId", async (req, res) => {
    try {
      const { organizationId } = req.params;
      
      console.log(`\n🔍 Verifying KRA templates for organization: ${organizationId}`);
      console.log("====================================================");
      
      // Get all templates for the organization
      const templates = await db
        .select()
        .from(kraTemplates)
        .where(eq(kraTemplates.organizationId, organizationId))
        .orderBy(desc(kraTemplates.createdAt));
      
      console.log(`📊 Found ${templates.length} templates`);
      
      const verification: any[] = [];
      let issueCount = 0;
      
      for (const template of templates) {
        const issues: string[] = [];
        
        // Check goals structure
        if (!Array.isArray(template.goals)) {
          issues.push(`Goals is not an array: ${typeof template.goals}`);
          issueCount++;
        } else if (template.goals.length === 0) {
          issues.push(`Goals array is empty`);
        } else {
          // Check if goals have the expected structure
          const firstGoal = template.goals[0] as any;
          if (!firstGoal.id || !firstGoal.title) {
            issues.push(`Goals missing required fields (id, title)`);
            issueCount++;
          }
        }
        
        // Check industries structure
        if (!Array.isArray(template.industries)) {
          issues.push(`Industries is not an array: ${typeof template.industries}`);
          issueCount++;
        }
        
        // Check other required fields
        if (!template.name) issues.push(`Missing name`);
        if (!template.category) issues.push(`Missing category`);
        
        const templateInfo = {
          id: template.id,
          name: template.name,
          goalsCount: Array.isArray(template.goals) ? template.goals.length : 'NOT_ARRAY',
          industriesCount: Array.isArray(template.industries) ? template.industries.length : 'NOT_ARRAY',
          category: template.category,
          department: template.department,
          hasIssues: issues.length > 0,
          issues
        };
        
        verification.push(templateInfo);
        
        console.log(`\n📝 Template: ${template.name}`);
        console.log(`   - Goals: ${templateInfo.goalsCount}`);
        console.log(`   - Industries: ${templateInfo.industriesCount}`);
        if (issues.length > 0) {
          console.log(`   ⚠️ Issues: ${issues.join(', ')}`);
        } else {
          console.log(`   ✅ Structure OK`);
        }
      }
      
      console.log("\n====================================================");
      console.log(`📊 VERIFICATION SUMMARY`);
      console.log(`   Total templates: ${templates.length}`);
      console.log(`   Templates with issues: ${verification.filter(v => v.hasIssues).length}`);
      console.log(`   Total issues found: ${issueCount}`);
      console.log("====================================================\n");
      
      res.json({
        organizationId,
        totalTemplates: templates.length,
        templatesWithIssues: verification.filter(v => v.hasIssues).length,
        totalIssues: issueCount,
        templates: verification
      });
      
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({ 
        message: "Failed to verify templates",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Test endpoint to clean up test templates
  app.delete("/api/test/kra/cleanup/:organizationId", async (req, res) => {
    try {
      const { organizationId } = req.params;
      
      console.log(`\n🧹 Cleaning up test templates for organization: ${organizationId}`);
      
      // Delete all templates for the test organization
      const deleted = await db
        .delete(kraTemplates)
        .where(eq(kraTemplates.organizationId, organizationId))
        .returning();
      
      console.log(`✅ Deleted ${deleted.length} templates`);
      
      res.json({
        message: `Cleaned up ${deleted.length} templates`,
        deletedCount: deleted.length
      });
      
    } catch (error) {
      console.error("Cleanup error:", error);
      res.status(500).json({ 
        message: "Failed to cleanup templates",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  console.log("✅ Test KRA import endpoints registered");
  console.log("   - GET  /api/test/kra/setup");
  console.log("   - POST /api/test/kra/import-fallback");
  console.log("   - POST /api/test/kra/import-all");
  console.log("   - POST /api/test/kra/import-defaults");
  console.log("   - GET  /api/test/kra/verify/:organizationId");
  console.log("   - DELETE /api/test/kra/cleanup/:organizationId");
}