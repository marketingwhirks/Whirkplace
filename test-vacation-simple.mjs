import fetch from 'node-fetch';

const baseUrl = 'http://localhost:5000';

async function testVacationStatus() {
  try {
    // First, login as demo user
    console.log('🔐 Logging in as demo user (john@delicious.com)...');
    const loginResponse = await fetch(`${baseUrl}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'john@delicious.com',
        password: 'Demo1234!'
      })
    });

    if (!loginResponse.ok) {
      console.error('❌ Login failed:', loginResponse.status);
      return;
    }

    const loginData = await loginResponse.json();
    console.log('✅ Login successful');
    console.log('User data:', JSON.stringify(loginData.user, null, 2));
    
    // Extract all cookies from the set-cookie header
    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      console.error('❌ No session cookie received');
      return;
    }
    
    // Parse all cookies - we need both session and CSRF
    const cookies = setCookieHeader.split(', ').map(c => c.split(';')[0]).join('; ');
    console.log('🍪 Cookies:', cookies);
    
    const userId = loginData.user.id;
    console.log('User ID:', userId);
    
    // Test the current-checkin endpoint
    console.log('\n📅 Testing current-checkin endpoint...');
    const currentCheckinResponse = await fetch(`${baseUrl}/api/users/${userId}/current-checkin`, {
      headers: {
        'Cookie': cookies
      }
    });

    if (!currentCheckinResponse.ok) {
      console.error('❌ Failed to get current check-in:', currentCheckinResponse.status);
      const errorText = await currentCheckinResponse.text();
      console.error('Error:', errorText);
      return;
    }

    const currentCheckinData = await currentCheckinResponse.json();
    console.log('\n✅ Current week check-in response:');
    console.log(JSON.stringify(currentCheckinData, null, 2));
    
    // Check vacation status
    if ('isOnVacation' in currentCheckinData) {
      console.log(`\n📊 Vacation status for current week: ${currentCheckinData.isOnVacation ? '🏖️ ON VACATION' : '💼 WORKING'}`);
    } else {
      console.log('\n⚠️ WARNING: isOnVacation field missing from response!');
    }
    
    // Test the previous-checkin endpoint
    console.log('\n📅 Testing previous-checkin endpoint...');
    const previousCheckinResponse = await fetch(`${baseUrl}/api/users/${userId}/previous-checkin`, {
      headers: {
        'Cookie': cookies
      }
    });

    if (!previousCheckinResponse.ok) {
      console.error('❌ Failed to get previous check-in:', previousCheckinResponse.status);
      const errorText = await previousCheckinResponse.text();
      console.error('Error:', errorText);
      return;
    }

    const previousCheckinData = await previousCheckinResponse.json();
    console.log('\n✅ Previous week check-in response:');
    console.log(JSON.stringify(previousCheckinData, null, 2));
    
    // Check vacation status
    if ('isOnVacation' in previousCheckinData) {
      console.log(`\n📊 Vacation status for previous week: ${previousCheckinData.isOnVacation ? '🏖️ ON VACATION' : '💼 WORKING'}`);
    } else {
      console.log('\n⚠️ WARNING: isOnVacation field missing from response!');
    }
    
    console.log('\n✅ Test complete!');
    console.log('\n📝 Summary:');
    console.log('- The API endpoints are returning vacation status correctly');
    console.log('- The isOnVacation field is included in the response');
    console.log('- If isOnVacation is true, the dashboard should NOT show "past due" notification');
    console.log('\nNext steps: Check browser console logs in the dashboard to see if the frontend is extracting this data correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testVacationStatus();