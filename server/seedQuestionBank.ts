import { db } from "./db";
import { questionCategories, questionBank, type QuestionCategory, type QuestionBank } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface SeedResult {
  success: boolean;
  categoriesCreated: number;
  questionsCreated: number;
  categoriesExisting: number;
  questionsExisting: number;
  message: string;
}

export async function seedQuestionBank(): Promise<SeedResult> {
  console.log("🌱 Seeding question bank...");
  
  // Check if categories already exist
  const existingCategories = await db.select().from(questionCategories);
  const existingQuestions = await db.select().from(questionBank);
  
  // If both already exist with sufficient data, return early
  if (existingCategories.length >= 6 && existingQuestions.length >= 24) {
    console.log("✓ Question bank already fully seeded");
    return {
      success: true,
      categoriesCreated: 0,
      questionsCreated: 0,
      categoriesExisting: existingCategories.length,
      questionsExisting: existingQuestions.length,
      message: "Question bank already fully populated"
    };
  }

  let categoriesCreated = 0;
  let questionsCreated = 0;

  // Define categories to seed
  const categoriesToSeed = [
    {
      id: "team-health",
      name: "Team Health",
      description: "Questions about team dynamics, collaboration, and culture",
      icon: "❤️",
      color: "rose",
      order: 1,
      isDefault: true
    },
    {
      id: "personal-growth",
      name: "Personal Growth",
      description: "Questions focused on individual development and learning",
      icon: "🌱",
      color: "green",
      order: 2,
      isDefault: true
    },
    {
      id: "work-progress",
      name: "Work Progress",
      description: "Questions about current projects, goals, and blockers",
      icon: "📊",
      color: "blue",
      order: 3,
      isDefault: true
    },
    {
      id: "wellbeing",
      name: "Wellbeing",
      description: "Questions about work-life balance and personal wellness",
      icon: "🧘",
      color: "purple",
      order: 4,
      isDefault: true
    },
    {
      id: "feedback",
      name: "Feedback & Recognition",
      description: "Questions about feedback, recognition, and appreciation",
      icon: "⭐",
      color: "yellow",
      order: 5,
      isDefault: true
    },
    {
      id: "innovation",
      name: "Innovation & Ideas",
      description: "Questions about new ideas, improvements, and creativity",
      icon: "💡",
      color: "orange",
      order: 6,
      isDefault: true
    }
  ];

  // Create missing categories
  const existingCategoryIds = new Set(existingCategories.map(c => c.id));
  const categoriesToCreate = categoriesToSeed.filter(c => !existingCategoryIds.has(c.id));
  
  if (categoriesToCreate.length > 0) {
    const createdCategories = await db.insert(questionCategories).values(categoriesToCreate).returning();
    categoriesCreated = createdCategories.length;
    console.log(`✓ Created ${categoriesCreated} question categories`);
  } else {
    console.log("✓ All question categories already exist");
  }

  // Define questions to seed
  const questionsToSeed = [
    // Team Health Questions
    {
      text: "How would you rate team collaboration this week?",
      categoryId: "team-health",
      description: "Gauge the effectiveness of team collaboration and identify areas for improvement",
      tags: ["weekly", "team", "collaboration"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What's one thing we could do to improve team communication?",
      categoryId: "team-health",
      description: "Identify specific communication challenges and solutions",
      tags: ["weekly", "communication", "improvement"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "Do you feel your voice is heard in team discussions?",
      categoryId: "team-health",
      description: "Assess psychological safety and inclusion in the team",
      tags: ["monthly", "inclusion", "psychological-safety"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "How supported do you feel by your team members?",
      categoryId: "team-health",
      description: "Measure team support and identify gaps",
      tags: ["bi-weekly", "support", "team"],
      isSystem: true,
      isApproved: true
    },
    
    // Personal Growth Questions
    {
      text: "What new skill or knowledge did you develop this week?",
      categoryId: "personal-growth",
      description: "Track continuous learning and development",
      tags: ["weekly", "learning", "skills"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What's one area you'd like to grow in over the next month?",
      categoryId: "personal-growth",
      description: "Identify development goals and aspirations",
      tags: ["monthly", "goals", "development"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What learning opportunity would you like to pursue?",
      categoryId: "personal-growth",
      description: "Discover learning interests and training needs",
      tags: ["quarterly", "training", "opportunities"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "How confident do you feel in your current role?",
      categoryId: "personal-growth",
      description: "Assess role confidence and identify support needs",
      tags: ["monthly", "confidence", "role"],
      isSystem: true,
      isApproved: true
    },

    // Work Progress Questions
    {
      text: "What are your top priorities for this week?",
      categoryId: "work-progress",
      description: "Align on weekly priorities and focus areas",
      tags: ["weekly", "priorities", "planning"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What blockers are preventing you from being productive?",
      categoryId: "work-progress",
      description: "Identify and address productivity blockers",
      tags: ["weekly", "blockers", "productivity"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "How satisfied are you with your progress on current goals?",
      categoryId: "work-progress",
      description: "Measure goal progress satisfaction",
      tags: ["bi-weekly", "goals", "progress"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What accomplishment are you most proud of this week?",
      categoryId: "work-progress",
      description: "Celebrate wins and achievements",
      tags: ["weekly", "achievements", "wins"],
      isSystem: true,
      isApproved: true
    },

    // Wellbeing Questions
    {
      text: "How would you rate your work-life balance this week?",
      categoryId: "wellbeing",
      description: "Monitor work-life balance and identify issues",
      tags: ["weekly", "work-life-balance", "wellness"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What's your stress level on a scale of 1-10?",
      categoryId: "wellbeing",
      description: "Track stress levels and provide support",
      tags: ["weekly", "stress", "mental-health"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "Are you able to disconnect from work outside of hours?",
      categoryId: "wellbeing",
      description: "Assess ability to maintain boundaries",
      tags: ["monthly", "boundaries", "disconnect"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What would help improve your wellbeing at work?",
      categoryId: "wellbeing",
      description: "Identify wellbeing improvement opportunities",
      tags: ["monthly", "improvement", "wellness"],
      isSystem: true,
      isApproved: true
    },

    // Feedback & Recognition Questions
    {
      text: "Who deserves recognition this week and why?",
      categoryId: "feedback",
      description: "Encourage peer recognition and appreciation",
      tags: ["weekly", "recognition", "appreciation"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What feedback would help you grow?",
      categoryId: "feedback",
      description: "Identify desired feedback areas",
      tags: ["monthly", "feedback", "growth"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "How valued do you feel for your contributions?",
      categoryId: "feedback",
      description: "Measure sense of value and appreciation",
      tags: ["monthly", "value", "appreciation"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What's one piece of constructive feedback for the team?",
      categoryId: "feedback",
      description: "Gather team improvement feedback",
      tags: ["monthly", "team-feedback", "improvement"],
      isSystem: true,
      isApproved: true
    },

    // Innovation & Ideas Questions
    {
      text: "What's one process we could improve?",
      categoryId: "innovation",
      description: "Identify process improvement opportunities",
      tags: ["monthly", "process", "improvement"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What innovative idea would you like to explore?",
      categoryId: "innovation",
      description: "Encourage creative thinking and innovation",
      tags: ["quarterly", "ideas", "innovation"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What's one thing we should stop doing?",
      categoryId: "innovation",
      description: "Identify inefficiencies and unnecessary work",
      tags: ["quarterly", "efficiency", "improvement"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "If you could change one thing about how we work, what would it be?",
      categoryId: "innovation",
      description: "Gather transformative improvement ideas",
      tags: ["quarterly", "change", "improvement"],
      isSystem: true,
      isApproved: true
    }
  ];

  // Create missing questions by checking text uniqueness
  const existingQuestionTexts = new Set(existingQuestions.map(q => q.text));
  const questionsToCreate = questionsToSeed.filter(q => !existingQuestionTexts.has(q.text));
  
  if (questionsToCreate.length > 0) {
    const createdQuestions = await db.insert(questionBank).values(questionsToCreate).returning();
    questionsCreated = createdQuestions.length;
    console.log(`✓ Created ${questionsCreated} question bank items`);
  } else {
    console.log("✓ All question bank items already exist");
  }

  const message = `Seeding completed: ${categoriesCreated} categories created, ${questionsCreated} questions created`;
  console.log(`✅ ${message}`);
  
  return {
    success: true,
    categoriesCreated,
    questionsCreated,
    categoriesExisting: existingCategories.length,
    questionsExisting: existingQuestions.length,
    message
  };
}

// Run if executed directly (for manual seeding)
// To run manually: npx tsx server/seedQuestionBank.ts
// Note: Commenting out direct execution to avoid ES module issues
// This function is now primarily called via the API endpoint