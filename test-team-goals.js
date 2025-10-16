// Test script to verify team goals are working
const testTeamGoalCreation = async () => {
  const baseUrl = 'http://localhost:5000';
  
  // First, login as a team leader/admin
  console.log('Testing team goal creation...');
  
  try {
    // Login as admin
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
    
    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }
    
    const loginData = await loginResponse.json();
    console.log('✓ Login successful');
    
    // Get CSRF token
    const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf-token`, {
      credentials: 'include'
    });
    const { token } = await csrfResponse.json();
    console.log('✓ CSRF token obtained');
    
    // Create a test team goal
    const goalData = {
      title: 'Test Goal ' + new Date().toISOString(),
      description: 'This is a test goal to verify team goals are saving correctly',
      targetValue: 10,
      goalType: 'weekly',
      metric: 'wins',
      prize: 'Test prize'
    };
    
    console.log('Creating team goal with data:', goalData);
    
    const createResponse = await fetch(`${baseUrl}/api/team-goals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token
      },
      body: JSON.stringify(goalData),
      credentials: 'include'
    });
    
    const responseText = await createResponse.text();
    console.log('Response status:', createResponse.status);
    console.log('Response:', responseText);
    
    if (!createResponse.ok) {
      throw new Error(`Failed to create goal: ${createResponse.status} - ${responseText}`);
    }
    
    const createdGoal = JSON.parse(responseText);
    console.log('✓ Team goal created successfully!');
    console.log('Created goal:', createdGoal);
    
    // Verify the goal was created by fetching it
    const fetchResponse = await fetch(`${baseUrl}/api/team-goals`, {
      credentials: 'include'
    });
    
    if (!fetchResponse.ok) {
      throw new Error(`Failed to fetch goals: ${fetchResponse.status}`);
    }
    
    const goals = await fetchResponse.json();
    const foundGoal = goals.find(g => g.id === createdGoal.id);
    
    if (foundGoal) {
      console.log('✓ Goal verified in database!');
      console.log('✓ Team goals are working correctly!');
    } else {
      console.log('⚠ Goal created but not found in list');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  }
};

// Run the test
testTeamGoalCreation();