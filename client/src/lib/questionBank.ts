// Question Bank - Predefined question templates organized by categories
// These questions can be selected and customized by managers when creating check-in questions

export interface QuestionTemplate {
  id: string;
  text: string;
  description?: string;
  category: string;
}

export interface QuestionCategory {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  color: string; // Tailwind color class
}

export const questionCategories: QuestionCategory[] = [
  {
    id: "mood-wellness",
    name: "Mood & Wellness",
    description: "Questions about mental health, stress levels, and work-life balance",
    icon: "Heart",
    color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
  },
  {
    id: "team-communication",
    name: "Team & Communication", 
    description: "Questions about team dynamics, collaboration, and communication",
    icon: "Users",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
  },
  {
    id: "work-satisfaction",
    name: "Work Satisfaction",
    description: "Questions about job fulfillment, productivity, and work challenges",
    icon: "Briefcase",
    color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
  },
  {
    id: "growth-development",
    name: "Growth & Development",
    description: "Questions about learning, career development, and skill building",
    icon: "TrendingUp",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
  },
  {
    id: "feedback-support",
    name: "Feedback & Support",
    description: "Questions about receiving feedback and management support",
    icon: "MessageCircle",
    color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
  },
  {
    id: "goals-priorities",
    name: "Goals & Priorities",
    description: "Questions about objectives, priorities, and project progress",
    icon: "Target",
    color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300"
  }
];

