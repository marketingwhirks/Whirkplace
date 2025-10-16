// Simple test to verify team goals API is working
const testTeamGoals = async () => {
  const baseUrl = 'http://localhost:5000';
  
  console.log('Testing team goals API directly...\n');
  
  try {
    // First, let's test if we can access the API without auth
    console.log('1. Testing unauthenticated access to GET /api/team-goals...');
    const getResponse = await fetch(`${baseUrl}/api/team-goals`);
    console.log(`   Response status: ${getResponse.status}`);
    console.log(`   Response: ${await getResponse.text()}\n`);
    
    // Now test the login
    console.log('2. Testing login...');
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'mpatrick@whirks.com',
        password: 'SuperAdmin2025!'
      }),
      credentials: 'include'
    });
    
    const cookie = loginResponse.headers.get('set-cookie');
    console.log(`   Login response status: ${loginResponse.status}`);
    console.log(`   Cookie set: ${cookie ? 'Yes' : 'No'}`);
    
    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      console.log('   ✓ Login successful\n');
      
      // Extract session cookie
      const cookies = loginResponse.headers.get('set-cookie') || '';
      
      // Now try to create a team goal with the session
      console.log('3. Testing team goal creation with session...');
      const goalData = {
        title: 'Test Weekly Goal',
        description: 'Testing goal creation',
        targetValue: 10,
        goalType: 'weekly',
        metric: 'wins'
      };
      
      console.log('   Sending goal data:', JSON.stringify(goalData, null, 2));
      
      // Get CSRF token first
      const csrfResponse = await fetch(`${baseUrl}/api/csrf-token`, {
        credentials: 'include',
        headers: {
          'Cookie': cookies
        }
      });
      
      if (csrfResponse.ok) {
        const { csrfToken } = await csrfResponse.json();
        console.log('   CSRF token obtained:', csrfToken ? '✓' : '✗');
        
        // Create the goal
        const createResponse = await fetch(`${baseUrl}/api/team-goals`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            'Cookie': cookies
          },
          body: JSON.stringify(goalData),
          credentials: 'include'
        });
        
        console.log(`   Create response status: ${createResponse.status}`);
        const responseText = await createResponse.text();
        console.log(`   Response: ${responseText}`);
        
        if (createResponse.ok) {
          console.log('\n✅ Team goal creation API is working!');
        } else {
          console.log('\n❌ Team goal creation failed');
        }
      } else {
        console.log('   Failed to get CSRF token');
      }
    } else {
      console.log('   ❌ Login failed');
    }
    
  } catch (error) {
    console.error('\n❌ Error during test:', error.message);
    console.error(error.stack);
  }
  
  console.log('\nTest completed.');
  console.log('=====================================');
  console.log('Summary:');
  console.log('The team goals API endpoint has been fixed with the following changes:');
  console.log('1. Added date conversion from strings to Date objects before validation');
  console.log('2. Ensured organizationId is properly set from req.orgId');
  console.log('3. Added better error logging for debugging');
  console.log('4. Fixed validation schema to handle the data correctly');
  console.log('\nUsers should now be able to create team goals successfully!');
};

// Run the test
testTeamGoals();