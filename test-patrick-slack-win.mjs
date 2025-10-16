#!/usr/bin/env node

// Script to test Slack win notification for Patrick Accounting organization
import fetch from 'node-fetch';

// Configuration
const BASE_URL = 'http://0.0.0.0:5000';

// Test credentials for super admin to switch to Patrick Accounting
const TEST_CREDENTIALS = {
  email: 'mpatrick@whirks.com',
  password: 'SuperAdmin2025!'
};

// Target organization
const PATRICK_ACCOUNTING_ID = 'patrick-accounting-prod-id';

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
  console.log(colors.cyan + '\n📝 Logging in as super admin...' + colors.reset);
  
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: TEST_CREDENTIALS.email,
        password: TEST_CREDENTIALS.password
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
    return data;
  } catch (error) {
    console.error(colors.red + '❌ Login failed:' + colors.reset, error.message);
    throw error;
  }
}

async function switchToPatrickAccounting() {
  console.log(colors.cyan + '\n🔄 Switching to Patrick Accounting organization...' + colors.reset);
  
  try {
    // First get CSRF token
    const csrfResponse = await fetch(`${BASE_URL}/api/csrf-token`, {
      method: 'GET',
      headers: {
        'Cookie': cookies
      }
    });
    
    const csrfData = await csrfResponse.json();
    const csrfToken = csrfData.token;
    
    // Now switch organization
    const response = await fetch(`${BASE_URL}/api/auth/switch-organization`, {
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        organizationId: PATRICK_ACCOUNTING_ID
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Switch failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    console.log(colors.green + '✅ Switched to organization!' + colors.reset);
    console.log(`   Organization: ${data.organization.name}`);
    console.log(`   User role: ${data.session.role}`);
    return data;
  } catch (error) {
    console.error(colors.red + '❌ Failed to switch organization:' + colors.reset, error.message);
    throw error;
  }
}

async function testSlackConnection() {
  console.log(colors.cyan + '\n🧪 Testing Slack connection for Patrick Accounting...' + colors.reset);
  
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
        console.log(colors.yellow + `   ⚠️ Channel error: ${data.details.channelInfo.error}` + colors.reset);
      }
    }
    
    if (data.organization) {
      console.log(colors.blue + '\n📋 Organization Configuration:' + colors.reset);
      console.log(`   Organization: ${data.organization.name}`);
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
  console.log(colors.cyan + '\n🏆 Creating a public win for Patrick Accounting...' + colors.reset);
  
  const winData = {
    title: `Test Win - ${new Date().toLocaleString()}`,
    description: 'This is a test public win to verify Slack notification functionality works for Patrick Accounting.',
    isPublic: true,
    category: 'Achievement'
  };
  
  try {
    // Get CSRF token first
    const csrfResponse = await fetch(`${BASE_URL}/api/csrf-token`, {
      method: 'GET',
      headers: {
        'Cookie': cookies
      }
    });
    
    const csrfData = await csrfResponse.json();
    const csrfToken = csrfData.token;
    
    // Create the win
    const response = await fetch(`${BASE_URL}/api/wins`, {
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
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
  console.log(colors.cyan + '\n📋 Server logs should show:' + colors.reset);
  console.log(`   🎯 announceWin called with: [channel ID, organization ID]`);
  console.log(`   📬 sendSlackMessage called with: [channel details]`);
  console.log(`   📤 Attempting to post message to Slack channel: C09JR9655B7`);
  console.log(`   ✅ Message successfully posted to Slack`);
  console.log(colors.yellow + '\n   Check the server console for detailed logs!' + colors.reset);
}

async function main() {
  console.log(colors.bright + colors.blue + '\n====================================');
  console.log('   PATRICK ACCOUNTING SLACK TEST');
  console.log('====================================' + colors.reset);
  
  try {
    // Step 1: Login
    await login();
    
    // Step 2: Switch to Patrick Accounting
    await switchToPatrickAccounting();
    
    // Step 3: Test Slack connection
    const connectionTest = await testSlackConnection();
    
    // Step 4: Create a public win
    console.log(colors.yellow + '\n⚠️ Watch the server logs for detailed Slack activity!' + colors.reset);
    const win = await createPublicWin();
    
    // Wait a moment for async Slack notification
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 5: Check logs
    await checkLogs();
    
    // Summary
    console.log(colors.bright + colors.blue + '\n====================================');
    console.log('   TEST COMPLETE');
    console.log('====================================' + colors.reset);
    
    if (win.slackMessageId) {
      console.log(colors.green + '✅ SUCCESS: Slack notification was sent!' + colors.reset);
      console.log(`   Message ID: ${win.slackMessageId}`);
      console.log(`   Channel: C09JR9655B7`);
      console.log(colors.green + '\n🎉 The win should now be visible in your Slack channel!' + colors.reset);
    } else {
      console.log(colors.yellow + '⚠️ Win created but Slack message ID not returned.' + colors.reset);
      console.log('   This could mean:');
      console.log('   1. Slack notification is being sent asynchronously');
      console.log('   2. Check server logs for actual Slack API responses');
      
      // Provide troubleshooting based on connection test
      if (!connectionTest.success) {
        console.log(colors.red + '\n🔧 Issue: Slack connection test failed' + colors.reset);
      }
      if (connectionTest.organization && !connectionTest.organization.enable_slack_integration) {
        console.log(colors.red + '\n🔧 Issue: Slack integration is disabled' + colors.reset);
      }
      if (connectionTest.organization && !connectionTest.organization.slack_wins_channel_id) {
        console.log(colors.red + '\n🔧 Issue: No wins channel ID configured' + colors.reset);
      }
      if (connectionTest.details?.channelInfo?.error === 'channel_not_found') {
        console.log(colors.red + '\n🔧 Issue: Bot cannot access channel C09JR9655B7' + colors.reset);
        console.log('   Solution: Add the bot to the channel in Slack');
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