export const questionTemplates: QuestionTemplate[] = [
  // Mood & Wellness
  {
    id: "mood-overall",
    text: "How would you rate your overall mood this week?",
    description: "General mood assessment on a 1-5 scale",
    category: "mood-wellness"
  },
  {
    id: "stress-level",
    text: "What's your current stress level?",
    description: "Understanding stress levels to provide support",
    category: "mood-wellness"
  },
  {
    id: "work-life-balance",
    text: "How satisfied are you with your work-life balance?",
    description: "Assessing balance between work and personal life",
    category: "mood-wellness"
  },
  {
    id: "energy-level",
    text: "How would you describe your energy level this week?",
    description: "Understanding energy and motivation levels",
    category: "mood-wellness"
  },
  {
    id: "mental-health",
    text: "Do you feel mentally supported at work?",
    description: "Checking on mental health support needs",
    category: "mood-wellness"
  },
  {
    id: "burnout-check",
    text: "Are you experiencing any signs of burnout?",
    description: "Early detection of burnout symptoms",
    category: "mood-wellness"
  },

  // Team & Communication
  {
    id: "team-collaboration",
    text: "How well is your team collaborating this week?",
    description: "Assessing team dynamics and collaboration effectiveness",
    category: "team-communication"
  },
  {
    id: "feeling-heard",
    text: "Do you feel heard and valued in team meetings?",
    description: "Ensuring everyone has a voice in team discussions",
    category: "team-communication"
  },
  {
    id: "communication-clarity",
    text: "How clear are your current priorities and expectations?",
    description: "Checking clarity of communication from leadership",
    category: "team-communication"
  },
  {
    id: "team-support",
    text: "Do you feel supported by your teammates?",
    description: "Understanding team support dynamics",
    category: "team-communication"
  },
  {
    id: "meeting-effectiveness",
    text: "How effective were the meetings you attended this week?",
    description: "Gathering feedback on meeting quality and usefulness",
    category: "team-communication"
  },
  {
    id: "conflict-resolution",
    text: "Are there any unresolved conflicts affecting your work?",
    description: "Identifying team conflicts that need attention",
    category: "team-communication"
  },

  // Work Satisfaction
  {
    id: "task-challenge",
    text: "How challenged do you feel by your current tasks?",
    description: "Ensuring work is appropriately challenging",
    category: "work-satisfaction"
  },
  {
    id: "productivity-blockers",
    text: "What's blocking your productivity this week?",
    description: "Identifying obstacles to remove",
    category: "work-satisfaction"
  },
  {
    id: "work-fulfillment",
    text: "How fulfilling do you find your current work?",
    description: "Understanding job satisfaction and meaning",
    category: "work-satisfaction"
  },
  {
    id: "autonomy-level",
    text: "Do you feel you have enough autonomy in your role?",
    description: "Assessing decision-making freedom and independence",
    category: "work-satisfaction"
  },
  {
    id: "workload-manageability",
    text: "Is your current workload manageable?",
    description: "Checking if workload is sustainable",
    category: "work-satisfaction"
  },
  {
    id: "role-clarity",
    text: "How clear are you about your role and responsibilities?",
    description: "Ensuring role expectations are well-defined",
    category: "work-satisfaction"
  },

  // Growth & Development
  {
    id: "skill-development",
    text: "What skills would you like to develop or improve?",
    description: "Identifying learning and development opportunities",
    category: "growth-development"
  },
  {
    id: "career-support",
    text: "Do you feel supported in your career growth?",
    description: "Assessing career development support",
    category: "growth-development"
  },
  {
    id: "learning-opportunities",
    text: "Have you had any good learning opportunities this week?",
    description: "Tracking continuous learning and growth",
    category: "growth-development"
  },
  {
    id: "performance-improvement",
    text: "What would help you perform better in your role?",
    description: "Identifying performance enhancement needs",
    category: "growth-development"
  },
  {
    id: "career-goals",
    text: "Are you making progress toward your career goals?",
    description: "Tracking career progression and satisfaction",
    category: "growth-development"
  },
  {
    id: "mentorship-needs",
    text: "Would you benefit from additional mentorship or coaching?",
    description: "Identifying mentorship and guidance needs",
    category: "growth-development"
  },

  // Feedback & Support
  {
    id: "feedback-frequency",
    text: "Are you getting enough feedback on your work?",
    description: "Ensuring adequate feedback and communication",
    category: "feedback-support"
  },
  {
    id: "manager-support",
    text: "How supported do you feel by your manager?",
    description: "Assessing manager-employee relationship quality",
    category: "feedback-support"
  },
  {
    id: "recognition-appreciation",
    text: "Do you feel your contributions are recognized and appreciated?",
    description: "Understanding recognition and appreciation levels",
    category: "feedback-support"
  },
  {
    id: "constructive-feedback",
    text: "How helpful is the feedback you receive?",
    description: "Assessing quality and usefulness of feedback",
    category: "feedback-support"
  },
  {
    id: "support-resources",
    text: "Do you have access to the resources and support you need?",
    description: "Ensuring adequate tools and support availability",
    category: "feedback-support"
  },
  {
    id: "feedback-comfort",
    text: "How comfortable do you feel giving feedback to your manager?",
    description: "Assessing psychological safety for upward feedback",
    category: "feedback-support"
  },

  // Goals & Priorities
  {
    id: "goal-clarity",
    text: "How clear are you about your current goals and objectives?",
    description: "Ensuring goal clarity and alignment",
    category: "goals-priorities"
  },
  {
    id: "priority-management",
    text: "Are you able to focus on your highest priority tasks?",
    description: "Checking priority clarity and time management",
    category: "goals-priorities"
  },
  {
    id: "goal-progress",
    text: "What progress have you made on your key goals this week?",
    description: "Tracking goal achievement and progress",
    category: "goals-priorities"
  },
  {
    id: "deadline-pressure",
    text: "Are any upcoming deadlines causing you stress?",
    description: "Identifying deadline-related pressure points",
    category: "goals-priorities"
  },
  {
    id: "project-satisfaction",
    text: "How satisfied are you with the projects you're working on?",
    description: "Assessing project engagement and satisfaction",
    category: "goals-priorities"
  },
  {
    id: "goal-relevance",
    text: "Do your current goals feel meaningful and relevant?",
    description: "Ensuring goals align with personal and company values",
    category: "goals-priorities"
  }
];

// Helper functions
export function getQuestionsByCategory(categoryId: string): QuestionTemplate[] {
  return questionTemplates.filter(q => q.category === categoryId);
}

export function getCategoryById(categoryId: string): QuestionCategory | undefined {
  return questionCategories.find(c => c.id === categoryId);
}

export function getQuestionById(questionId: string): QuestionTemplate | undefined {
  return questionTemplates.find(q => q.id === questionId);
}

export function searchQuestions(searchTerm: string): QuestionTemplate[] {
  const lowercaseSearch = searchTerm.toLowerCase();
  return questionTemplates.filter(q => 
    q.text.toLowerCase().includes(lowercaseSearch) ||
    (q.description && q.description.toLowerCase().includes(lowercaseSearch))
  );
}