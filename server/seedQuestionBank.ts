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
      id: "work-life-balance",
      name: "Work-Life Balance",
      description: "Questions about maintaining healthy work-life boundaries and wellness",
      icon: "⚖️",
      color: "purple",
      order: 2,
      isDefault: true
    },
    {
      id: "growth-development",
      name: "Growth & Development",
      description: "Questions focused on personal and professional development",
      icon: "🌱",
      color: "green",
      order: 3,
      isDefault: true
    },
    {
      id: "communication",
      name: "Communication",
      description: "Questions about team communication, feedback, and information sharing",
      icon: "💬",
      color: "blue",
      order: 4,
      isDefault: true
    },
    {
      id: "recognition",
      name: "Recognition",
      description: "Questions about appreciation, achievements, and celebrating wins",
      icon: "⭐",
      color: "yellow",
      order: 5,
      isDefault: true
    },
    {
      id: "engagement",
      name: "Engagement",
      description: "Questions about motivation, purpose, and connection to work",
      icon: "🚀",
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
      text: "What's one thing we could do to improve our team culture?",
      categoryId: "team-health",
      description: "Identify ways to strengthen team culture",
      tags: ["weekly", "culture", "improvement"],
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
    {
      text: "How well does our team handle conflicts and disagreements?",
      categoryId: "team-health",
      description: "Assess conflict resolution and team dynamics",
      tags: ["monthly", "conflict", "teamwork"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What makes you proud to be part of this team?",
      categoryId: "team-health",
      description: "Identify team strengths and positive attributes",
      tags: ["monthly", "pride", "team"],
      isSystem: true,
      isApproved: true
    },
    
    // Work-Life Balance Questions
    {
      text: "How would you rate your work-life balance this week?",
      categoryId: "work-life-balance",
      description: "Monitor work-life balance and identify stress points",
      tags: ["weekly", "balance", "wellbeing"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "Are you able to disconnect from work during personal time?",
      categoryId: "work-life-balance",
      description: "Assess ability to maintain boundaries",
      tags: ["weekly", "boundaries", "disconnect"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What support would help improve your work-life balance?",
      categoryId: "work-life-balance",
      description: "Identify needed support for better balance",
      tags: ["monthly", "support", "balance"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "How sustainable is your current workload?",
      categoryId: "work-life-balance",
      description: "Evaluate workload sustainability",
      tags: ["bi-weekly", "workload", "sustainability"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What's one thing that would reduce your stress levels?",
      categoryId: "work-life-balance",
      description: "Identify stress reduction opportunities",
      tags: ["weekly", "stress", "wellness"],
      isSystem: true,
      isApproved: true
    },

    // Growth & Development Questions
    {
      text: "What new skills would you like to develop this quarter?",
      categoryId: "growth-development",
      description: "Identify skill development goals",
      tags: ["quarterly", "skills", "learning"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "How satisfied are you with your career progression?",
      categoryId: "growth-development",
      description: "Assess career satisfaction and growth",
      tags: ["monthly", "career", "progression"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What learning opportunities have you taken advantage of recently?",
      categoryId: "growth-development",
      description: "Track learning engagement",
      tags: ["weekly", "learning", "development"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What mentorship or guidance would benefit you most?",
      categoryId: "growth-development",
      description: "Identify mentorship needs",
      tags: ["monthly", "mentorship", "guidance"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "How clear are you on your career path at this company?",
      categoryId: "growth-development",
      description: "Assess career path clarity",
      tags: ["quarterly", "career", "clarity"],
      isSystem: true,
      isApproved: true
    },

    // Communication Questions
    {
      text: "How effective is communication within your team?",
      categoryId: "communication",
      description: "Assess team communication effectiveness",
      tags: ["weekly", "communication", "effectiveness"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "Do you receive the information you need to do your job effectively?",
      categoryId: "communication",
      description: "Evaluate information flow and transparency",
      tags: ["weekly", "information", "transparency"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "How comfortable are you providing feedback to your teammates?",
      categoryId: "communication",
      description: "Assess feedback culture",
      tags: ["monthly", "feedback", "comfort"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What communication channels or tools would improve team collaboration?",
      categoryId: "communication",
      description: "Identify communication improvement opportunities",
      tags: ["monthly", "tools", "improvement"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "How clear are expectations and goals communicated to you?",
      categoryId: "communication",
      description: "Evaluate clarity of expectations",
      tags: ["bi-weekly", "expectations", "clarity"],
      isSystem: true,
      isApproved: true
    },

    // Recognition Questions
    {
      text: "Who on your team deserves recognition this week?",
      categoryId: "recognition",
      description: "Encourage peer recognition",
      tags: ["weekly", "peers", "appreciation"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What accomplishment are you most proud of this week?",
      categoryId: "recognition",
      description: "Celebrate personal wins and achievements",
      tags: ["weekly", "achievements", "wins"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "How valued do you feel for your contributions?",
      categoryId: "recognition",
      description: "Measure sense of value and appreciation",
      tags: ["monthly", "value", "appreciation"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "When was the last time you received meaningful recognition?",
      categoryId: "recognition",
      description: "Track recognition frequency and impact",
      tags: ["monthly", "recognition", "feedback"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What type of recognition is most meaningful to you?",
      categoryId: "recognition",
      description: "Understand recognition preferences",
      tags: ["quarterly", "preferences", "recognition"],
      isSystem: true,
      isApproved: true
    },

    // Engagement Questions
    {
      text: "How motivated do you feel about your work right now?",
      categoryId: "engagement",
      description: "Gauge current motivation levels",
      tags: ["weekly", "motivation", "engagement"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "How connected do you feel to the company's mission?",
      categoryId: "engagement",
      description: "Assess alignment with company purpose",
      tags: ["monthly", "mission", "purpose"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What aspect of your work energizes you most?",
      categoryId: "engagement",
      description: "Identify energizing work elements",
      tags: ["monthly", "energy", "passion"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "How likely are you to recommend this company as a place to work?",
      categoryId: "engagement",
      description: "Measure employee Net Promoter Score",
      tags: ["quarterly", "nps", "satisfaction"],
      isSystem: true,
      isApproved: true
    },
    {
      text: "What would make you more excited to come to work?",
      categoryId: "engagement",
      description: "Identify engagement improvement opportunities",
      tags: ["monthly", "excitement", "improvement"],
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