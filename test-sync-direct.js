// Direct test of the sync functionality without going through HTTP
import { syncUsersFromSlack } from './server/services/slack.js';
import { storage } from './server/storage.js';

async function testSyncDirect() {
  try {
    console.log('🚀 Testing Slack user sync directly...\n');
    
    const organizationId = 'whirkplace';
    const botToken = process.env.SLACK_BOT_TOKEN;
    const channelName = 'whirkplace-pulse';
    
    console.log('📋 Configuration:');
    console.log(`   • Organization: ${organizationId}`);
    console.log(`   • Bot Token: ${botToken ? '✅ Set' : '❌ Not set'}`);
    console.log(`   • Channel: #${channelName}\n`);
    
    if (!botToken) {
      console.error('❌ SLACK_BOT_TOKEN environment variable not set!');
      return;
    }
    
    console.log('🔄 Starting sync...');
    const result = await syncUsersFromSlack(organizationId, storage, botToken, channelName);
    
    if (result.error) {
      console.error('❌ Sync failed:', result.error);
      
      // Provide helpful guidance based on error
      if (result.error.includes('missing_scope')) {
        console.log('\n💡 Solution: Your Slack app needs these scopes:');
        console.log('   • channels:read - to find and access channels');
        console.log('   • groups:read - for private channels');
        console.log('   • users:read - to get user information');
        console.log('   • users:read.email - to get user email addresses');
        console.log('   Update at: https://api.slack.com/apps → OAuth & Permissions → Bot Token Scopes');
      } else if (result.error.includes('channel_not_found')) {
        console.log(`\n💡 Solution: Create the #${channelName} channel and invite your bot:`);
        console.log(`   1. Create channel: /create ${channelName}`);
        console.log('   2. Invite bot: /invite @your-bot-name');
      } else if (result.error.includes('invalid_auth')) {
        console.log('\n💡 Solution: Your Slack bot token is invalid or expired');
        console.log('   Get a new token at: https://api.slack.com/apps → OAuth & Permissions');
      } else if (result.error.includes('No members found')) {
        console.log(`\n💡 Solution: The #${channelName} channel is empty or the bot can't see members`);
        console.log('   1. Add users to the channel');
        console.log('   2. Make sure the bot is invited to the channel');
      }
    } else {
      console.log('✅ Sync completed successfully!\n');
      console.log('📊 Results:');
      console.log(`   • Created: ${result.created} new users`);
      console.log(`   • Reactivated: ${result.activated} users`);
      console.log(`   • Deactivated: ${result.deactivated} users`);
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error(error.stack);
  }
}

testSyncDirect();