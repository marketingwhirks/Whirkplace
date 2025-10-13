import * as mammoth from "mammoth";
import * as fs from "fs";
import * as path from "path";
import { db } from "../db";
import { kraTemplates, organizations } from "@shared/schema";
import { eq } from "drizzle-orm";

interface KRADocument {
  fileName: string;
  organization: "Patrick Accounting" | "Whirks";
  jobTitle: string;
  reportsTo: string;
  summary: string;
  keyResultAreas: Array<{
    title: string;
    description: string[];
    metrics: string[];
  }>;
  department: string;
  roleLevel: string;
}

// Function to extract metrics from text
function extractMetrics(text: string): string[] {
  const metrics = [];
  
  // Look for percentages
  const percentageMatches = text.match(/\d+%/g);
  if (percentageMatches) metrics.push(...percentageMatches);
  
  // Look for dollar amounts
  const dollarMatches = text.match(/\$[\d,]+/g);
  if (dollarMatches) metrics.push(...dollarMatches);
  
  // Look for time-based metrics
  const timeMatches = text.match(/\b\d+\s*(hours?|days?|weeks?|months?|business days?|minutes?)\b/gi);
  if (timeMatches) metrics.push(...timeMatches);
  
  // Look for quantity metrics
  const quantityMatches = text.match(/\b\d+\s*(accounts?|meetings?|clients?|projects?|reports?|calls?|rings?)\b/gi);
  if (quantityMatches) metrics.push(...quantityMatches);
  
  return [...new Set(metrics)]; // Remove duplicates
}

// Function to infer department from job title
function inferDepartment(jobTitle: string): string {
  const title = jobTitle.toLowerCase();
  
  if (title.includes("tax")) return "Tax";
  if (title.includes("accounting") || title.includes("accountant")) return "Accounting";
  if (title.includes("sales") || title.includes("business development")) return "Sales";
  if (title.includes("marketing") || title.includes("videographer")) return "Marketing";
  if (title.includes("people") || title.includes("hr")) return "HR";
  if (title.includes("payroll")) return "Payroll";
  if (title.includes("operations") || title.includes("administrator") || title.includes("coordinator")) return "Operations";
  if (title.includes("client success") || title.includes("client care")) return "Client Success";
  if (title.includes("benefit")) return "Benefits";
  if (title.includes("implementation")) return "Implementation";
  if (title.includes("controller")) return "Finance";
  if (title.includes("boss")) return "Operations";
  
  return "General";
}

// Function to infer role level from job title
function inferRoleLevel(jobTitle: string): string {
  const title = jobTitle.toLowerCase();
  
  if (title.includes("director") || title.includes("chief")) return "lead";
  if (title.includes("manager") || title.includes("team lead")) return "manager";
  if (title.includes("senior")) return "senior";
  if (title.includes("specialist") || title.includes("coordinator") || title.includes("administrator")) return "mid";
  if (title.includes("expert")) return "senior";
  
  return "individual";
}

