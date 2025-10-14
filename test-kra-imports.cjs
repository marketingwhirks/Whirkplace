#!/usr/bin/env node

// Test script for KRA template import endpoints
const http = require('http');

const API_URL = 'http://localhost:5000';
let testOrgId = null;

// Helper function to make HTTP requests
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({ status: res.statusCode, data: result });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Test functions
async function setupTestEnvironment() {
  console.log('\n=====================================');
  console.log('🔧 SETTING UP TEST ENVIRONMENT');
  console.log('=====================================\n');
  
  const response = await makeRequest('GET', '/api/test/kra/setup');
  console.log('Response:', JSON.stringify(response.data, null, 2));
  
  if (response.status === 200 && response.data.organizationId) {
    testOrgId = response.data.organizationId;
    console.log(`✅ Test organization ready: ${testOrgId}\n`);
    return true;
  } else {
    console.error('❌ Failed to setup test environment\n');
    return false;
  }
}

async function cleanupExistingTemplates() {
  console.log('\n=====================================');
  console.log('🧹 CLEANING UP EXISTING TEMPLATES');
  console.log('=====================================\n');
  
  const response = await makeRequest('DELETE', `/api/test/kra/cleanup/${testOrgId}`);
  console.log('Response:', JSON.stringify(response.data, null, 2));
  console.log(`✅ Cleanup complete: ${response.data.deletedCount} templates deleted\n`);
}

async function testImportFallback() {
  console.log('\n=====================================');
  console.log('🚨 TESTING IMPORT-FALLBACK ENDPOINT');
  console.log('=====================================\n');
  
  const response = await makeRequest('POST', '/api/test/kra/import-fallback', { 
    organizationId: testOrgId 
  });
  
  console.log('Status Code:', response.status);
  console.log('Response:', JSON.stringify(response.data, null, 2));
  
  if (response.data.stats) {
    console.log('\n📊 Import Statistics:');
    console.log(`   - Imported: ${response.data.stats.imported}`);
    console.log(`   - Skipped: ${response.data.stats.skipped}`);
    console.log(`   - Failed: ${response.data.stats.failed}`);
    console.log(`   - Total: ${response.data.stats.total}`);
  }
  
  if (response.data.errors && response.data.errors.length > 0) {
    console.log('\n❌ Errors encountered:');
    response.data.errors.forEach(err => {
      console.log(`   - ${err.template}: ${err.error}`);
    });
  }
  
  const success = response.data.success && response.data.stats?.imported > 0;
  console.log(`\n${success ? '✅' : '❌'} Fallback import test ${success ? 'PASSED' : 'FAILED'}\n`);
  return success;
}

async function testImportAll() {
  console.log('\n=====================================');
  console.log('🚀 TESTING IMPORT-ALL ENDPOINT');
  console.log('=====================================\n');
  
  // First cleanup to test fresh import
  await cleanupExistingTemplates();
  
  const response = await makeRequest('POST', '/api/test/kra/import-all', { 
    organizationId: testOrgId 
  });
  
  console.log('Status Code:', response.status);
  console.log('Response:', JSON.stringify(response.data, null, 2));
  
  if (response.data.stats) {
    console.log('\n📊 Import Statistics:');
    console.log(`   - Imported: ${response.data.stats.imported}`);
    console.log(`   - Skipped: ${response.data.stats.skipped}`);
    console.log(`   - Failed: ${response.data.stats.failed}`);
    console.log(`   - Total: ${response.data.stats.total}`);
  }
  
  const success = response.data.success && response.data.stats?.imported > 0;
  console.log(`\n${success ? '✅' : '❌'} Import-all test ${success ? 'PASSED' : 'FAILED'}\n`);
  return success;
}

async function testImportDefaults() {
  console.log('\n=====================================');
  console.log('🎯 TESTING IMPORT-DEFAULTS ENDPOINT');
  console.log('=====================================\n');
  
  // Test with different filters
  const filters = ['all', 'patrick', 'whirks'];
  const results = [];
  
  for (const filter of filters) {
    console.log(`\n📝 Testing with filter: "${filter}"`);
    
    // Cleanup before each test
    await cleanupExistingTemplates();
    
    const response = await makeRequest('POST', '/api/test/kra/import-defaults', { 
      organizationId: testOrgId,
      filter: filter
    });
    
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.stats) {
      console.log(`📊 Results for "${filter}": Imported ${response.data.stats.imported}/${response.data.stats.total}`);
    }
    
    results.push({
      filter,
      success: response.data.success && response.data.stats?.imported > 0
    });
  }
  
  const allPassed = results.every(r => r.success);
  console.log(`\n${allPassed ? '✅' : '❌'} Import-defaults test ${allPassed ? 'PASSED' : 'FAILED'}\n`);
  return allPassed;
}

async function verifyTemplateStructure() {
  console.log('\n=====================================');
  console.log('🔍 VERIFYING TEMPLATE STRUCTURE');
  console.log('=====================================\n');
  
  const response = await makeRequest('GET', `/api/test/kra/verify/${testOrgId}`);
  
  console.log('Status Code:', response.status);
  console.log('Response:', JSON.stringify(response.data, null, 2));
  
  if (response.data.templates) {
    console.log('\n📊 Template Structure Summary:');
    console.log(`   - Total templates: ${response.data.totalTemplates}`);
    console.log(`   - Templates with issues: ${response.data.templatesWithIssues}`);
    console.log(`   - Total issues: ${response.data.totalIssues}`);
    
    if (response.data.templatesWithIssues > 0) {
      console.log('\n⚠️ Templates with issues:');
      response.data.templates
        .filter(t => t.hasIssues)
        .forEach(t => {
          console.log(`   - ${t.name}:`);
          t.issues.forEach(issue => console.log(`     • ${issue}`));
        });
    }
  }
  
  const success = response.data.templatesWithIssues === 0;
  console.log(`\n${success ? '✅' : '❌'} Structure verification ${success ? 'PASSED' : 'FAILED'}\n`);
  return success;
}

// Main test runner
async function runTests() {
  console.log('\n🧪 KRA TEMPLATE IMPORT TEST SUITE');
  console.log('=====================================');
  console.log(new Date().toISOString());
  
  const results = {
    setup: false,
    importFallback: false,
    importAll: false,
    importDefaults: false,
    verification: false
  };
  
  try {
    // Setup test environment
    results.setup = await setupTestEnvironment();
    if (!results.setup) {
      console.error('❌ Failed to setup test environment, aborting tests');
      return;
    }
    
    // Clean up any existing templates first
    await cleanupExistingTemplates();
    
    // Test import-fallback endpoint
    results.importFallback = await testImportFallback();
    
    // Test import-all endpoint
    results.importAll = await testImportAll();
    
    // Test import-defaults endpoint
    results.importDefaults = await testImportDefaults();
    
    // Import all templates for verification
    await makeRequest('POST', '/api/test/kra/import-all', { organizationId: testOrgId });
    
    // Verify template structure
    results.verification = await verifyTemplateStructure();
    
  } catch (error) {
    console.error('\n❌ Test suite error:', error);
  }
  
  // Print final results
  console.log('\n=====================================');
  console.log('📊 FINAL TEST RESULTS');
  console.log('=====================================\n');
  
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`   ${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSED' : 'FAILED'}`);
  });
  
  const allPassed = Object.values(results).every(r => r === true);
  console.log(`\n🏁 Overall Result: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);
  
  // Final cleanup
  if (testOrgId) {
    console.log('🧹 Final cleanup...');
    await cleanupExistingTemplates();
  }
}

// Run the tests
runTests().catch(console.error);