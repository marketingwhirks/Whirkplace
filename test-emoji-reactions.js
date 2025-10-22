#!/usr/bin/env node
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const SERVER_URL = 'http://localhost:5000';

async function loginDemoUser() {
  const response = await fetch(`${SERVER_URL}/api/demo/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'employee' }),
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(`Failed to login: ${response.statusText}`);
  }

  const cookies = response.headers.raw()['set-cookie'];
  if (!cookies) {
    throw new Error('No cookies received');
  }

  return cookies.join('; ');
}

async function testEmojiReactions() {
  console.log('🧪 Starting Emoji Reactions Test...\n');

  try {
    // 1. Login as demo user
    console.log('1️⃣ Logging in as demo user...');
    const cookies = await loginDemoUser();
    console.log('✅ Logged in successfully\n');

    // 2. Get wins to find a post to test with
    console.log('2️⃣ Fetching wins to find a test post...');
    const winsResponse = await fetch(`${SERVER_URL}/api/wins`, {
      headers: {
        'Cookie': cookies
      }
    });

    if (!winsResponse.ok) {
      throw new Error(`Failed to fetch wins: ${winsResponse.statusText}`);
    }

    const wins = await winsResponse.json();
    
    if (!wins || wins.length === 0) {
      console.log('❌ No wins found to test with');
      return;
    }

    const testWin = wins[0];
    console.log(`✅ Found test win: ${testWin.id}\n`);

    // 3. Add an emoji reaction
    console.log('3️⃣ Adding emoji reaction to win...');
    const addResponse = await fetch(`${SERVER_URL}/api/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies
      },
      body: JSON.stringify({
        postId: testWin.id,
        postType: 'win',
        emoji: '👍'
      })
    });

    if (!addResponse.ok) {
      throw new Error(`Failed to add reaction: ${addResponse.statusText}`);
    }

    const newReaction = await addResponse.json();
    console.log(`✅ Added reaction with ID: ${newReaction.id}\n`);

    // 4. Get reactions for the post
    console.log('4️⃣ Fetching reactions for the win...');
    const getReactionsResponse = await fetch(`${SERVER_URL}/api/wins/${testWin.id}/reactions`, {
      headers: {
        'Cookie': cookies
      }
    });

    if (!getReactionsResponse.ok) {
      throw new Error(`Failed to fetch reactions: ${getReactionsResponse.statusText}`);
    }

    const reactions = await getReactionsResponse.json();
    const thumbsUpReaction = reactions.find(r => r.emoji === '👍');
    
    if (!thumbsUpReaction) {
      console.log('❌ Reaction not found in list');
      return;
    }

    console.log(`✅ Found reaction in list:`);
    console.log(`   - Emoji: ${thumbsUpReaction.emoji}`);
    console.log(`   - Count: ${thumbsUpReaction.count}`);
    console.log(`   - User has reacted: ${thumbsUpReaction.hasUserReacted}`);
    console.log(`   - User reaction ID: ${thumbsUpReaction.userReactionId}\n`);

    // 5. Verify userReactionId is present
    if (!thumbsUpReaction.userReactionId) {
      console.log('❌ ERROR: userReactionId is missing! This is needed for deletion.');
      return;
    }

    // 6. Delete the reaction
    console.log('5️⃣ Deleting the reaction...');
    const deleteResponse = await fetch(`${SERVER_URL}/api/reactions/${thumbsUpReaction.userReactionId}`, {
      method: 'DELETE',
      headers: {
        'Cookie': cookies
      }
    });

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      throw new Error(`Failed to delete reaction: ${deleteResponse.status} - ${errorText}`);
    }

    console.log('✅ Reaction deleted successfully\n');

    // 7. Verify deletion
    console.log('6️⃣ Verifying reaction was deleted...');
    const verifyResponse = await fetch(`${SERVER_URL}/api/wins/${testWin.id}/reactions`, {
      headers: {
        'Cookie': cookies
      }
    });

    if (!verifyResponse.ok) {
      throw new Error(`Failed to fetch reactions: ${verifyResponse.statusText}`);
    }

    const reactionsAfterDelete = await verifyResponse.json();
    const thumbsUpAfterDelete = reactionsAfterDelete.find(r => r.emoji === '👍');
    
    if (!thumbsUpAfterDelete || !thumbsUpAfterDelete.hasUserReacted) {
      console.log('✅ Reaction successfully removed!\n');
    } else {
      console.log('❌ ERROR: Reaction still exists after deletion');
      return;
    }

    console.log('🎉 All emoji reaction tests passed successfully!');
    console.log('✅ Add reaction - PASSED');
    console.log('✅ Track reaction ID - PASSED'); 
    console.log('✅ Delete reaction - PASSED');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// Run the test
testEmojiReactions();