// Function to parse a single Word document
async function parseKRADocument(filePath: string): Promise<KRADocument | null> {
  try {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;
    
    // Extract organization from file path
    const fileName = path.basename(filePath);
    const organization: "Patrick Accounting" | "Whirks" = 
      fileName.startsWith("PATS") ? "Patrick Accounting" : "Whirks";
    
    // Parse the document text
    const lines = text.split('\n').filter(line => line.trim());
    
    // Extract job title (usually first line or after "Job Title:")
    let jobTitle = "";
    let reportsTo = "";
    let summary = "";
    let keyResultAreas: KRADocument["keyResultAreas"] = [];
    
    let currentKRA: { title: string; description: string[]; metrics: string[] } | null = null;
    let inSummary = false;
    let afterSummary = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Extract Job Title
      if (line.toLowerCase().includes("job title:") || (i === 0 && !line.includes(":"))) {
        jobTitle = line.replace(/job title:/i, "").trim();
        if (jobTitle.includes("\t")) {
          jobTitle = jobTitle.split("\t")[1].trim();
        }
      }
      
      // Extract Reports To
      if (line.toLowerCase().includes("reports to:")) {
        reportsTo = line.replace(/reports to:/i, "").trim();
        if (reportsTo.includes("\t")) {
          reportsTo = reportsTo.split("\t")[1].trim();
        }
      }
      
      // Extract Summary
      if (line.toLowerCase().includes("summary:")) {
        inSummary = true;
        const summaryText = line.replace(/summary:/i, "").trim();
        if (summaryText) {
          summary = summaryText;
        }
        continue;
      }
      
      // Continue capturing summary until we hit a Key Result Area
      if (inSummary && !line.toLowerCase().includes("key result area")) {
        if (line.trim()) {
          summary += (summary ? " " : "") + line.trim();
        }
      }
      
      // Extract Key Result Areas
      if (line.toLowerCase().includes("key result area") || line.toLowerCase().includes("key results area")) {
        inSummary = false;
        afterSummary = true;
        
        // Save previous KRA if exists
        if (currentKRA && currentKRA.description.length > 0) {
          keyResultAreas.push(currentKRA);
        }
        
        // Start new KRA
        const kraTitle = line.replace(/key results? area/i, "").trim();
        currentKRA = {
          title: kraTitle,
          description: [],
          metrics: []
        };
        continue;
      }
      
      // Add content to current KRA
      if (currentKRA && afterSummary && line.trim() && !line.includes("____")) {
        // Skip signature lines
        if (line.includes("Team Member's Name") || line.includes("Team Leader's Name") || line.includes("Date")) {
          continue;
        }
        
        currentKRA.description.push(line.trim());
        
        // Extract metrics from this line
        const lineMetrics = extractMetrics(line);
        if (lineMetrics.length > 0) {
          currentKRA.metrics.push(...lineMetrics);
        }
      }
    }
    
    // Add last KRA if exists
    if (currentKRA && currentKRA.description.length > 0) {
      keyResultAreas.push(currentKRA);
    }
    
    // Clean up job title
    if (!jobTitle && fileName.includes(" - ")) {
      // Extract from filename
      const parts = fileName.split(" - ");
      if (parts.length >= 2) {
        jobTitle = parts[1].replace(".docx", "").replace(".pdf", "").replace(/_/g, " ").trim();
        // Remove version numbers
        jobTitle = jobTitle.replace(/v\d+/gi, "").trim();
      }
    }
    
    return {
      fileName,
      organization,
      jobTitle: jobTitle || "Unknown Position",
      reportsTo: reportsTo || "Not specified",
      summary: summary || "No summary provided",
      keyResultAreas,
      department: inferDepartment(jobTitle),
      roleLevel: inferRoleLevel(jobTitle)
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

// Main function to load all KRA templates
async function loadAllKRATemplates() {
  console.log("🚀 Starting KRA template loading process...");
  
  // Get the default organization (first one)
  const [defaultOrg] = await db
    .select()
    .from(organizations)
    .limit(1);
  
  if (!defaultOrg) {
    console.error("❌ No organization found in database");
    return;
  }
  
  console.log(`📋 Using organization: ${defaultOrg.name} (${defaultOrg.id})`);
  
  // List of all KRA documents
  const kraFiles = [
    // Patrick Accounting KRAs
    "attached_assets/PATS - Production Admin_1760384279718.docx",
    "attached_assets/PATS - Firm Administrator_1760384279719.docx",
    "attached_assets/PATS - Firm Administrator updated_1760384279718.docx",
    "attached_assets/PATS - Marketing Manager_1760384279718.docx",
    "attached_assets/PATS - Sales & Business Development Rep_1760384279718.docx",
    "attached_assets/PATS - Senior Staff Accountant v012025_1760384279718.docx",
    "attached_assets/PATS - Staff Accountant v052024_1760384279718.docx",
    "attached_assets/PATS - Team Lead ATM v042025_1760384279718.docx",
    "attached_assets/PATS - Strategic Financial Controller_1760384279718.docx",
    "attached_assets/PATS - Videographer_1760384279718.docx",
    "attached_assets/PATS - Accounting and Tax Manager v042025_1760384279719.docx",
    "attached_assets/PATS - Accounting and Tax Manager v052024_1760384279719.docx",
    "attached_assets/PATS - BOSS Coordinator_1760384279719.docx",
    "attached_assets/PATS - Digital Marketing Specialist_1760384279719.docx",
    "attached_assets/PATS - Director of People Services_1760384279719.docx",
    "attached_assets/PATS - Client Care Coordinator_1760384279719.docx",
    "attached_assets/PATS - Director of Accounting_1760384279719.docx",
    "attached_assets/PATS - Director of Tax_1760384279719.docx",
    "attached_assets/PATS - Director of Business Development_1760384279719.docx",
    
    // Whirks KRAs
    "attached_assets/Whirks - Client Success Specialist v062024_1760384392879.docx",
    "attached_assets/Whirks - Client Success Expert_1760384392879.docx",
    "attached_assets/Whirks - Director of Benefit Services_1760384392879.docx",
    "attached_assets/Whirks - Payroll Tax Specialist_1760384392879.docx",
    "attached_assets/Whirks - People Services Manager_1760384392879.docx",
    "attached_assets/Whirks - Implementation Specialist_1760384392879.docx",
    "attached_assets/Whirks - Sales & Business Development Rep_1760384392879.docx",
    "attached_assets/Whirks - Director of Operations_1760384392879.docx",
    "attached_assets/Whirks - Client Success Manager_1760384392879.docx"
  ];
  
  let successCount = 0;
  let failureCount = 0;
  
  // First, clear existing KRA templates for this organization
  console.log("🗑️ Clearing existing KRA templates...");
  await db
    .delete(kraTemplates)
    .where(eq(kraTemplates.organizationId, defaultOrg.id));
  
  // Process each file
  for (const filePath of kraFiles) {
    console.log(`\n📄 Processing: ${path.basename(filePath)}`);
    
    const kraDoc = await parseKRADocument(filePath);
    
    if (!kraDoc) {
      console.error(`❌ Failed to parse: ${filePath}`);
      failureCount++;
      continue;
    }
    
    console.log(`  ✅ Parsed: ${kraDoc.jobTitle}`);
    console.log(`  📁 Department: ${kraDoc.department}`);
    console.log(`  👤 Role Level: ${kraDoc.roleLevel}`);
    console.log(`  🎯 KRAs found: ${kraDoc.keyResultAreas.length}`);
    
    // Create the KRA template in the database
    try {
      const goals = kraDoc.keyResultAreas.map((kra, index) => ({
        id: `kra-${index + 1}`,
        title: kra.title || `Key Result Area #${index + 1}`,
        description: kra.description.join("\n"),
        metrics: kra.metrics,
        weight: Math.floor(100 / kraDoc.keyResultAreas.length) // Distribute weight evenly
      }));
      
      const template = {
        organizationId: defaultOrg.id,
        name: `${kraDoc.jobTitle} (${kraDoc.organization})`,
        description: kraDoc.summary,
        goals: JSON.stringify(goals), // Store as JSON string
        category: kraDoc.department.toLowerCase(),
        isActive: true,
        createdBy: "system"
      };
      
      await db.insert(kraTemplates).values(template);
      
      console.log(`  ✅ Created template for: ${kraDoc.jobTitle}`);
      successCount++;
    } catch (error) {
      console.error(`  ❌ Failed to create template for ${kraDoc.jobTitle}:`, error);
      failureCount++;
    }
  }
  
  console.log("\n========================================");
  console.log(`✅ Successfully loaded: ${successCount} templates`);
  console.log(`❌ Failed to load: ${failureCount} templates`);
  console.log("========================================\n");
}

// Run the script
loadAllKRATemplates()
  .then(() => {
    console.log("✅ KRA template loading complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error loading KRA templates:", error);
    process.exit(1);
  });

export { loadAllKRATemplates, parseKRADocument };