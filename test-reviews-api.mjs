// Test script for the new /api/checkins/reviews endpoint
import fetch from 'node-fetch';

async function testReviewsEndpoint() {
  console.log('Testing /api/checkins/reviews endpoint...\n');
  
  const baseUrl = 'http://localhost:5000';
  
  try {
    // First, we need to login to get a session
    console.log('1. Attempting login...');
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'mpatrick@whirks.com',
        password: 'SuperAdmin2025!'
      })
    });
    
    if (!loginResponse.ok) {
      console.error('Login failed:', await loginResponse.text());
      return;
    }
    
    // Extract all cookies from set-cookie headers
    const setCookieHeaders = loginResponse.headers.raw()['set-cookie'] || [];
    const sessionCookie = setCookieHeaders.map(cookie => {
      // Extract just the cookie name=value part
      return cookie.split(';')[0];
    }).join('; ');
    
    console.log('Login successful!');
    console.log('Session cookie:', sessionCookie ? '✓ Retrieved' : '✗ Not found');
    
    // Now test the reviews endpoint
    console.log('\n2. Testing /api/checkins/reviews endpoint...');
    const reviewsResponse = await fetch(`${baseUrl}/api/checkins/reviews`, {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie
      }
    });
    
    console.log('Response status:', reviewsResponse.status);
    
    if (!reviewsResponse.ok) {
      console.error('Reviews endpoint failed:', await reviewsResponse.text());
      
      // Log what's happening on the server side
      console.log('\nDebug info:');
      console.log('- Session cookie sent:', sessionCookie ? 'Yes' : 'No');
      console.log('- Response headers:', Object.fromEntries(reviewsResponse.headers.entries()));
      return;
    }
    
    const reviewsData = await reviewsResponse.json();
    console.log('✅ Reviews endpoint successful!\n');
    console.log('Response structure:');
    console.log('- Pending reviews:', Array.isArray(reviewsData.pending) ? reviewsData.pending.length : 'N/A');
    console.log('- Reviewed checkins:', Array.isArray(reviewsData.reviewed) ? reviewsData.reviewed.length : 'N/A');
    console.log('- Missing submissions:', Array.isArray(reviewsData.missing) ? reviewsData.missing.length : 'N/A');
    
    if (reviewsData.pending && reviewsData.pending.length > 0) {
      console.log('\nSample pending review:', {
        id: reviewsData.pending[0].id,
        userId: reviewsData.pending[0].userId,
        weekOf: reviewsData.pending[0].weekOf,
        userName: reviewsData.pending[0].user?.name
      });
    }
    
    // Test with a specific week parameter
    console.log('\n3. Testing with weekStart parameter...');
    const weekStart = '2025-10-21'; // Last Monday
    const weekResponse = await fetch(`${baseUrl}/api/checkins/reviews?weekStart=${weekStart}`, {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie
      }
    });
    
    if (!weekResponse.ok) {
      console.error('Week-specific request failed:', weekResponse.status, await weekResponse.text());
      return;
    }
    
    const weekData = await weekResponse.json();
    console.log('✅ Week-specific request successful!');
    console.log(`Data for week starting ${weekStart}:`);
    console.log('- Pending reviews (all weeks):', Array.isArray(weekData.pending) ? weekData.pending.length : 'N/A');
    console.log('- Reviewed checkins (this week):', Array.isArray(weekData.reviewed) ? weekData.reviewed.length : 'N/A');
    console.log('- Missing submissions (this week):', Array.isArray(weekData.missing) ? weekData.missing.length : 'N/A');
    
    console.log('\n✅ All tests passed! The /api/checkins/reviews endpoint is working correctly.');
    console.log('The Reviews tab should now display data properly!');
    
  } catch (error) {
    console.error('Test failed with error:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testReviewsEndpoint().catch(console.error);