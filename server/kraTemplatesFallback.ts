// Fallback KRA templates for production reliability
// This file contains a subset of critical templates to ensure import always works

export const FALLBACK_TEMPLATES = [
  {
    name: "Senior Accountant",
    description: "Manages complex accounting tasks, financial reporting, and provides guidance to junior staff",
    goals: [
      {
        id: "1",
        title: "Financial Reporting Accuracy",
        description: "Ensure accurate and timely financial reporting in compliance with accounting standards",
        metrics: "Monthly financial statements completed with 99% accuracy rate",
        weight: 30,
        targets: {
          q1: "Complete all monthly closings within 5 business days",
          q2: "Implement automated reconciliation for 3 key accounts",
          q3: "Reduce reporting errors by 25%",
          q4: "Achieve 100% compliance with new accounting standards"
        }
      },
      {
        id: "2",
        title: "Team Development & Mentorship",
        description: "Provide guidance and training to junior accounting staff",
        metrics: "Number of team members mentored and training sessions conducted",
        weight: 25,
        targets: {
          q1: "Conduct weekly check-ins with 2 junior staff members",
          q2: "Develop training materials for 2 accounting processes",
          q3: "Lead 3 team training sessions",
          q4: "Help 2 team members achieve professional certifications"
        }
      },
      {
        id: "3",
        title: "Process Improvement",
        description: "Identify and implement improvements to accounting processes",
        metrics: "Number of process improvements implemented and time saved",
        weight: 25,
        targets: {
          q1: "Document 5 existing accounting processes",
          q2: "Identify 3 automation opportunities",
          q3: "Implement 2 process improvements",
          q4: "Achieve 20% time reduction in routine tasks"
        }
      },
      {
        id: "4",
        title: "Audit & Compliance",
        description: "Ensure compliance with internal controls and support audit activities",
        metrics: "Audit findings resolved and compliance score",
        weight: 20,
        targets: {
          q1: "Complete internal control testing for Q4",
          q2: "Resolve 100% of prior audit findings",
          q3: "Support external audit with zero material findings",
          q4: "Maintain 98% compliance score"
        }
      }
    ],
    category: "finance",
    department: "Accounting",
    jobTitle: "Senior Accountant",
    industries: ["professional-services", "finance"],
    isGlobal: true,
    isActive: true,
    organization: "Patrick Accounting"
  },
  {
    name: "Client Success Specialist",
    description: "Ensures client satisfaction, manages relationships, and drives retention through proactive engagement",
    goals: [
      {
        id: "1",
        title: "Client Retention",
        description: "Maintain high client retention rates through proactive relationship management",
        metrics: "Client retention rate and churn reduction",
        weight: 30,
        targets: {
          q1: "Maintain 95% client retention rate",
          q2: "Reduce churn by 10% from previous quarter",
          q3: "Implement early warning system for at-risk clients",
          q4: "Achieve 97% annual retention rate"
        }
      },
      {
        id: "2",
        title: "Client Satisfaction",
        description: "Ensure high levels of client satisfaction through excellent service delivery",
        metrics: "NPS scores and client feedback ratings",
        weight: 25,
        targets: {
          q1: "Achieve NPS score of 70+",
          q2: "Maintain 90% CSAT rating",
          q3: "Reduce response time to under 2 hours",
          q4: "Achieve 95% first-contact resolution rate"
        }
      },
      {
        id: "3",
        title: "Account Growth",
        description: "Identify and pursue upsell and cross-sell opportunities",
        metrics: "Revenue from existing accounts and expansion rate",
        weight: 25,
        targets: {
          q1: "Generate $50K in upsell revenue",
          q2: "Achieve 15% account expansion rate",
          q3: "Identify 10 qualified expansion opportunities",
          q4: "Close 5 expansion deals"
        }
      },
      {
        id: "4",
        title: "Process Documentation",
        description: "Create and maintain client success playbooks and processes",
        metrics: "Number of processes documented and team adoption rate",
        weight: 20,
        targets: {
          q1: "Document 5 key client workflows",
          q2: "Create onboarding checklist and materials",
          q3: "Develop 3 case studies from successful clients",
          q4: "Achieve 90% team adoption of new processes"
        }
      }
    ],
    category: "client_success",
    department: "Customer Success",
    jobTitle: "Client Success Specialist",
    industries: ["technology", "saas"],
    isGlobal: true,
    isActive: true,
    organization: "Whirks"
  },
  {
    name: "Marketing Manager",
    description: "Develops and executes marketing strategies to drive brand awareness and lead generation",
    goals: [
      {
        id: "1",
        title: "Lead Generation",
        description: "Generate qualified leads through various marketing channels",
        metrics: "Number of MQLs and conversion rates",
        weight: 35,
        targets: {
          q1: "Generate 500 MQLs",
          q2: "Achieve 25% MQL to SQL conversion",
          q3: "Increase lead quality score by 20%",
          q4: "Generate 2000 MQLs for the year"
        }
      },
      {
        id: "2",
        title: "Brand Awareness",
        description: "Increase brand visibility and market presence",
        metrics: "Website traffic, social media engagement, and brand mentions",
        weight: 25,
        targets: {
          q1: "Increase website traffic by 30%",
          q2: "Grow social media followers by 50%",
          q3: "Achieve 100 media mentions",
          q4: "Improve brand recognition score by 40%"
        }
      },
      {
        id: "3",
        title: "Campaign Performance",
        description: "Execute successful marketing campaigns with measurable ROI",
        metrics: "Campaign ROI and engagement rates",
        weight: 25,
        targets: {
          q1: "Launch 3 major campaigns",
          q2: "Achieve 3:1 ROI on paid campaigns",
          q3: "Improve email open rates to 25%",
          q4: "Achieve 150% of annual revenue target from marketing"
        }
      },
      {
        id: "4",
        title: "Team Development",
        description: "Build and develop a high-performing marketing team",
        metrics: "Team productivity and skill development",
        weight: 15,
        targets: {
          q1: "Hire 2 marketing specialists",
          q2: "Implement weekly team training",
          q3: "Complete performance reviews with development plans",
          q4: "Achieve 90% team satisfaction score"
        }
      }
    ],
    category: "marketing",
    department: "Marketing",
    jobTitle: "Marketing Manager",
    industries: ["technology", "saas"],
    isGlobal: true,
    isActive: true,
    organization: "Whirks"
  }
];

// Function removed - template conversion now done inline in routes.ts