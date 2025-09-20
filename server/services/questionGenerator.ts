import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface GeneratedQuestion {
  text: string;
  category: string;
  description?: string;
}

interface QuestionGenerationOptions {
  count: number;
  theme: string;
  teamFocus?: string;
  previousQuestions?: string[];
}

export class QuestionGenerator {
  async generateQuestions(options: QuestionGenerationOptions): Promise<GeneratedQuestion[]> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured");
    }

    const { count, theme, teamFocus, previousQuestions = [] } = options;

    // Build the prompt based on the options
    let prompt = `Generate ${count} thoughtful check-in questions for a team management application. The questions should be:

1. Focused on: ${theme}
2. Suitable for weekly team check-ins
3. Encouraging honest feedback and reflection
4. Professional but approachable in tone
5. Diverse in perspective and scope`;

    if (teamFocus) {
      prompt += `\n6. Specifically relevant for ${teamFocus} teams or roles`;
    }

    if (previousQuestions.length > 0) {
      prompt += `\n\nAvoid generating questions too similar to these existing ones:\n${previousQuestions.map(q => `- ${q}`).join('\n')}`;
    }

    prompt += `\n\nRespond with JSON in this exact format:
{
  "questions": [
    {
      "text": "Question text here",
      "category": "mood-wellness|productivity|goals|feedback|team-dynamics|growth",
      "description": "Brief explanation of what this question aims to discover"
    }
  ]
}

Categories should be one of: mood-wellness, productivity, goals, feedback, team-dynamics, growth

Generate varied questions that encourage reflection on different aspects of work and well-being.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are an expert in team management and employee engagement. You specialize in creating insightful check-in questions that promote psychological safety and meaningful feedback."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content || '{"questions": []}');
      
      if (!result.questions || !Array.isArray(result.questions)) {
        throw new Error("Invalid response format from AI");
      }

      return result.questions.slice(0, count); // Ensure we don't exceed requested count
    } catch (error) {
      console.error("Question generation error:", error);
      throw new Error(`Failed to generate questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async suggestQuestionImprovements(questionText: string): Promise<string> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured");
    }

    const prompt = `Analyze this check-in question and suggest improvements to make it more effective for team management:

Question: "${questionText}"

Consider:
1. Clarity and understandability
2. Psychological safety (does it encourage honest responses?)
3. Actionability (can managers act on the responses?)
4. Engagement (is it interesting to answer?)
5. Specificity (is it focused enough to provide useful insights?)

Provide a brief analysis and 2-3 specific improvement suggestions.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are an expert in organizational psychology and team management. Provide constructive feedback on check-in questions."
          },
          {
            role: "user",
            content: prompt
          }
        ],
      });

      return response.choices[0].message.content || "Unable to generate suggestions";
    } catch (error) {
      console.error("Question improvement error:", error);
      throw new Error(`Failed to analyze question: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const questionGenerator = new QuestionGenerator();