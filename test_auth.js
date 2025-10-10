// Test script to verify authentication and role detection
async function testAuth() {
  const baseUrl = 'http://localhost:5000';
  
  // Test 1: Login as admin using demo login
  console.log('Testing admin demo login...');
  const loginResponse = await fetch(`${baseUrl}/api/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'john@delicious.com',
      password: 'Demo1234!'
    }),
    credentials: 'include'
  });
  
  if (!loginResponse.ok) {
    console.error('Login failed:', loginResponse.status);
    const text = await loginResponse.text();
    console.error('Response:', text);
    return;
  }
  
  const loginData = await loginResponse.json();
  console.log('Login successful:', loginData);
  
  // Get cookies from response
  const cookies = loginResponse.headers.get('set-cookie');
  
  // Test 2: Get current user
  console.log('\nGetting current user...');
  const userResponse = await fetch(`${baseUrl}/api/users/current`, {
    method: 'GET',
    headers: {
      'Cookie': cookies || '',
      'Content-Type': 'application/json'
    },
    credentials: 'include'
  });
  
  if (!userResponse.ok) {
    console.error('Failed to get user:', userResponse.status);
    return;
  }
  
  const userData = await userResponse.json();
  console.log('Current user:', JSON.stringify(userData, null, 2));
  console.log('Role:', userData.role);
  console.log('Is Super Admin:', userData.isSuperAdmin);
  
  // Test 3: Get team goals
  console.log('\nFetching team goals...');
  const goalsResponse = await fetch(`${baseUrl}/api/team-goals`, {
    method: 'GET',
    headers: {
      'Cookie': cookies || '',
      'Content-Type': 'application/json'
    },
    credentials: 'include'
  });
  
  if (!goalsResponse.ok) {
    console.error('Failed to get goals:', goalsResponse.status);
    return;
  }
  
  const goalsData = await goalsResponse.json();
  console.log('Team goals count:', goalsData.length);
  
  console.log('\n✅ All tests passed!');
  console.log('User should be able to see Create Goal button with role:', userData.role);
}

testAuth().catch(console.error);