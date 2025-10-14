export interface DefaultKraTemplate {
  name: string;
  organization: "Patrick Accounting" | "Whirks";
  jobTitle: string;
  department: string;
  category: string;
  description: string;
  goals: Array<{
    id: string;
    title: string;
    description: string;
    target?: string;
    metric?: string;
    weight?: number;
  }>;
  industries?: string[];
  roleLevel?: string;
}

export const DEFAULT_KRA_TEMPLATES: DefaultKraTemplate[] = [
  // Patrick Accounting Templates (19 templates)
  {
    name: "Production Admin",
    organization: "Patrick Accounting",
    jobTitle: "Production Admin",
    department: "Operations",
    category: "operations",
    description: "Responsible for managing production workflows, coordinating administrative tasks, and ensuring smooth operations of daily production activities.",
    goals: [
      {
        id: "prod-admin-1",
        title: "Production Workflow Management",
        description: "Oversee and optimize production workflows to ensure timely delivery of client work",
        target: "95% on-time delivery rate",
        metric: "Delivery rate percentage",
        weight: 30
      },
      {
        id: "prod-admin-2",
        title: "Administrative Support",
        description: "Provide comprehensive administrative support to the production team",
        target: "Handle 100% of administrative requests within 24 hours",
        metric: "Response time",
        weight: 25
      },
      {
        id: "prod-admin-3",
        title: "Quality Assurance",
        description: "Implement and maintain quality control procedures for all production outputs",
        target: "Less than 2% error rate",
        metric: "Error rate percentage",
        weight: 25
      },
      {
        id: "prod-admin-4",
        title: "Team Coordination",
        description: "Coordinate between different teams to ensure smooth workflow",
        target: "Weekly team sync meetings",
        metric: "Meeting attendance rate",
        weight: 20
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "mid"
  },
  {
    name: "Firm Administrator",
    organization: "Patrick Accounting",
    jobTitle: "Firm Administrator",
    department: "Operations",
    category: "operations",
    description: "Oversees the day-to-day operations of the accounting firm, ensuring efficient processes and excellent client service.",
    goals: [
      {
        id: "firm-admin-1",
        title: "Operational Excellence",
        description: "Maintain and improve firm-wide operational procedures and efficiency",
        target: "20% improvement in operational efficiency",
        metric: "Process efficiency metrics",
        weight: 35
      },
      {
        id: "firm-admin-2",
        title: "Client Satisfaction Management",
        description: "Ensure high levels of client satisfaction through effective service delivery",
        target: "95% client satisfaction score",
        metric: "Client satisfaction surveys",
        weight: 30
      },
      {
        id: "firm-admin-3",
        title: "Resource Management",
        description: "Effectively manage firm resources including staffing, supplies, and technology",
        target: "Stay within 5% of budget",
        metric: "Budget variance",
        weight: 20
      },
      {
        id: "firm-admin-4",
        title: "Compliance and Risk Management",
        description: "Ensure firm compliance with all regulations and manage operational risks",
        target: "Zero compliance violations",
        metric: "Compliance audit results",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "senior"
  },
  {
    name: "Marketing Manager",
    organization: "Patrick Accounting",
    jobTitle: "Marketing Manager",
    department: "Marketing",
    category: "marketing",
    description: "Develops and executes marketing strategies to promote the firm's services and build brand awareness.",
    goals: [
      {
        id: "marketing-mgr-1",
        title: "Marketing Strategy Development",
        description: "Create and implement comprehensive marketing strategies aligned with business goals",
        target: "Quarterly marketing plans delivered",
        metric: "Strategy implementation rate",
        weight: 30
      },
      {
        id: "marketing-mgr-2",
        title: "Lead Generation",
        description: "Generate qualified leads through various marketing channels",
        target: "50 qualified leads per month",
        metric: "Number of qualified leads",
        weight: 35
      },
      {
        id: "marketing-mgr-3",
        title: "Brand Management",
        description: "Maintain and enhance the firm's brand presence and reputation",
        target: "25% increase in brand awareness",
        metric: "Brand awareness metrics",
        weight: 20
      },
      {
        id: "marketing-mgr-4",
        title: "Marketing ROI",
        description: "Ensure positive return on marketing investments",
        target: "3:1 ROI on marketing spend",
        metric: "Marketing ROI ratio",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "manager"
  },
  {
    name: "Sales & Business Development Rep",
    organization: "Patrick Accounting",
    jobTitle: "Sales & Business Development Rep",
    department: "Sales",
    category: "sales",
    description: "Drives new business acquisition and develops relationships with potential clients.",
    goals: [
      {
        id: "sales-rep-1",
        title: "New Client Acquisition",
        description: "Identify and close new business opportunities",
        target: "5 new clients per quarter",
        metric: "New clients closed",
        weight: 40
      },
      {
        id: "sales-rep-2",
        title: "Revenue Generation",
        description: "Meet or exceed revenue targets through new business development",
        target: "$500,000 annual revenue",
        metric: "Revenue generated",
        weight: 35
      },
      {
        id: "sales-rep-3",
        title: "Pipeline Development",
        description: "Build and maintain a healthy sales pipeline",
        target: "30 qualified prospects in pipeline",
        metric: "Pipeline value",
        weight: 15
      },
      {
        id: "sales-rep-4",
        title: "Client Relationship Building",
        description: "Establish and nurture relationships with key decision makers",
        target: "Weekly touchpoints with prospects",
        metric: "Engagement rate",
        weight: 10
      }
    ],
    industries: ["all"],
    roleLevel: "individual"
  },
  {
    name: "Senior Staff Accountant",
    organization: "Patrick Accounting",
    jobTitle: "Senior Staff Accountant",
    department: "Accounting",
    category: "accounting",
    description: "Performs complex accounting tasks, supervises junior staff, and ensures accuracy in financial reporting.",
    goals: [
      {
        id: "sr-accountant-1",
        title: "Financial Reporting Accuracy",
        description: "Prepare and review accurate financial statements and reports",
        target: "100% accuracy in financial reports",
        metric: "Error rate in reports",
        weight: 35
      },
      {
        id: "sr-accountant-2",
        title: "Team Supervision",
        description: "Supervise and mentor junior accounting staff",
        target: "Manage 3-5 junior accountants",
        metric: "Team performance metrics",
        weight: 25
      },
      {
        id: "sr-accountant-3",
        title: "Client Service Excellence",
        description: "Provide exceptional service to assigned client accounts",
        target: "95% client retention rate",
        metric: "Client satisfaction scores",
        weight: 25
      },
      {
        id: "sr-accountant-4",
        title: "Process Improvement",
        description: "Identify and implement accounting process improvements",
        target: "2 process improvements per quarter",
        metric: "Process efficiency gains",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "senior"
  },
  {
    name: "Staff Accountant",
    organization: "Patrick Accounting",
    jobTitle: "Staff Accountant",
    department: "Accounting",
    category: "accounting",
    description: "Performs day-to-day accounting tasks, maintains financial records, and assists with client accounts.",
    goals: [
      {
        id: "staff-accountant-1",
        title: "Transaction Processing",
        description: "Accurately process and record financial transactions",
        target: "Process 100 transactions daily",
        metric: "Transaction volume and accuracy",
        weight: 35
      },
      {
        id: "staff-accountant-2",
        title: "Reconciliation",
        description: "Complete account reconciliations on schedule",
        target: "Complete all reconciliations by month-end",
        metric: "Reconciliation timeliness",
        weight: 30
      },
      {
        id: "staff-accountant-3",
        title: "Documentation",
        description: "Maintain proper documentation for all accounting activities",
        target: "100% documentation compliance",
        metric: "Documentation completeness",
        weight: 20
      },
      {
        id: "staff-accountant-4",
        title: "Professional Development",
        description: "Continuously improve accounting skills and knowledge",
        target: "40 hours of training annually",
        metric: "Training hours completed",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "individual"
  },
  {
    name: "Team Lead ATM",
    organization: "Patrick Accounting",
    jobTitle: "Team Lead - Accounting and Tax Manager",
    department: "Accounting",
    category: "accounting",
    description: "Leads the accounting and tax team, oversees complex tax matters, and ensures compliance.",
    goals: [
      {
        id: "team-lead-atm-1",
        title: "Team Leadership",
        description: "Lead and develop the accounting and tax team",
        target: "Manage team of 10+ professionals",
        metric: "Team performance and retention",
        weight: 30
      },
      {
        id: "team-lead-atm-2",
        title: "Tax Compliance",
        description: "Ensure all tax filings are accurate and timely",
        target: "100% on-time filing rate",
        metric: "Filing compliance rate",
        weight: 35
      },
      {
        id: "team-lead-atm-3",
        title: "Client Advisory",
        description: "Provide strategic tax planning and advisory services",
        target: "Quarterly tax planning sessions",
        metric: "Client tax savings achieved",
        weight: 25
      },
      {
        id: "team-lead-atm-4",
        title: "Quality Assurance",
        description: "Maintain high quality standards across all deliverables",
        target: "Less than 1% error rate",
        metric: "Quality metrics",
        weight: 10
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "lead"
  },
  {
    name: "Strategic Financial Controller",
    organization: "Patrick Accounting",
    jobTitle: "Strategic Financial Controller",
    department: "Finance",
    category: "finance",
    description: "Oversees financial strategy, manages financial reporting, and provides strategic financial guidance.",
    goals: [
      {
        id: "controller-1",
        title: "Financial Strategy",
        description: "Develop and implement financial strategies aligned with business objectives",
        target: "Annual strategic plan delivery",
        metric: "Strategy implementation success",
        weight: 35
      },
      {
        id: "controller-2",
        title: "Financial Reporting",
        description: "Oversee accurate and timely financial reporting",
        target: "Reports delivered within 5 business days",
        metric: "Reporting timeliness and accuracy",
        weight: 30
      },
      {
        id: "controller-3",
        title: "Budget Management",
        description: "Manage budgeting process and monitor financial performance",
        target: "Variance within 3% of budget",
        metric: "Budget variance analysis",
        weight: 20
      },
      {
        id: "controller-4",
        title: "Risk Management",
        description: "Identify and mitigate financial risks",
        target: "Quarterly risk assessments",
        metric: "Risk mitigation effectiveness",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "manufacturing", "retail"],
    roleLevel: "senior"
  },
  {
    name: "Videographer",
    organization: "Patrick Accounting",
    jobTitle: "Videographer",
    department: "Marketing",
    category: "marketing",
    description: "Creates video content for marketing, training, and client communication purposes.",
    goals: [
      {
        id: "video-1",
        title: "Content Production",
        description: "Produce high-quality video content for various purposes",
        target: "10 videos per month",
        metric: "Videos produced",
        weight: 40
      },
      {
        id: "video-2",
        title: "Creative Development",
        description: "Develop creative concepts for video projects",
        target: "5 new concepts monthly",
        metric: "Concepts approved",
        weight: 25
      },
      {
        id: "video-3",
        title: "Post-Production",
        description: "Edit and finalize video content to professional standards",
        target: "48-hour turnaround time",
        metric: "Production timeline",
        weight: 25
      },
      {
        id: "video-4",
        title: "Equipment Management",
        description: "Maintain and manage video production equipment",
        target: "100% equipment uptime",
        metric: "Equipment availability",
        weight: 10
      }
    ],
    industries: ["technology", "hospitality", "retail", "education"],
    roleLevel: "individual"
  },
  {
    name: "Accounting and Tax Manager",
    organization: "Patrick Accounting",
    jobTitle: "Accounting and Tax Manager",
    department: "Accounting",
    category: "accounting",
    description: "Manages accounting and tax functions, oversees compliance, and provides technical expertise.",
    goals: [
      {
        id: "atm-1",
        title: "Department Management",
        description: "Manage accounting and tax department operations",
        target: "Department efficiency improvement",
        metric: "Operational metrics",
        weight: 30
      },
      {
        id: "atm-2",
        title: "Technical Excellence",
        description: "Provide technical accounting and tax expertise",
        target: "Resolution of complex issues",
        metric: "Technical accuracy rate",
        weight: 35
      },
      {
        id: "atm-3",
        title: "Compliance Management",
        description: "Ensure compliance with all accounting and tax regulations",
        target: "100% compliance rate",
        metric: "Compliance audit results",
        weight: 25
      },
      {
        id: "atm-4",
        title: "Staff Development",
        description: "Develop and mentor accounting and tax staff",
        target: "Annual training plans for all staff",
        metric: "Staff competency improvements",
        weight: 10
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "manager"
  },
  {
    name: "BOSS Coordinator",
    organization: "Patrick Accounting",
    jobTitle: "Business Operations Support Specialist Coordinator",
    department: "Operations",
    category: "operations",
    description: "Coordinates business operations support activities and ensures smooth workflow across departments.",
    goals: [
      {
        id: "boss-1",
        title: "Operations Coordination",
        description: "Coordinate cross-departmental operations and support activities",
        target: "All departments supported",
        metric: "Support ticket resolution rate",
        weight: 35
      },
      {
        id: "boss-2",
        title: "Process Optimization",
        description: "Identify and implement process improvements",
        target: "3 process improvements quarterly",
        metric: "Process efficiency gains",
        weight: 30
      },
      {
        id: "boss-3",
        title: "Vendor Management",
        description: "Manage relationships with vendors and service providers",
        target: "95% vendor satisfaction",
        metric: "Vendor performance metrics",
        weight: 20
      },
      {
        id: "boss-4",
        title: "Documentation Management",
        description: "Maintain operational documentation and procedures",
        target: "All procedures documented",
        metric: "Documentation completeness",
        weight: 15
      }
    ],
    industries: ["all"],
    roleLevel: "mid"
  },
  {
    name: "Digital Marketing Specialist",
    organization: "Patrick Accounting",
    jobTitle: "Digital Marketing Specialist",
    department: "Marketing",
    category: "marketing",
    description: "Executes digital marketing campaigns, manages online presence, and analyzes marketing metrics.",
    goals: [
      {
        id: "digital-marketing-1",
        title: "Digital Campaign Management",
        description: "Plan and execute digital marketing campaigns",
        target: "2 campaigns per month",
        metric: "Campaign performance metrics",
        weight: 35
      },
      {
        id: "digital-marketing-2",
        title: "Social Media Management",
        description: "Manage and grow social media presence",
        target: "30% follower growth annually",
        metric: "Social media engagement rates",
        weight: 30
      },
      {
        id: "digital-marketing-3",
        title: "SEO/SEM Optimization",
        description: "Optimize online content for search engines",
        target: "50% increase in organic traffic",
        metric: "Search rankings and traffic",
        weight: 25
      },
      {
        id: "digital-marketing-4",
        title: "Analytics and Reporting",
        description: "Track and report on digital marketing performance",
        target: "Weekly performance reports",
        metric: "Report accuracy and timeliness",
        weight: 10
      }
    ],
    industries: ["technology", "retail", "hospitality", "professional_services", "education"],
    roleLevel: "mid"
  },
  {
    name: "Director of People Services",
    organization: "Patrick Accounting",
    jobTitle: "Director of People Services",
    department: "HR",
    category: "hr",
    description: "Leads human resources strategy, manages people operations, and drives organizational culture.",
    goals: [
      {
        id: "hr-director-1",
        title: "HR Strategy Development",
        description: "Develop and implement HR strategies aligned with business goals",
        target: "Annual HR strategic plan",
        metric: "Strategy implementation success",
        weight: 35
      },
      {
        id: "hr-director-2",
        title: "Talent Management",
        description: "Oversee talent acquisition, development, and retention",
        target: "90% employee retention rate",
        metric: "Retention and engagement scores",
        weight: 30
      },
      {
        id: "hr-director-3",
        title: "Culture Development",
        description: "Foster positive organizational culture and employee engagement",
        target: "85% engagement score",
        metric: "Employee engagement surveys",
        weight: 20
      },
      {
        id: "hr-director-4",
        title: "Compliance and Policy",
        description: "Ensure HR compliance and maintain updated policies",
        target: "100% compliance rate",
        metric: "Compliance audit results",
        weight: 15
      }
    ],
    industries: ["all"],
    roleLevel: "lead"
  },
  {
    name: "Client Care Coordinator",
    organization: "Patrick Accounting",
    jobTitle: "Client Care Coordinator",
    department: "Client Success",
    category: "client_success",
    description: "Coordinates client service activities, manages client communications, and ensures client satisfaction.",
    goals: [
      {
        id: "client-care-1",
        title: "Client Service Coordination",
        description: "Coordinate all client service activities and requests",
        target: "24-hour response time",
        metric: "Response time metrics",
        weight: 35
      },
      {
        id: "client-care-2",
        title: "Client Communication",
        description: "Maintain proactive communication with clients",
        target: "Weekly client touchpoints",
        metric: "Communication frequency",
        weight: 30
      },
      {
        id: "client-care-3",
        title: "Issue Resolution",
        description: "Resolve client issues quickly and effectively",
        target: "48-hour resolution time",
        metric: "Issue resolution metrics",
        weight: 25
      },
      {
        id: "client-care-4",
        title: "Client Onboarding",
        description: "Manage smooth onboarding for new clients",
        target: "100% onboarding completion",
        metric: "Onboarding success rate",
        weight: 10
      }
    ],
    industries: ["professional_services", "technology"],
    roleLevel: "mid"
  },
  {
    name: "Director of Accounting",
    organization: "Patrick Accounting",
    jobTitle: "Director of Accounting",
    department: "Accounting",
    category: "accounting",
    description: "Leads the accounting department, sets accounting policies, and ensures financial accuracy.",
    goals: [
      {
        id: "accounting-dir-1",
        title: "Department Leadership",
        description: "Lead and manage the accounting department",
        target: "Department performance targets met",
        metric: "Department KPI achievement",
        weight: 35
      },
      {
        id: "accounting-dir-2",
        title: "Financial Integrity",
        description: "Ensure accuracy and integrity of financial information",
        target: "Clean audit opinions",
        metric: "Audit findings",
        weight: 30
      },
      {
        id: "accounting-dir-3",
        title: "Policy Development",
        description: "Develop and maintain accounting policies and procedures",
        target: "Annual policy review and update",
        metric: "Policy compliance rate",
        weight: 20
      },
      {
        id: "accounting-dir-4",
        title: "Stakeholder Management",
        description: "Manage relationships with auditors, regulators, and stakeholders",
        target: "Positive stakeholder feedback",
        metric: "Stakeholder satisfaction",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "lead"
  },
  {
    name: "Director of Tax",
    organization: "Patrick Accounting",
    jobTitle: "Director of Tax",
    department: "Tax",
    category: "tax",
    description: "Leads tax department, oversees tax compliance and planning, and provides strategic tax guidance.",
    goals: [
      {
        id: "tax-dir-1",
        title: "Tax Department Leadership",
        description: "Lead and develop the tax department team",
        target: "High-performing tax team",
        metric: "Team performance metrics",
        weight: 30
      },
      {
        id: "tax-dir-2",
        title: "Tax Strategy",
        description: "Develop and implement tax strategies for clients",
        target: "Maximize client tax savings",
        metric: "Tax savings achieved",
        weight: 35
      },
      {
        id: "tax-dir-3",
        title: "Compliance Oversight",
        description: "Ensure all tax compliance requirements are met",
        target: "100% compliance rate",
        metric: "Compliance metrics",
        weight: 25
      },
      {
        id: "tax-dir-4",
        title: "Technical Excellence",
        description: "Maintain technical tax expertise and knowledge",
        target: "Industry thought leadership",
        metric: "Technical proficiency assessments",
        weight: 10
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "lead"
  },
  {
    name: "Director of Business Development",
    organization: "Patrick Accounting",
    jobTitle: "Director of Business Development",
    department: "Sales",
    category: "sales",
    description: "Leads business development strategy, manages sales team, and drives revenue growth.",
    goals: [
      {
        id: "bd-dir-1",
        title: "Revenue Growth",
        description: "Drive overall revenue growth for the firm",
        target: "25% annual revenue growth",
        metric: "Revenue growth rate",
        weight: 40
      },
      {
        id: "bd-dir-2",
        title: "Sales Team Leadership",
        description: "Build and lead high-performing sales team",
        target: "100% of team quota achievement",
        metric: "Team quota attainment",
        weight: 25
      },
      {
        id: "bd-dir-3",
        title: "Strategic Partnerships",
        description: "Develop strategic partnerships and alliances",
        target: "5 strategic partnerships annually",
        metric: "Partnership value",
        weight: 20
      },
      {
        id: "bd-dir-4",
        title: "Market Expansion",
        description: "Identify and penetrate new markets",
        target: "Enter 2 new markets annually",
        metric: "Market penetration rate",
        weight: 15
      }
    ],
    industries: ["all"],
    roleLevel: "lead"
  },
  {
    name: "Office Manager",
    organization: "Patrick Accounting",
    jobTitle: "Office Manager",
    department: "Operations",
    category: "operations",
    description: "Manages day-to-day office operations, oversees administrative staff, and ensures efficient workplace environment.",
    goals: [
      {
        id: "office-mgr-1",
        title: "Office Operations Management",
        description: "Ensure smooth daily operations of the office",
        target: "98% operational efficiency",
        metric: "Operational efficiency score",
        weight: 35
      },
      {
        id: "office-mgr-2",
        title: "Administrative Team Leadership",
        description: "Lead and coordinate administrative staff",
        target: "Team productivity increase of 15%",
        metric: "Team productivity metrics",
        weight: 25
      },
      {
        id: "office-mgr-3",
        title: "Facilities Management",
        description: "Manage office facilities and vendor relationships",
        target: "Stay within facilities budget",
        metric: "Budget adherence",
        weight: 20
      },
      {
        id: "office-mgr-4",
        title: "Process Improvement",
        description: "Implement office process improvements",
        target: "2 process improvements per quarter",
        metric: "Process efficiency gains",
        weight: 20
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "manager"
  },
  {
    name: "HR Generalist",
    organization: "Patrick Accounting",
    jobTitle: "HR Generalist",
    department: "HR",
    category: "hr",
    description: "Handles day-to-day HR operations, employee relations, and supports HR initiatives across the firm.",
    goals: [
      {
        id: "hr-gen-1",
        title: "Employee Relations",
        description: "Manage employee relations and resolve workplace issues",
        target: "95% issue resolution rate",
        metric: "Resolution effectiveness",
        weight: 30
      },
      {
        id: "hr-gen-2",
        title: "Recruitment Support",
        description: "Support recruitment and onboarding processes",
        target: "Fill positions within 45 days",
        metric: "Time to fill",
        weight: 30
      },
      {
        id: "hr-gen-3",
        title: "HR Administration",
        description: "Manage HR documentation and compliance",
        target: "100% compliance with HR policies",
        metric: "Compliance rate",
        weight: 25
      },
      {
        id: "hr-gen-4",
        title: "Employee Development",
        description: "Support employee training and development programs",
        target: "80% employee participation in training",
        metric: "Training participation rate",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "mid"
  },
  
  // Whirks Templates (9 templates)
  {
    name: "Client Success Specialist",
    organization: "Whirks",
    jobTitle: "Client Success Specialist",
    department: "Client Success",
    category: "client_success",
    description: "Ensures client success through onboarding, training, and ongoing support for HR and payroll services.",
    goals: [
      {
        id: "css-1",
        title: "Client Onboarding",
        description: "Successfully onboard new clients to the platform",
        target: "Complete onboarding within 30 days",
        metric: "Onboarding completion time",
        weight: 35
      },
      {
        id: "css-2",
        title: "Client Retention",
        description: "Maintain high client retention through excellent service",
        target: "95% client retention rate",
        metric: "Retention percentage",
        weight: 30
      },
      {
        id: "css-3",
        title: "Support Response",
        description: "Provide timely and effective client support",
        target: "4-hour response time",
        metric: "Average response time",
        weight: 25
      },
      {
        id: "css-4",
        title: "Client Training",
        description: "Conduct client training sessions on platform features",
        target: "2 training sessions per client quarterly",
        metric: "Training sessions delivered",
        weight: 10
      }
    ],
    industries: ["professional_services", "technology", "healthcare"],
    roleLevel: "mid"
  },
  {
    name: "Client Success Expert",
    organization: "Whirks",
    jobTitle: "Client Success Expert",
    department: "Client Success",
    category: "client_success",
    description: "Senior client success role handling complex client needs and strategic account management.",
    goals: [
      {
        id: "cse-1",
        title: "Strategic Account Management",
        description: "Manage key strategic accounts and ensure their success",
        target: "100% strategic account retention",
        metric: "Strategic account health score",
        weight: 40
      },
      {
        id: "cse-2",
        title: "Upselling and Expansion",
        description: "Identify and execute upselling opportunities",
        target: "$100,000 in expansion revenue",
        metric: "Expansion revenue generated",
        weight: 30
      },
      {
        id: "cse-3",
        title: "Client Advocacy",
        description: "Develop client advocates and success stories",
        target: "5 case studies annually",
        metric: "Client success stories published",
        weight: 20
      },
      {
        id: "cse-4",
        title: "Process Improvement",
        description: "Improve client success processes and documentation",
        target: "2 process improvements quarterly",
        metric: "Process efficiency gains",
        weight: 10
      }
    ],
    industries: ["professional_services", "technology"],
    roleLevel: "senior"
  },
  {
    name: "Client Success Manager",
    organization: "Whirks",
    jobTitle: "Client Success Manager",
    department: "Client Success",
    category: "client_success",
    description: "Manages client success team and drives client satisfaction strategies.",
    goals: [
      {
        id: "csm-1",
        title: "Team Management",
        description: "Lead and develop the client success team",
        target: "Team NPS score of 80+",
        metric: "Team performance metrics",
        weight: 35
      },
      {
        id: "csm-2",
        title: "Client Satisfaction",
        description: "Maintain high levels of client satisfaction",
        target: "90% CSAT score",
        metric: "Client satisfaction scores",
        weight: 35
      },
      {
        id: "csm-3",
        title: "Churn Reduction",
        description: "Minimize client churn through proactive management",
        target: "Less than 5% annual churn",
        metric: "Churn rate",
        weight: 20
      },
      {
        id: "csm-4",
        title: "Revenue Growth",
        description: "Drive revenue growth through client success initiatives",
        target: "20% increase in client lifetime value",
        metric: "Client lifetime value",
        weight: 10
      }
    ],
    industries: ["professional_services", "technology"],
    roleLevel: "manager"
  },
  {
    name: "Director of Benefit Services",
    organization: "Whirks",
    jobTitle: "Director of Benefit Services",
    department: "Benefits",
    category: "benefits",
    description: "Leads benefits administration services, manages compliance, and develops benefit strategies.",
    goals: [
      {
        id: "benefits-dir-1",
        title: "Benefits Program Management",
        description: "Oversee comprehensive benefits programs for clients",
        target: "100% compliance rate",
        metric: "Compliance audit results",
        weight: 35
      },
      {
        id: "benefits-dir-2",
        title: "Strategic Benefits Consulting",
        description: "Provide strategic benefits consulting to clients",
        target: "Quarterly benefits reviews",
        metric: "Client consultation frequency",
        weight: 30
      },
      {
        id: "benefits-dir-3",
        title: "Cost Management",
        description: "Help clients optimize benefits costs",
        target: "10% cost savings for clients",
        metric: "Cost savings achieved",
        weight: 20
      },
      {
        id: "benefits-dir-4",
        title: "Innovation",
        description: "Introduce innovative benefits solutions",
        target: "2 new benefit offerings annually",
        metric: "New offerings launched",
        weight: 15
      }
    ],
    industries: ["healthcare", "professional_services"],
    roleLevel: "lead"
  },
  {
    name: "Payroll Tax Specialist",
    organization: "Whirks",
    jobTitle: "Payroll Tax Specialist",
    department: "Payroll",
    category: "payroll",
    description: "Manages payroll tax compliance, filings, and resolves tax-related issues.",
    goals: [
      {
        id: "payroll-tax-1",
        title: "Tax Compliance",
        description: "Ensure 100% payroll tax compliance for all clients",
        target: "Zero tax penalties",
        metric: "Compliance rate",
        weight: 40
      },
      {
        id: "payroll-tax-2",
        title: "Tax Filing Accuracy",
        description: "Complete all tax filings accurately and on time",
        target: "100% on-time filing rate",
        metric: "Filing timeliness",
        weight: 35
      },
      {
        id: "payroll-tax-3",
        title: "Issue Resolution",
        description: "Resolve payroll tax notices and issues",
        target: "Resolution within 48 hours",
        metric: "Resolution time",
        weight: 15
      },
      {
        id: "payroll-tax-4",
        title: "Client Education",
        description: "Educate clients on payroll tax requirements",
        target: "Monthly tax updates to clients",
        metric: "Education sessions delivered",
        weight: 10
      }
    ],
    industries: ["all"],
    roleLevel: "mid"
  },
  {
    name: "People Services Manager",
    organization: "Whirks",
    jobTitle: "People Services Manager",
    department: "HR",
    category: "hr",
    description: "Manages HR services delivery, oversees HR operations, and ensures service excellence.",
    goals: [
      {
        id: "ps-mgr-1",
        title: "HR Service Delivery",
        description: "Ensure excellent HR service delivery to clients",
        target: "95% service satisfaction",
        metric: "Service satisfaction scores",
        weight: 35
      },
      {
        id: "ps-mgr-2",
        title: "Operational Excellence",
        description: "Maintain efficient HR operations",
        target: "20% efficiency improvement",
        metric: "Operational efficiency metrics",
        weight: 30
      },
      {
        id: "ps-mgr-3",
        title: "Compliance Management",
        description: "Ensure HR compliance for all clients",
        target: "100% compliance rate",
        metric: "HR compliance audits",
        weight: 25
      },
      {
        id: "ps-mgr-4",
        title: "Team Development",
        description: "Develop and manage the people services team",
        target: "90% team engagement score",
        metric: "Team engagement metrics",
        weight: 10
      }
    ],
    industries: ["all"],
    roleLevel: "manager"
  },
  {
    name: "Implementation Specialist",
    organization: "Whirks",
    jobTitle: "Implementation Specialist",
    department: "Implementation",
    category: "implementation",
    description: "Implements HR and payroll systems for new clients, ensures smooth transitions.",
    goals: [
      {
        id: "impl-1",
        title: "System Implementation",
        description: "Successfully implement systems for new clients",
        target: "30-day implementation timeline",
        metric: "Implementation time",
        weight: 40
      },
      {
        id: "impl-2",
        title: "Data Migration",
        description: "Ensure accurate data migration",
        target: "100% data accuracy",
        metric: "Data accuracy rate",
        weight: 30
      },
      {
        id: "impl-3",
        title: "Client Training",
        description: "Train clients on new systems",
        target: "100% user adoption",
        metric: "User adoption rate",
        weight: 20
      },
      {
        id: "impl-4",
        title: "Documentation",
        description: "Create comprehensive implementation documentation",
        target: "Complete documentation for all projects",
        metric: "Documentation completeness",
        weight: 10
      }
    ],
    industries: ["technology", "professional_services"],
    roleLevel: "mid"
  },
  {
    name: "Sales & Business Development Rep - Whirks",
    organization: "Whirks",
    jobTitle: "Sales & Business Development Rep",
    department: "Sales",
    category: "sales",
    description: "Drives new business for HR and payroll services, develops client relationships.",
    goals: [
      {
        id: "whirks-sales-1",
        title: "New Business Development",
        description: "Acquire new clients for HR/payroll services",
        target: "8 new clients per quarter",
        metric: "New clients acquired",
        weight: 40
      },
      {
        id: "whirks-sales-2",
        title: "Revenue Generation",
        description: "Meet revenue targets through new business",
        target: "$750,000 annual revenue",
        metric: "Revenue generated",
        weight: 35
      },
      {
        id: "whirks-sales-3",
        title: "Pipeline Management",
        description: "Maintain robust sales pipeline",
        target: "50 qualified leads in pipeline",
        metric: "Pipeline value",
        weight: 15
      },
      {
        id: "whirks-sales-4",
        title: "Market Development",
        description: "Develop new market segments",
        target: "2 new verticals annually",
        metric: "Market penetration",
        weight: 10
      }
    ],
    industries: ["all"],
    roleLevel: "individual"
  },
  {
    name: "Director of Operations",
    organization: "Whirks",
    jobTitle: "Director of Operations",
    department: "Operations",
    category: "operations",
    description: "Oversees all operational aspects of HR and payroll service delivery.",
    goals: [
      {
        id: "ops-dir-1",
        title: "Operational Excellence",
        description: "Drive operational excellence across all service lines",
        target: "99% service uptime",
        metric: "Service availability metrics",
        weight: 35
      },
      {
        id: "ops-dir-2",
        title: "Process Optimization",
        description: "Continuously optimize operational processes",
        target: "30% efficiency improvement",
        metric: "Process efficiency metrics",
        weight: 30
      },
      {
        id: "ops-dir-3",
        title: "Quality Assurance",
        description: "Maintain highest quality standards",
        target: "Less than 1% error rate",
        metric: "Quality metrics",
        weight: 20
      },
      {
        id: "ops-dir-4",
        title: "Scalability",
        description: "Ensure operations can scale with growth",
        target: "Support 50% growth without additional headcount",
        metric: "Scalability metrics",
        weight: 15
      }
    ],
    industries: ["all"],
    roleLevel: "lead"
  },
  // Additional Accounting Firm Templates - Primary Target Market
  {
    name: "Tax Senior",
    organization: "Patrick Accounting",
    jobTitle: "Tax Senior",
    department: "Tax",
    category: "finance",
    description: "Leads tax preparation and planning for complex client accounts, mentors junior staff, and ensures compliance with tax regulations.",
    goals: [
      {
        id: "tax-senior-1",
        title: "Tax Return Preparation & Review",
        description: "Prepare and review complex tax returns for individuals, corporations, and partnerships",
        target: "Complete 120 returns per tax season with 98% accuracy",
        metric: "Number of returns completed and accuracy rate",
        weight: 35
      },
      {
        id: "tax-senior-2",
        title: "Tax Planning & Advisory",
        description: "Provide proactive tax planning strategies to minimize client tax liabilities",
        target: "Identify $500K+ in tax savings opportunities annually",
        metric: "Tax savings identified and implemented",
        weight: 30
      },
      {
        id: "tax-senior-3",
        title: "Staff Development & Training",
        description: "Mentor and develop junior tax staff on complex tax issues",
        target: "Train 3 junior staff members quarterly on advanced topics",
        metric: "Training sessions conducted and staff competency improvements",
        weight: 20
      },
      {
        id: "tax-senior-4",
        title: "Regulatory Compliance",
        description: "Stay current with tax law changes and ensure firm compliance",
        target: "100% compliance with filing deadlines and regulations",
        metric: "Compliance rate and regulatory updates implemented",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "senior"
  },
  {
    name: "Bookkeeping Manager",
    organization: "Patrick Accounting",
    jobTitle: "Bookkeeping Manager",
    department: "Bookkeeping",
    category: "finance",
    description: "Manages bookkeeping services for multiple clients, oversees bookkeeping team, and ensures accurate financial record maintenance.",
    goals: [
      {
        id: "bookkeeping-mgr-1",
        title: "Client Portfolio Management",
        description: "Manage bookkeeping services for portfolio of 25-30 clients",
        target: "Maintain 95% client retention with timely deliverables",
        metric: "Client retention rate and on-time delivery",
        weight: 35
      },
      {
        id: "bookkeeping-mgr-2",
        title: "Financial Accuracy & Reconciliation",
        description: "Ensure accurate recording and reconciliation of all client transactions",
        target: "Achieve 99.5% accuracy in monthly reconciliations",
        metric: "Reconciliation accuracy and error rates",
        weight: 30
      },
      {
        id: "bookkeeping-mgr-3",
        title: "Team Leadership",
        description: "Lead and develop team of bookkeeping specialists",
        target: "Manage team of 5-7 bookkeepers with 90% satisfaction score",
        metric: "Team performance and satisfaction metrics",
        weight: 20
      },
      {
        id: "bookkeeping-mgr-4",
        title: "Process Improvement",
        description: "Implement efficient bookkeeping processes and technology solutions",
        target: "Reduce processing time by 25% through automation",
        metric: "Process efficiency gains and automation adoption",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "manager"
  },
  {
    name: "Audit Senior",
    organization: "Patrick Accounting",
    jobTitle: "Audit Senior",
    department: "Audit",
    category: "finance",
    description: "Leads audit engagements, performs risk assessments, and ensures compliance with auditing standards.",
    goals: [
      {
        id: "audit-senior-1",
        title: "Audit Engagement Leadership",
        description: "Lead multiple audit engagements from planning to completion",
        target: "Complete 8-10 audit engagements annually within budget",
        metric: "Engagements completed on time and within budget",
        weight: 35
      },
      {
        id: "audit-senior-2",
        title: "Risk Assessment & Testing",
        description: "Perform comprehensive risk assessments and design testing procedures",
        target: "Identify 100% of material risks and control deficiencies",
        metric: "Risk identification rate and testing effectiveness",
        weight: 30
      },
      {
        id: "audit-senior-3",
        title: "Client Relationship Management",
        description: "Build strong relationships with client management and audit committees",
        target: "Achieve 95% client satisfaction score",
        metric: "Client satisfaction ratings and feedback",
        weight: 20
      },
      {
        id: "audit-senior-4",
        title: "Quality Assurance",
        description: "Ensure audit quality and compliance with professional standards",
        target: "Pass all internal and external quality reviews",
        metric: "Quality review scores and compliance rates",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "senior"
  },
  {
    name: "Controller",
    organization: "Patrick Accounting",
    jobTitle: "Controller",
    department: "Finance",
    category: "finance",
    description: "Oversees financial reporting, internal controls, and accounting operations for multiple client organizations.",
    goals: [
      {
        id: "controller-1",
        title: "Financial Reporting Excellence",
        description: "Ensure accurate and timely financial reporting for all clients",
        target: "Deliver 100% of financial statements within 5 business days",
        metric: "Reporting timeliness and accuracy",
        weight: 35
      },
      {
        id: "controller-2",
        title: "Internal Controls & Compliance",
        description: "Design and maintain robust internal control systems",
        target: "Zero material weaknesses in control assessments",
        metric: "Control effectiveness and audit findings",
        weight: 30
      },
      {
        id: "controller-3",
        title: "Strategic Financial Analysis",
        description: "Provide strategic financial insights and recommendations",
        target: "Deliver monthly KPI dashboards with actionable insights",
        metric: "Value of insights and recommendations implemented",
        weight: 20
      },
      {
        id: "controller-4",
        title: "Cash Flow Management",
        description: "Optimize cash flow and working capital for clients",
        target: "Improve client cash positions by 20%",
        metric: "Cash flow improvements and forecasting accuracy",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "lead"
  },
  {
    name: "Tax Preparer",
    organization: "Patrick Accounting",
    jobTitle: "Tax Preparer",
    department: "Tax",
    category: "finance",
    description: "Prepares individual and business tax returns, assists with tax research, and supports senior tax professionals.",
    goals: [
      {
        id: "tax-prep-1",
        title: "Tax Return Preparation",
        description: "Accurately prepare individual and simple business tax returns",
        target: "Complete 80 returns per tax season with 96% accuracy",
        metric: "Number of returns completed and error rate",
        weight: 40
      },
      {
        id: "tax-prep-2",
        title: "Client Data Management",
        description: "Organize and maintain client tax documents and information",
        target: "100% of client files organized and accessible",
        metric: "File organization and data accuracy",
        weight: 25
      },
      {
        id: "tax-prep-3",
        title: "Tax Software Proficiency",
        description: "Master tax preparation software and stay current with updates",
        target: "Achieve advanced certification in tax software",
        metric: "Software proficiency and certification status",
        weight: 20
      },
      {
        id: "tax-prep-4",
        title: "Client Communication",
        description: "Respond to client inquiries and gather necessary information",
        target: "Respond to all client requests within 24 hours",
        metric: "Response time and client satisfaction",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "individual"
  },
  {
    name: "Bookkeeping Specialist",
    organization: "Patrick Accounting",
    jobTitle: "Bookkeeping Specialist",
    department: "Bookkeeping",
    category: "finance",
    description: "Maintains accurate financial records, processes transactions, and supports monthly close procedures for assigned clients.",
    goals: [
      {
        id: "bookkeep-spec-1",
        title: "Transaction Processing",
        description: "Accurately record and categorize all client transactions",
        target: "Process 1000+ transactions monthly with 99% accuracy",
        metric: "Transaction volume and accuracy rate",
        weight: 35
      },
      {
        id: "bookkeep-spec-2",
        title: "Account Reconciliation",
        description: "Complete monthly bank and credit card reconciliations",
        target: "Reconcile all accounts within 3 days of month-end",
        metric: "Reconciliation timeliness and accuracy",
        weight: 30
      },
      {
        id: "bookkeep-spec-3",
        title: "Financial Report Preparation",
        description: "Prepare accurate monthly financial reports for clients",
        target: "Deliver reports by the 10th of each month",
        metric: "Report delivery and quality metrics",
        weight: 20
      },
      {
        id: "bookkeep-spec-4",
        title: "Client Support",
        description: "Provide responsive support for client bookkeeping questions",
        target: "Maintain 95% client satisfaction rating",
        metric: "Client satisfaction and response times",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "individual"
  },
  {
    name: "Payroll Manager",
    organization: "Patrick Accounting",
    jobTitle: "Payroll Manager",
    department: "Payroll",
    category: "operations",
    description: "Manages payroll processing for multiple clients, ensures compliance with payroll regulations, and leads payroll team.",
    goals: [
      {
        id: "payroll-mgr-1",
        title: "Payroll Processing Excellence",
        description: "Ensure accurate and timely payroll processing for all clients",
        target: "100% on-time payroll with zero critical errors",
        metric: "Payroll accuracy and timeliness",
        weight: 40
      },
      {
        id: "payroll-mgr-2",
        title: "Compliance Management",
        description: "Maintain compliance with federal, state, and local payroll regulations",
        target: "Zero compliance violations or penalties",
        metric: "Compliance audit results and penalty avoidance",
        weight: 30
      },
      {
        id: "payroll-mgr-3",
        title: "Tax Filing & Reporting",
        description: "Ensure accurate and timely payroll tax filings and reporting",
        target: "100% of tax filings completed before deadlines",
        metric: "Tax filing timeliness and accuracy",
        weight: 20
      },
      {
        id: "payroll-mgr-4",
        title: "Client Onboarding",
        description: "Successfully onboard new payroll clients",
        target: "Onboard 2-3 new clients monthly with smooth transition",
        metric: "Client onboarding success rate",
        weight: 10
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "manager"
  },
  {
    name: "Client Onboarding Specialist",
    organization: "Patrick Accounting",
    jobTitle: "Client Onboarding Specialist",
    department: "Client Services",
    category: "client_success",
    description: "Manages the onboarding process for new accounting clients, ensuring smooth transition and setup of services.",
    goals: [
      {
        id: "onboard-spec-1",
        title: "New Client Onboarding",
        description: "Successfully onboard new clients to firm services",
        target: "Complete 15-20 client onboardings monthly",
        metric: "Number of successful onboardings completed",
        weight: 35
      },
      {
        id: "onboard-spec-2",
        title: "Documentation & Setup",
        description: "Gather and organize all necessary client documentation",
        target: "100% completion of onboarding checklists within 5 days",
        metric: "Documentation completeness and setup time",
        weight: 30
      },
      {
        id: "onboard-spec-3",
        title: "System Integration",
        description: "Set up clients in all necessary systems and software",
        target: "Complete system setup within 48 hours of documentation receipt",
        metric: "System setup speed and accuracy",
        weight: 20
      },
      {
        id: "onboard-spec-4",
        title: "Client Training",
        description: "Train clients on firm processes and portal usage",
        target: "95% of clients proficient in portal use after training",
        metric: "Client training effectiveness and adoption rates",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "individual"
  },
  {
    name: "Practice Manager",
    organization: "Patrick Accounting",
    jobTitle: "Practice Manager",
    department: "Operations",
    category: "operations",
    description: "Manages day-to-day operations of the accounting practice, coordinates between departments, and ensures service quality.",
    goals: [
      {
        id: "practice-mgr-1",
        title: "Practice Operations",
        description: "Oversee smooth daily operations across all service lines",
        target: "Maintain 98% operational efficiency score",
        metric: "Operational efficiency and service delivery metrics",
        weight: 35
      },
      {
        id: "practice-mgr-2",
        title: "Resource Management",
        description: "Optimize staff allocation and workload distribution",
        target: "Achieve 85% staff utilization with balanced workloads",
        metric: "Staff utilization and workload balance",
        weight: 30
      },
      {
        id: "practice-mgr-3",
        title: "Quality Control",
        description: "Implement and monitor quality control procedures",
        target: "Maintain less than 2% rework rate across all services",
        metric: "Quality metrics and rework rates",
        weight: 20
      },
      {
        id: "practice-mgr-4",
        title: "Technology Implementation",
        description: "Lead adoption of new technologies and process improvements",
        target: "Implement 3 major process improvements annually",
        metric: "Technology adoption and efficiency gains",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "manager"
  },
  {
    name: "CFO Services Director",
    organization: "Patrick Accounting",
    jobTitle: "CFO Services Director",
    department: "Advisory",
    category: "finance",
    description: "Provides outsourced CFO services to clients, offering strategic financial guidance and executive-level insights.",
    goals: [
      {
        id: "cfo-dir-1",
        title: "Strategic Financial Advisory",
        description: "Provide CFO-level strategic guidance to client businesses",
        target: "Support 8-10 clients with monthly strategic sessions",
        metric: "Client engagement and value delivered",
        weight: 35
      },
      {
        id: "cfo-dir-2",
        title: "Financial Planning & Analysis",
        description: "Develop comprehensive financial plans and forecasts",
        target: "Deliver quarterly forecasts with 90% accuracy",
        metric: "Forecast accuracy and planning effectiveness",
        weight: 30
      },
      {
        id: "cfo-dir-3",
        title: "Business Growth Support",
        description: "Guide clients through growth initiatives and funding",
        target: "Help secure $5M+ in funding for clients annually",
        metric: "Funding secured and growth metrics",
        weight: 20
      },
      {
        id: "cfo-dir-4",
        title: "Performance Improvement",
        description: "Identify and implement performance improvements",
        target: "Achieve 20% average improvement in client profitability",
        metric: "Client performance improvements",
        weight: 15
      }
    ],
    industries: ["accounting", "finance", "professional_services"],
    roleLevel: "lead"
  }
];

// Helper function to get templates by organization
export function getTemplatesByOrganization(org: "Patrick Accounting" | "Whirks" | "all" = "all"): DefaultKraTemplate[] {
  if (org === "all") {
    return DEFAULT_KRA_TEMPLATES;
  }
  return DEFAULT_KRA_TEMPLATES.filter(t => t.organization === org);
}

// Helper function to get templates by category
export function getTemplatesByCategory(category: string): DefaultKraTemplate[] {
  return DEFAULT_KRA_TEMPLATES.filter(t => t.category === category);
}

// Helper function to get templates by department
export function getTemplatesByDepartment(department: string): DefaultKraTemplate[] {
  return DEFAULT_KRA_TEMPLATES.filter(t => t.department.toLowerCase() === department.toLowerCase());
}

// Helper function to get unique departments
export function getUniqueDepartments(): string[] {
  const departments = new Set(DEFAULT_KRA_TEMPLATES.map(t => t.department));
  return Array.from(departments).sort();
}

// Helper function to get unique categories
export function getUniqueCategories(): string[] {
  const categories = new Set(DEFAULT_KRA_TEMPLATES.map(t => t.category));
  return Array.from(categories).sort();
}

// Helper function to convert default template to database format
export function convertToDbFormat(template: DefaultKraTemplate, organizationId: string) {
  return {
    organizationId,
    name: `${template.jobTitle} - ${template.organization}`,
    description: template.description,
    category: template.category,
    goals: JSON.stringify(template.goals),
    isActive: true,
    createdBy: "system",
    jobTitle: template.jobTitle,
    industries: template.industries?.join(',') || '',
    isGlobal: false
  };
}