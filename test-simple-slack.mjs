#!/usr/bin/env node

// Simple test for Slack win notification
import fetch from 'node-fetch';

const BASE_URL = 'http://0.0.0.0:5000';

// Test with Patrick Accounting admin user directly
const CREDENTIALS = {
  email: 'mpatrick@patrickaccounting.com',
  password: 'password123'  // Default password
};

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
  console.log(colors.cyan + '📝 Logging in to Patrick Accounting...' + colors.reset);
  
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: CREDENTIALS.email,
        password: CREDENTIALS.password
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Login failed: ${response.status} - ${data.message}`);
    }
    
    // Extract cookies
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');
    }

    console.log(colors.green + '✅ Logged in as:' + colors.reset, data.user.name);
    console.log('   Organization:', data.organization?.name || 'Not specified');
    return data;
  } catch (error) {
    console.error(colors.red + '❌ Login failed:' + colors.reset, error.message);
    throw error;
  }
}

async function createPublicWin() {
  console.log(colors.cyan + '\n🏆 Creating public win...' + colors.reset);
  
  try {
    // Get CSRF token
    const csrfResponse = await fetch(`${BASE_URL}/api/csrf-token`, {
      headers: { 'Cookie': cookies }
    });
    const { csrfToken } = await csrfResponse.json();
    
    // Create win
    const winData = {
      title: `Test Win ${Date.now()}`,
      description: 'Testing Slack notification',
      isPublic: true,
      category: 'Achievement'
    };
    
    console.log('   Sending:', winData);
    
    const response = await fetch(`${BASE_URL}/api/wins`, {
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify(winData)
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Failed: ${response.status} - ${data.message}`);
    }
    
    console.log(colors.green + '✅ Win created!' + colors.reset);
    console.log('   ID:', data.id);
    console.log('   Public:', data.isPublic ? '✅' : '❌');
    
    // Wait a bit for async Slack notification
    console.log(colors.yellow + '\n⏳ Waiting for Slack notification...' + colors.reset);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(colors.cyan + '\n📋 Check server logs for:' + colors.reset);
    console.log('   - 🎯 announceWin called');
    console.log('   - 📬 sendSlackMessage called');
    console.log('   - Channel ID: C09JR9655B7');
    console.log('   - Any error messages');
    
    return data;
  } catch (error) {
    console.error(colors.red + '❌ Failed:' + colors.reset, error.message);
    throw error;
  }
}

async function main() {
  console.log(colors.bright + colors.blue + '\n=== SIMPLE SLACK TEST ===' + colors.reset);
  
  try {
    await login();
    await createPublicWin();
    
    console.log(colors.green + '\n✅ Test complete!' + colors.reset);
    console.log('Check your Slack channel and server logs for results.');
  } catch (error) {
    console.error(colors.red + '\n❌ Test failed:' + colors.reset, error.message);
    process.exit(1);
  }
}

main();