import fetch from 'isomorphic-fetch';

async function testCompliance() {
  const baseUrl = 'http://localhost:5000';
  
  console.log('🔐 Testing login and get compliance data...');
  
  // Step 1: Login
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'mpatrick@patrickaccounting.com',
      password: 'SuperAdmin2025!'
    }),
    credentials: 'include'  // Important for cookies
  });
  
  if (!loginResponse.ok) {
    console.error('Login failed:', await loginResponse.text());
    return;
  }
  
  // Extract session cookie
  const setCookieHeader = loginResponse.headers.get('set-cookie');
  console.log('Cookie header:', setCookieHeader);
  
  // Extract just the session cookie value
  const sessionMatch = setCookieHeader?.match(/connect\.sid=([^;]+)/);
  const sessionCookie = sessionMatch ? `connect.sid=${sessionMatch[1]}` : '';
  
  console.log('Session cookie:', sessionCookie);
  
  // Step 2: Test checkin compliance endpoint
  console.log('\n📊 Testing /api/analytics/checkin-compliance...');
  const complianceResponse = await fetch(`${baseUrl}/api/analytics/checkin-compliance`, {
    headers: {
      'Cookie': sessionCookie
    }
  });
  
  console.log('Response status:', complianceResponse.status);
  const complianceData = await complianceResponse.text();
  console.log('Response:', complianceData);
  
  // Step 3: Test with date range
  console.log('\n📊 Testing with last week date range...');
  const rangeResponse = await fetch(`${baseUrl}/api/analytics/checkin-compliance?from=2025-10-20&to=2025-10-26`, {
    headers: {
      'Cookie': sessionCookie
    }
  });
  
  console.log('Range response status:', rangeResponse.status);
  const rangeData = await rangeResponse.text();
  console.log('Range response:', rangeData);
}

testCompliance().catch(console.error);