import fetch from 'node-fetch';

async function testSessionCookie() {
  console.log('🔍 Testing Session Cookie Fix...\n');
  
  const baseUrl = 'http://localhost:5000';
  
  // Test login endpoint with test user credentials
  console.log('📧 Testing login endpoint with test user...');
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'testpass123'
    }),
    // Important: don't follow redirects to see the actual response
    redirect: 'manual'
  });

  console.log('Response status:', loginResponse.status);
  console.log('Response headers:');
  
  // Check for Set-Cookie header
  const setCookieHeader = loginResponse.headers.get('set-cookie');
  console.log('Set-Cookie header:', setCookieHeader || 'NOT FOUND ❌');
  
  if (setCookieHeader) {
    console.log('✅ SUCCESS! Set-Cookie header is present!');
    console.log('Cookie details:', setCookieHeader);
    
    // Check if it contains the session cookie name
    if (setCookieHeader.includes('connect.sid')) {
      console.log('✅ Session cookie name is correct (connect.sid)');
    } else {
      console.log('⚠️ Session cookie name might be different');
    }
  } else {
    console.log('❌ FAILED! No Set-Cookie header found');
    console.log('This means the session cookie is still not being set');
  }
  
  const responseBody = await loginResponse.json();
  console.log('\nResponse body:', responseBody);
  
  // If we got a cookie, test if it works for authenticated requests
  if (setCookieHeader) {
    console.log('\n🔒 Testing authenticated request with cookie...');
    const cookie = setCookieHeader.split(';')[0]; // Get just the cookie value
    
    const currentUserResponse = await fetch(`${baseUrl}/api/users/current`, {
      headers: {
        'Cookie': cookie
      }
    });
    
    console.log('Current user endpoint status:', currentUserResponse.status);
    
    if (currentUserResponse.status === 200) {
      const userData = await currentUserResponse.json();
      console.log('✅ Authenticated request successful!');
      console.log('User data:', userData);
    } else {
      console.log('❌ Authenticated request failed');
      const errorText = await currentUserResponse.text();
      console.log('Error:', errorText);
    }
  }
}

testSessionCookie().catch(console.error);