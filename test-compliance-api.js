import fetch from 'isomorphic-fetch';

async function testComplianceEndpoints() {
  const baseUrl = 'http://localhost:5000';
  
  // Login first - using mpatrick@patrickaccounting.com
  console.log('🔐 Logging in...');
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'mpatrick@patrickaccounting.com',
      password: 'SuperAdmin2025!' // Default password for test data
    })
  });
  
  if (!loginResponse.ok) {
    console.error('Login failed:', await loginResponse.text());
    return;
  }
  
  const loginData = await loginResponse.json();
  console.log('✅ Login successful:', loginData);
  
  // Extract cookies for subsequent requests
  const cookies = loginResponse.headers.get('set-cookie');
  
  // Test each compliance endpoint
  const endpoints = [
    '/api/analytics/checkin-compliance',
    '/api/analytics/review-compliance',
    '/api/compliance/organization-summary',
    '/api/analytics/organization-health'
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\n📊 Testing ${endpoint}...`);
    
    const response = await fetch(`${baseUrl}${endpoint}`, {
      headers: {
        'Cookie': cookies,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`❌ Error for ${endpoint}:`, await response.text());
      continue;
    }
    
    const data = await response.json();
    console.log(`✅ Response from ${endpoint}:`, JSON.stringify(data, null, 2));
  }
  
  // Also test with specific date range for last week
  console.log('\n📊 Testing checkin-compliance with last week date range...');
  const lastWeekStart = '2025-10-20';
  const lastWeekEnd = '2025-10-26';
  
  const dateRangeResponse = await fetch(`${baseUrl}/api/analytics/checkin-compliance?from=${lastWeekStart}&to=${lastWeekEnd}`, {
    headers: {
      'Cookie': cookies,
      'Content-Type': 'application/json'
    }
  });
  
  if (dateRangeResponse.ok) {
    const dateRangeData = await dateRangeResponse.json();
    console.log('✅ Date range response:', JSON.stringify(dateRangeData, null, 2));
  }
}

// Run the tests
testComplianceEndpoints().catch(console.error);