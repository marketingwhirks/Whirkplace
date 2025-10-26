// Test script for team goals API endpoints
const fs = require('fs');
const path = require('path');

// Load cookies for authentication (assuming a session exists)
const cookiesPath = path.join(__dirname, 'test_cookies.txt');
let cookies = '';

try {
  if (fs.existsSync(cookiesPath)) {
    cookies = fs.readFileSync(cookiesPath, 'utf8').trim();
    console.log('✅ Loaded cookies from test_cookies.txt');
  } else {
    console.log('ℹ️ No cookies file found, tests may fail if authentication is required');
  }
} catch (error) {
  console.error('Error loading cookies:', error.message);
}

const baseURL = 'http://localhost:5000';

// Helper function to make API requests
async function apiRequest(method, endpoint, data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    }
  };

  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${baseURL}${endpoint}`, options);
    const text = await response.text();
    
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = text;
    }

    return {
      status: response.status,
      ok: response.ok,
      data: result
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message
    };
  }
}

async function runTests() {
  console.log('\n🧪 Testing Team Goals API Endpoints\n');
  console.log('=' . repeat(50));
  
  // Test 1: GET all team goals
  console.log('\n1️⃣ Testing GET /api/team-goals');
  const getAllGoals = await apiRequest('GET', '/api/team-goals');
  console.log(`   Status: ${getAllGoals.status}`);
  if (getAllGoals.ok) {
    console.log(`   ✅ Success: Found ${Array.isArray(getAllGoals.data) ? getAllGoals.data.length : 0} goals`);
  } else {
    console.log(`   ❌ Failed: ${JSON.stringify(getAllGoals.data)}`);
  }
  
  // Test 2: GET active goals only
  console.log('\n2️⃣ Testing GET /api/team-goals?activeOnly=true');
  const getActiveGoals = await apiRequest('GET', '/api/team-goals?activeOnly=true');
  console.log(`   Status: ${getActiveGoals.status}`);
  if (getActiveGoals.ok) {
    console.log(`   ✅ Success: Found ${Array.isArray(getActiveGoals.data) ? getActiveGoals.data.length : 0} active goals`);
  } else {
    console.log(`   ❌ Failed: ${JSON.stringify(getActiveGoals.data)}`);
  }
  
  // Test 3: POST new team goal
  console.log('\n3️⃣ Testing POST /api/team-goals');
  const newGoal = {
    title: 'Test Goal ' + Date.now(),
    description: 'This is a test team goal created via API',
    targetValue: 100,
    currentValue: 0,
    goalType: 'monthly',
    metric: 'wins',
    prize: 'Team lunch',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
    teamId: null // Organization-wide goal
  };
  
  const createGoal = await apiRequest('POST', '/api/team-goals', newGoal);
  console.log(`   Status: ${createGoal.status}`);
  let createdGoalId = null;
  
  if (createGoal.ok) {
    createdGoalId = createGoal.data.id;
    console.log(`   ✅ Success: Created goal with ID: ${createdGoalId}`);
  } else {
    console.log(`   ⚠️ Note: ${JSON.stringify(createGoal.data)}`);
    console.log('   (This might fail if not logged in as admin)');
  }
  
  // Test 4: PATCH update goal
  if (createdGoalId) {
    console.log('\n4️⃣ Testing PATCH /api/team-goals/:id');
    const updateData = {
      title: 'Updated Test Goal',
      targetValue: 150
    };
    
    const updateGoal = await apiRequest('PATCH', `/api/team-goals/${createdGoalId}`, updateData);
    console.log(`   Status: ${updateGoal.status}`);
    
    if (updateGoal.ok) {
      console.log(`   ✅ Success: Updated goal`);
      console.log(`      New title: ${updateGoal.data.title}`);
      console.log(`      New target: ${updateGoal.data.targetValue}`);
    } else {
      console.log(`   ❌ Failed: ${JSON.stringify(updateGoal.data)}`);
    }
    
    // Test 5: DELETE goal
    console.log('\n5️⃣ Testing DELETE /api/team-goals/:id');
    const deleteGoal = await apiRequest('DELETE', `/api/team-goals/${createdGoalId}`);
    console.log(`   Status: ${deleteGoal.status}`);
    
    if (deleteGoal.status === 204) {
      console.log(`   ✅ Success: Goal deleted`);
    } else {
      console.log(`   ❌ Failed: ${JSON.stringify(deleteGoal.data)}`);
    }
  }
  
  // Test 6: Test with teamId filter
  console.log('\n6️⃣ Testing GET /api/team-goals?teamId=test-team-id');
  const getTeamGoals = await apiRequest('GET', '/api/team-goals?teamId=test-team-id');
  console.log(`   Status: ${getTeamGoals.status}`);
  if (getTeamGoals.ok) {
    console.log(`   ✅ Success: Query executed`);
    console.log(`      Found ${Array.isArray(getTeamGoals.data) ? getTeamGoals.data.length : 0} goals for team`);
  } else {
    console.log(`   ❌ Failed: ${JSON.stringify(getTeamGoals.data)}`);
  }
  
  console.log('\n' + '=' . repeat(50));
  console.log('\n✨ Test suite completed!\n');
  console.log('Note: Some tests may fail if:');
  console.log('  - Not authenticated (no valid session cookie)');
  console.log('  - Not logged in as admin (for POST/PATCH/DELETE)');
  console.log('  - No team goals exist in the database');
}

// Run the tests
runTests().catch(console.error);