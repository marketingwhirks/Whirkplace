import { db } from "../db";
import { kraTemplates } from "@shared/schema";
import { sql } from "drizzle-orm";

async function verifyTemplates() {
  console.log("🔍 Verifying KRA Templates in Database...\n");
  
  try {
    // Count total templates
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(kraTemplates);
    
    console.log(`📊 Total KRA Templates: ${countResult.count}\n`);
    
    // Get sample templates
    const templates = await db
      .select({
        id: kraTemplates.id,
        name: kraTemplates.name,
        category: kraTemplates.category,
        description: kraTemplates.description,
        goals: kraTemplates.goals
      })
      .from(kraTemplates)
      .limit(5);
    
    console.log("📋 Sample Templates:\n");
    templates.forEach((template, index) => {
      console.log(`${index + 1}. ${template.name}`);
      console.log(`   Category: ${template.category}`);
      console.log(`   Description: ${template.description?.substring(0, 100)}...`);
      
      // Parse and display goals
      try {
        const goals = JSON.parse(template.goals as string);
        console.log(`   Number of KRAs: ${goals.length}`);
        if (goals.length > 0 && goals[0].title) {
          console.log(`   First KRA: ${goals[0].title}`);
        }
      } catch (e) {
        console.log("   Goals: Unable to parse");
      }
      console.log("");
    });
    
    // Get breakdown by category
    const categoryBreakdown = await db
      .select({
        category: kraTemplates.category,
        count: sql<number>`count(*)`
      })
      .from(kraTemplates)
      .groupBy(kraTemplates.category);
    
    console.log("📈 Templates by Department:\n");
    categoryBreakdown.forEach(cat => {
      console.log(`   ${cat.category}: ${cat.count} templates`);
    });
    
    // Check for Patrick Accounting vs Whirks templates
    const patrickTemplates = await db
      .select({ count: sql<number>`count(*)` })
      .from(kraTemplates)
      .where(sql`name LIKE '%Patrick Accounting%'`);
    
    const whirksTemplates = await db
      .select({ count: sql<number>`count(*)` })
      .from(kraTemplates)
      .where(sql`name LIKE '%Whirks%'`);
    
    console.log("\n🏢 Templates by Organization:");
    console.log(`   Patrick Accounting: ${patrickTemplates[0].count} templates`);
    console.log(`   Whirks: ${whirksTemplates[0].count} templates`);
    
  } catch (error) {
    console.error("❌ Error verifying templates:", error);
  }
}

verifyTemplates()
  .then(() => {
    console.log("\n✅ Verification complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Verification failed:", error);
    process.exit(1);
  });