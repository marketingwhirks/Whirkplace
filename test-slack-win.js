#!/usr/bin/env node

// Script to test Slack win notification functionality
const fetch = require('node-fetch');

// Configuration
const BASE_URL = 'http://0.0.0.0:5000';
const PATRICK_ACCOUNTING_ID = 'patrick-accounting-prod-id';

// Test credentials - adjust as needed
const TEST_CREDENTIALS = {
  username: 'mpatrick@whirks.com',
  password: 'SuperAdmin2025!',
  orgId: PATRICK_ACCOUNTING_ID
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

let cookies = '';

async function login() {
  console.log(colors.cyan + '\n📝 Logging in...' + colors.reset);
  
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: TEST_CREDENTIALS.username,
        password: TEST_CREDENTIALS.password,
        organizationId: TEST_CREDENTIALS.orgId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Login failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    
    // Extract cookies from response headers
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');
    }

    console.log(colors.green + '✅ Login successful!' + colors.reset);
    console.log(`   User: ${data.user.name} (${data.user.email})`);
    console.log(`   Organization: ${data.organization.name}`);
    return data;
  } catch (error) {
    console.error(colors.red + '❌ Login failed:' + colors.reset, error.message);
    throw error;
  }
}

async function testSlackConnection() {
  console.log(colors.cyan + '\n🧪 Testing Slack connection...' + colors.reset);
  
  try {
    const response = await fetch(`${BASE_URL}/api/slack/test-connection`, {
      method: 'GET',
      headers: {
        'Cookie': cookies,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Connection test failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    
    console.log(colors.green + '📡 Slack Connection Test Results:' + colors.reset);
    console.log(`   Success: ${data.success ? '✅' : '❌'}`);
    
    if (data.details?.authTest) {
      console.log(`   Bot User: ${data.details.authTest.user || 'N/A'}`);
      console.log(`   Team: ${data.details.authTest.team || 'N/A'}`);
      console.log(`   Bot ID: ${data.details.authTest.bot_id || 'N/A'}`);
    }
    
    if (data.details?.channelInfo) {
      console.log(`   Channel: ${data.details.channelInfo.name || data.details.channelInfo.id || 'N/A'}`);
      console.log(`   Bot is member: ${data.details.channelInfo.is_member ? '✅' : '❌'}`);
      
      if (data.details.channelInfo.error) {
        console.log(colors.yellow + `   Channel error: ${data.details.channelInfo.error}` + colors.reset);
      }
    }
    
    if (data.organization) {
      console.log(colors.blue + '\n📋 Organization Configuration:' + colors.reset);
      console.log(`   Slack Integration Enabled: ${data.organization.enable_slack_integration ? '✅' : '❌'}`);
      console.log(`   Wins Channel ID: ${data.organization.slack_wins_channel_id || 'Not configured'}`);
      console.log(`   General Channel ID: ${data.organization.slack_channel_id || 'Not configured'}`);
      console.log(`   Bot Token Configured: ${data.organization.has_bot_token ? '✅' : '❌'}`);
    }
    
    if (!data.success && data.error) {
      console.log(colors.red + `\n❌ Error: ${data.error}` + colors.reset);
    }
    
    return data;
  } catch (error) {
    console.error(colors.red + '❌ Connection test failed:' + colors.reset, error.message);
    return { success: false, error: error.message };
  }
}

async function createPublicWin() {
  console.log(colors.cyan + '\n🏆 Creating a public win...' + colors.reset);
  
  const winData = {
    title: `Test Win - ${new Date().toISOString()}`,
    description: 'This is a test public win to verify Slack notification functionality.',
    isPublic: true,
    category: 'Achievement'
  };
  
  try {
    const response = await fetch(`${BASE_URL}/api/wins`, {
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(winData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create win: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    
    console.log(colors.green + '✅ Public win created successfully!' + colors.reset);
    console.log(`   ID: ${data.id}`);
    console.log(`   Title: ${data.title}`);
    console.log(`   Public: ${data.isPublic ? '✅' : '❌'}`);
    console.log(`   Slack Message ID: ${data.slackMessageId || 'Not sent'}`);
    
    return data;
  } catch (error) {
    console.error(colors.red + '❌ Failed to create win:' + colors.reset, error.message);
    throw error;
  }
}

async function checkLogs() {
  console.log(colors.cyan + '\n📋 Checking server logs for Slack activity...' + colors.reset);
  console.log(colors.yellow + '   (Check the server console for detailed logs)' + colors.reset);
  
  // Note: In a real scenario, you might want to tail the logs or use a logging service
  console.log(`   Look for:`);
  console.log(`   - 🎯 announceWin called with:`);
  console.log(`   - 📬 sendSlackMessage called with:`);
  console.log(`   - ❌ Error announcing win to Slack channel:`);
  console.log(`   - ✅ Public win announced to channel`);
}

async function main() {
  console.log(colors.bright + colors.blue + '\n====================================');
  console.log('   SLACK WIN NOTIFICATION TEST');
  console.log('====================================' + colors.reset);
  
  try {
    // Step 1: Login
    await login();
    
    // Step 2: Test Slack connection
    const connectionTest = await testSlackConnection();
    
    // Step 3: Create a public win
    const win = await createPublicWin();
    
    // Step 4: Check logs
    await checkLogs();
    
    // Summary
    console.log(colors.bright + colors.blue + '\n====================================');
    console.log('   TEST COMPLETE');
    console.log('====================================' + colors.reset);
    
    if (win.slackMessageId) {
      console.log(colors.green + '✅ Slack notification was sent!' + colors.reset);
      console.log(`   Message ID: ${win.slackMessageId}`);
    } else {
      console.log(colors.yellow + '⚠️ Slack notification was not sent.' + colors.reset);
      console.log('   Check the server logs for details.');
      
      // Provide troubleshooting tips
      if (!connectionTest.success) {
        console.log(colors.red + '\n🔧 Troubleshooting: Slack connection test failed' + colors.reset);
      }
      if (connectionTest.organization && !connectionTest.organization.enable_slack_integration) {
        console.log(colors.red + '\n🔧 Troubleshooting: Slack integration is disabled for the organization' + colors.reset);
      }
      if (connectionTest.organization && !connectionTest.organization.slack_wins_channel_id) {
        console.log(colors.red + '\n🔧 Troubleshooting: No wins channel ID configured' + colors.reset);
      }
    }
    
  } catch (error) {
    console.error(colors.red + '\n❌ Test failed:' + colors.reset, error.message);
    process.exit(1);
  }
}

// Run the test
main().catch(error => {
  console.error(colors.red + '\n❌ Unexpected error:' + colors.reset, error);
  process.exit(1);
});