const fetch = require('node-fetch');

const baseUrl = 'http://localhost:5000';

async function testVacationStatus() {
  try {
    // First, login as a demo user
    console.log('🔐 Logging in as demo user...');
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
      console.error('❌ Login failed:', loginResponse.status);
      const text = await loginResponse.text();
      console.error('Response:', text);
      return;
    }

    const loginData = await loginResponse.json();
    console.log('✅ Login successful:', loginData.user.name);

    // Get the session cookie
    const cookie = loginResponse.headers.get('set-cookie');
    
    // Get current user info
    const currentUserResponse = await fetch(`${baseUrl}/api/users/current`, {
      headers: {
        'Cookie': cookie
      }
    });

    const currentUser = await currentUserResponse.json();
    console.log('👤 Current user:', currentUser.name, '(ID:', currentUser.id, ')');

    // Get the current check-in status (which includes vacation status)
    console.log('\n📅 Getting current week check-in status...');
    const currentCheckinResponse = await fetch(`${baseUrl}/api/users/${currentUser.id}/current-checkin`, {
      headers: {
        'Cookie': cookie
      }
    });

    if (!currentCheckinResponse.ok) {
      console.error('❌ Failed to get current check-in:', currentCheckinResponse.status);
      return;
    }

    const currentCheckinData = await currentCheckinResponse.json();
    console.log('Current check-in data:', JSON.stringify(currentCheckinData, null, 2));
    
    // Check if the vacation status is included
    if (currentCheckinData.hasOwnProperty('isOnVacation')) {
      console.log(`✅ Vacation status included: isOnVacation = ${currentCheckinData.isOnVacation}`);
    } else {
      console.log('⚠️ WARNING: isOnVacation field not found in response');
    }

    // Get the previous week check-in status
    console.log('\n📅 Getting previous week check-in status...');
    const previousCheckinResponse = await fetch(`${baseUrl}/api/users/${currentUser.id}/previous-checkin`, {
      headers: {
        'Cookie': cookie
      }
    });

    if (!previousCheckinResponse.ok) {
      console.error('❌ Failed to get previous check-in:', previousCheckinResponse.status);
      return;
    }

    const previousCheckinData = await previousCheckinResponse.json();
    console.log('Previous check-in data:', JSON.stringify(previousCheckinData, null, 2));
    
    // Check if the vacation status is included
    if (previousCheckinData.hasOwnProperty('isOnVacation')) {
      console.log(`✅ Vacation status included: isOnVacation = ${previousCheckinData.isOnVacation}`);
    } else {
      console.log('⚠️ WARNING: isOnVacation field not found in response');
    }

    // Now let's add a vacation for the current week to test the logic
    console.log('\n🏖️ Setting vacation for current week to test the dashboard logic...');
    
    // Get current week start date
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Go to Sunday
    weekStart.setHours(0, 0, 0, 0);

    // Get CSRF token
    const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf-token`, {
      headers: {
        'Cookie': cookie
      }
    });
    const { csrfToken } = await csrfResponse.json();

    // Add vacation for current week
    const vacationResponse = await fetch(`${baseUrl}/api/vacations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        userId: currentUser.id,
        weekStart: weekStart.toISOString(),
        weekEnd: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString(),
        reason: 'Testing vacation status'
      })
    });

    if (vacationResponse.ok) {
      console.log('✅ Vacation added successfully for current week');
      
      // Re-fetch current check-in status to see if vacation status updated
      console.log('\n📅 Re-fetching current week check-in status after adding vacation...');
      const updatedCheckinResponse = await fetch(`${baseUrl}/api/users/${currentUser.id}/current-checkin`, {
        headers: {
          'Cookie': cookie
        }
      });

      const updatedCheckinData = await updatedCheckinResponse.json();
      console.log('Updated check-in data:', JSON.stringify(updatedCheckinData, null, 2));
      
      if (updatedCheckinData.isOnVacation === true) {
        console.log('✅ SUCCESS: isOnVacation is now true!');
        console.log('The dashboard should now show "You\'re on vacation this week" instead of "past due"');
      } else {
        console.log('❌ PROBLEM: isOnVacation is still false after adding vacation');
      }
    } else {
      console.error('❌ Failed to add vacation:', vacationResponse.status);
      const errorText = await vacationResponse.text();
      console.error('Error:', errorText);
    }

    console.log('\n📊 Test complete. Check the browser console logs in the dashboard to see the debug output.');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testVacationStatus();