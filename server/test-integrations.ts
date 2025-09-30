import { WebClient } from '@slack/web-api';
import OpenAI from 'openai';
import { ConfidentialClientApplication } from '@azure/msal-node';

// Test Slack integration
export async function testSlackIntegration() {
  try {
    const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    
    // Test: Verify bot token works
    const authTest = await slack.auth.test();
    
    // Test: Send a test message
    const result = await slack.chat.postMessage({
      channel: process.env.SLACK_CHANNEL_ID!,
      text: `🧪 Slack Integration Test - ${new Date().toISOString()}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '✅ *Slack Integration Test Successful*\n\nBot Name: ' + authTest.user + '\nWorkspace: ' + authTest.team
          }
        }
      ]
    });
    
    return {
      success: true,
      botName: authTest.user,
      workspace: authTest.team,
      messageTimestamp: result.ts
    };
  } catch (error: any) {
    console.error('Slack test failed:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

// Test Microsoft 365 SSO
export async function testMicrosoftIntegration() {
  try {
    const msalConfig = {
      auth: {
        clientId: process.env.MICROSOFT_CLIENT_ID!,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
        authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}`
      }
    };
    
    const cca = new ConfidentialClientApplication(msalConfig);
    
    // Test: Verify client credentials are valid by attempting to get a token
    const tokenRequest = {
      scopes: ['https://graph.microsoft.com/.default'],
      skipCache: true
    };
    
    const response = await cca.acquireTokenByClientCredential(tokenRequest);
    
    return {
      success: true,
      clientId: process.env.MICROSOFT_CLIENT_ID,
      authority: msalConfig.auth.authority,
      tokenAcquired: !!response?.accessToken
    };
  } catch (error: any) {
    console.error('Microsoft test failed:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
      clientId: process.env.MICROSOFT_CLIENT_ID ? 'Configured' : 'Not configured'
    };
  }
}

// Test OpenAI integration
export async function testOpenAIIntegration() {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Test: Simple completion request
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a test bot. Reply with exactly: "OpenAI integration working!"'
        },
        {
          role: 'user',
          content: 'Test message'
        }
      ],
      max_tokens: 10,
      temperature: 0
    });
    
    return {
      success: true,
      model: response.model,
      response: response.choices[0]?.message?.content,
      usage: response.usage
    };
  } catch (error: any) {
    console.error('OpenAI test failed:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
      apiKeyConfigured: !!process.env.OPENAI_API_KEY
    };
  }
}

// Combined test all integrations
export async function testAllIntegrations() {
  const results = await Promise.all([
    testSlackIntegration(),
    testMicrosoftIntegration(), 
    testOpenAIIntegration()
  ]);
  
  return {
    slack: results[0],
    microsoft: results[1],
    openai: results[2],
    timestamp: new Date().toISOString()
  };
}