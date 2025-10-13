import { db } from "../db";
import { kraTemplates } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// Industry mappings for existing templates
const industryMappings: Record<string, string[]> = {
  // Accounting/Finance templates (Patrick Accounting)
  "accounting": ["accounting", "finance", "professional_services"],
  "tax": ["accounting", "finance", "professional_services"],
  "finance": ["accounting", "finance", "professional_services"],
  
  // HR/People templates (Whirks)
  "hr": ["professional_services", "technology", "healthcare", "manufacturing", "retail", "education"],
  "benefits": ["professional_services", "healthcare"],
  
  // Operations/Admin (Both firms)
  "operations": ["all"], // Universal for all industries
  "general": ["all"],
  
  // Sales/Marketing (Universal)
  "sales": ["all"],
  "marketing": ["technology", "retail", "hospitality", "professional_services", "education"],
  
  // Client Success (Service industries)
  "client success": ["professional_services", "technology", "healthcare"],
  "implementation": ["technology", "professional_services"],
};

// Job title to industry mapping
const jobTitleToIndustries: Record<string, string[]> = {
  // Accounting/Finance roles
  "accountant": ["accounting", "finance", "professional_services"],
  "tax": ["accounting", "finance", "professional_services"],
  "controller": ["accounting", "finance", "manufacturing", "retail"],
  "bookkeeper": ["accounting", "professional_services", "retail"],
  
  // HR/People roles
  "people": ["all"],
  "hr": ["all"],
  "benefit": ["healthcare", "professional_services"],
  
  // Sales/Marketing roles
  "sales": ["all"],
  "marketing": ["all"],
  "videographer": ["technology", "hospitality", "retail", "education"],
  
  // Operations/Admin roles
  "administrator": ["all"],
  "coordinator": ["all"],
  "operations": ["all"],
  
  // Client Success roles
  "client success": ["professional_services", "technology"],
  "implementation": ["technology", "professional_services"],
  "payroll": ["all"],
};

async function categorizeTemplates() {
  console.log("🔄 Categorizing existing KRA templates by industry...\n");
  
  try {
    // Fetch all existing templates
    const templates = await db
      .select()
      .from(kraTemplates);
    
    console.log(`Found ${templates.length} templates to categorize\n`);
    
    for (const template of templates) {
      const industries = new Set<string>();
      
      // Determine industries based on category
      const categoryIndustries = industryMappings[template.category.toLowerCase()] || [];
      categoryIndustries.forEach(ind => industries.add(ind));
      
      // Also check job title if it exists in the name
      const nameLower = template.name.toLowerCase();
      for (const [keyword, inds] of Object.entries(jobTitleToIndustries)) {
        if (nameLower.includes(keyword)) {
          inds.forEach(ind => industries.add(ind));
          break;
        }
      }
      
      // If "all" is in industries, replace with all actual industries
      if (industries.has("all")) {
        industries.delete("all");
        industries.add("technology");
        industries.add("healthcare");
        industries.add("accounting");
        industries.add("finance");
        industries.add("hospitality");
        industries.add("retail");
        industries.add("manufacturing");
        industries.add("professional_services");
        industries.add("education");
        industries.add("non_profit");
      }
      
      // Extract job title from template name
      let jobTitle = template.name;
      
      // Clean up job title (remove organization name)
      jobTitle = jobTitle.replace(/\(.*?\)/g, "").trim();
      jobTitle = jobTitle.replace(/Reports To:.*$/i, "").trim();
      
      // Update template with industries and job title
      const industriesArray = Array.from(industries);
      
      await db
        .update(kraTemplates)
        .set({
          industries: industriesArray,
          jobTitle: jobTitle || template.name,
          isGlobal: true // Make all templates globally available
        })
        .where(eq(kraTemplates.id, template.id));
      
      console.log(`✅ ${template.name}`);
      console.log(`   Job Title: ${jobTitle}`);
      console.log(`   Industries: ${industriesArray.join(", ")}`);
      console.log("");
    }
    
    // Verify the updates
    const updatedTemplates = await db
      .select({
        name: kraTemplates.name,
        jobTitle: kraTemplates.jobTitle,
        industries: kraTemplates.industries,
        isGlobal: kraTemplates.isGlobal
      })
      .from(kraTemplates)
      .limit(5);
    
    console.log("\n📊 Sample of updated templates:");
    updatedTemplates.forEach(t => {
      console.log(`\n${t.name}`);
      console.log(`  Job Title: ${t.jobTitle}`);
      console.log(`  Industries: ${t.industries?.join(", ") || "none"}`);
      console.log(`  Global: ${t.isGlobal}`);
    });
    
    console.log("\n✅ Template categorization complete!");
    
  } catch (error) {
    console.error("❌ Error categorizing templates:", error);
    process.exit(1);
  }
  
  process.exit(0);
}

categorizeTemplates();