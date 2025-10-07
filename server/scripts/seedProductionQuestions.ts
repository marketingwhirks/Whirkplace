#!/usr/bin/env tsx
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "../../shared/schema";
import { questionCategories, questionBank } from "../../shared/schema";

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

// Interface for tracking results
interface SeedResult {
  success: boolean;
  categoriesCreated: number;
  questionsCreated: number;
  categoriesExisting: number;
  questionsExisting: number;
  message: string;
}

async function seedProductionQuestions(): Promise<SeedResult> {
  console.log("🎯 Starting production database seeding for HR/Culture questions...");
  
  // Ensure we have the DATABASE_URL
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Cannot connect to production database.");
  }
  
  // Log that we're using production database (without exposing the actual URL)
  console.log("📡 Connecting to production database...");
  
  // Create production database connection
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool, schema });
  
  let categoriesCreated = 0;
  let questionsCreated = 0;

  try {
    // Check existing categories
    const existingCategories = await db.select().from(questionCategories);
    console.log(`✅ Found ${existingCategories.length} existing categories`);
    
    // Check existing questions  
    const existingQuestions = await db.select().from(questionBank);
    console.log(`✅ Found ${existingQuestions.length} existing questions`);
    
    // Define HR/Culture focused categories
    const hrCategories = [
      {
        id: "team-culture-values",
        name: "Team Culture & Values",
        description: "Questions about team culture, values alignment, and organizational fit",
        icon: "🎯",
        color: "indigo",
        order: 7,
        isDefault: true
      },
      {
        id: "professional-development",
        name: "Professional Development",
        description: "Questions focused on career growth, skill development, and learning opportunities",
        icon: "📚",
        color: "emerald",
        order: 8,
        isDefault: true
      },
      {
        id: "work-life-balance",
        name: "Work-Life Balance",
        description: "Questions about maintaining healthy boundaries and personal well-being",
        icon: "⚖️",
        color: "cyan",
        order: 9,
        isDefault: true
      },
      {
        id: "communication-feedback",
        name: "Communication & Feedback",
        description: "Questions about communication effectiveness and feedback culture",
        icon: "💬",
        color: "amber",
        order: 10,
        isDefault: true
      },
      {
        id: "recognition-motivation",
        name: "Recognition & Motivation",
        description: "Questions about recognition, rewards, and motivation drivers",
        icon: "🏆",
        color: "orange",
        order: 11,
        isDefault: true
      },
      {
        id: "leadership-management",
        name: "Leadership & Management",
        description: "Questions about leadership effectiveness and management support",
        icon: "👥",
        color: "violet",
        order: 12,
        isDefault: true
      }
    ];
    
    // Create missing categories
    const existingCategoryIds = new Set(existingCategories.map(c => c.id));
    const categoriesToCreate = hrCategories.filter(c => !existingCategoryIds.has(c.id));
    
    if (categoriesToCreate.length > 0) {
      console.log(`📝 Creating ${categoriesToCreate.length} new HR/Culture categories...`);
      const createdCategories = await db.insert(questionCategories).values(categoriesToCreate).returning();
      categoriesCreated = createdCategories.length;
      console.log(`✅ Created ${categoriesCreated} categories successfully`);
    } else {
      console.log("✓ All HR/Culture categories already exist");
    }
    
    // Define HR/Culture focused questions (5 per category)
    const hrQuestions = [
      // Team Culture & Values (5 questions)
      {
        text: "How well do you feel your personal values align with our team's culture?",
        categoryId: "team-culture-values",
        description: "Assess value alignment and cultural fit",
        tags: ["monthly", "values", "culture", "alignment"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "What aspect of our team culture makes you most proud to work here?",
        categoryId: "team-culture-values",
        description: "Identify strong cultural elements",
        tags: ["quarterly", "culture", "pride", "values"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "How would you describe our team culture to a potential new hire?",
        categoryId: "team-culture-values",
        description: "Understand employee perception of culture",
        tags: ["quarterly", "culture", "recruitment", "perception"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "Which company value do you see demonstrated most frequently?",
        categoryId: "team-culture-values",
        description: "Identify values in action",
        tags: ["monthly", "values", "behavior", "culture"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "What's one thing we could do to strengthen our team culture?",
        categoryId: "team-culture-values",
        description: "Gather culture improvement ideas",
        tags: ["quarterly", "culture", "improvement", "suggestions"],
        isSystem: true,
        isApproved: true
      },
      
      // Professional Development (5 questions)
      {
        text: "What skills would you like to develop in the next 6 months?",
        categoryId: "professional-development",
        description: "Identify individual development goals",
        tags: ["quarterly", "skills", "development", "goals"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "How satisfied are you with your career growth opportunities here?",
        categoryId: "professional-development",
        description: "Measure career growth satisfaction",
        tags: ["monthly", "career", "growth", "satisfaction"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "What training or resources would help you perform better in your role?",
        categoryId: "professional-development",
        description: "Identify training needs",
        tags: ["quarterly", "training", "resources", "performance"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "Do you have a clear understanding of your career path within the organization?",
        categoryId: "professional-development",
        description: "Assess career path clarity",
        tags: ["quarterly", "career-path", "clarity", "planning"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "How often do you get opportunities to use your strengths at work?",
        categoryId: "professional-development",
        description: "Evaluate strength utilization",
        tags: ["monthly", "strengths", "opportunities", "engagement"],
        isSystem: true,
        isApproved: true
      },
      
      // Work-Life Balance (5 questions)
      {
        text: "How often do you feel you have enough time for personal activities outside work?",
        categoryId: "work-life-balance",
        description: "Assess work-life balance satisfaction",
        tags: ["weekly", "balance", "personal-time", "wellbeing"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "Do you feel comfortable taking time off when you need it?",
        categoryId: "work-life-balance",
        description: "Evaluate PTO culture and comfort",
        tags: ["monthly", "time-off", "culture", "comfort"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "How supported do you feel in maintaining work-life boundaries?",
        categoryId: "work-life-balance",
        description: "Measure boundary support",
        tags: ["monthly", "boundaries", "support", "balance"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "What would help you achieve better work-life balance?",
        categoryId: "work-life-balance",
        description: "Identify balance improvement opportunities",
        tags: ["quarterly", "balance", "improvement", "suggestions"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "How often do you check work communications outside of work hours?",
        categoryId: "work-life-balance",
        description: "Understand after-hours work patterns",
        tags: ["monthly", "boundaries", "communication", "after-hours"],
        isSystem: true,
        isApproved: true
      },
      
      // Communication & Feedback (5 questions)
      {
        text: "How effectively does information flow between teams and departments?",
        categoryId: "communication-feedback",
        description: "Assess cross-team communication",
        tags: ["monthly", "communication", "information-flow", "teams"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "How comfortable do you feel providing upward feedback to leadership?",
        categoryId: "communication-feedback",
        description: "Measure upward feedback comfort",
        tags: ["quarterly", "feedback", "leadership", "comfort"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "How often do you receive meaningful feedback on your performance?",
        categoryId: "communication-feedback",
        description: "Evaluate feedback frequency and quality",
        tags: ["monthly", "feedback", "performance", "frequency"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "What communication channels or practices work best for our team?",
        categoryId: "communication-feedback",
        description: "Identify effective communication methods",
        tags: ["quarterly", "communication", "channels", "effectiveness"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "Do you feel you receive timely updates about important company changes?",
        categoryId: "communication-feedback",
        description: "Assess change communication effectiveness",
        tags: ["monthly", "communication", "updates", "transparency"],
        isSystem: true,
        isApproved: true
      },
      
      // Recognition & Motivation (5 questions)
      {
        text: "How often do you feel recognized for your contributions?",
        categoryId: "recognition-motivation",
        description: "Measure recognition frequency",
        tags: ["weekly", "recognition", "appreciation", "frequency"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "What type of recognition is most meaningful to you?",
        categoryId: "recognition-motivation",
        description: "Understand recognition preferences",
        tags: ["quarterly", "recognition", "preferences", "motivation"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "What motivates you most in your current role?",
        categoryId: "recognition-motivation",
        description: "Identify key motivators",
        tags: ["monthly", "motivation", "engagement", "drivers"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "Do you feel your achievements are celebrated appropriately?",
        categoryId: "recognition-motivation",
        description: "Evaluate achievement celebration",
        tags: ["monthly", "achievements", "celebration", "recognition"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "How could we improve our recognition and reward systems?",
        categoryId: "recognition-motivation",
        description: "Gather recognition improvement ideas",
        tags: ["quarterly", "recognition", "rewards", "improvement"],
        isSystem: true,
        isApproved: true
      },
      
      // Leadership & Management (5 questions)
      {
        text: "How well does your manager support your professional development?",
        categoryId: "leadership-management",
        description: "Assess manager development support",
        tags: ["monthly", "manager", "development", "support"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "How clear are you on expectations from leadership?",
        categoryId: "leadership-management",
        description: "Evaluate expectation clarity",
        tags: ["monthly", "leadership", "expectations", "clarity"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "How accessible is leadership when you need support or guidance?",
        categoryId: "leadership-management",
        description: "Measure leadership accessibility",
        tags: ["monthly", "leadership", "accessibility", "support"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "What leadership quality do you value most in your manager?",
        categoryId: "leadership-management",
        description: "Identify valued leadership qualities",
        tags: ["quarterly", "leadership", "qualities", "manager"],
        isSystem: true,
        isApproved: true
      },
      {
        text: "How well does leadership communicate the company's vision and direction?",
        categoryId: "leadership-management",
        description: "Assess vision communication",
        tags: ["quarterly", "leadership", "vision", "communication"],
        isSystem: true,
        isApproved: true
      }
    ];
    
    // Create missing questions by checking text uniqueness
    const existingQuestionTexts = new Set(existingQuestions.map(q => q.text));
    const questionsToCreate = hrQuestions.filter(q => !existingQuestionTexts.has(q.text));
    
    if (questionsToCreate.length > 0) {
      console.log(`📝 Creating ${questionsToCreate.length} new HR/Culture questions...`);
      const createdQuestions = await db.insert(questionBank).values(questionsToCreate).returning();
      questionsCreated = createdQuestions.length;
      console.log(`✅ Created ${questionsCreated} questions successfully`);
    } else {
      console.log("✓ All HR/Culture questions already exist");
    }
    
    // Final summary
    const totalCategories = existingCategories.length + categoriesCreated;
    const totalQuestions = existingQuestions.length + questionsCreated;
    
    console.log("\n📊 Production Database Seeding Summary:");
    console.log("=====================================");
    console.log(`✅ Categories: ${totalCategories} total (${categoriesCreated} new, ${existingCategories.length} existing)`);
    console.log(`✅ Questions: ${totalQuestions} total (${questionsCreated} new, ${existingQuestions.length} existing)`);
    console.log("=====================================");
    console.log("✨ Production database seeding completed successfully!");
    
    return {
      success: true,
      categoriesCreated,
      questionsCreated,
      categoriesExisting: existingCategories.length,
      questionsExisting: existingQuestions.length,
      message: `Successfully seeded production: ${categoriesCreated} categories and ${questionsCreated} questions created`
    };
    
  } catch (error) {
    console.error("❌ Error seeding production database:", error);
    throw error;
  } finally {
    // Clean up the connection pool
    await pool.end();
  }
}

// Main execution
console.log("🚀 Running production database seeding script...");
console.log("⚠️  WARNING: This will modify the PRODUCTION database!");
console.log("=========================================\n");

seedProductionQuestions()
  .then(result => {
    console.log("\n✅ Script execution completed");
    process.exit(0);
  })
  .catch(error => {
    console.error("\n❌ Script execution failed:", error);
    process.exit(1);
  });

export { seedProductionQuestions };