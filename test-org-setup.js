const puppeteer = require('puppeteer');
const path = require('path');

async function testOrganizationSetup() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  try {
    // Step 1: Landing Page
    console.log('📸 Step 1: Landing Page');
    await page.goto('http://localhost:5000');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'step1-landing-page.png', fullPage: true });
    
    // Step 2: Click "Start Your Free Trial"
    console.log('📸 Step 2: Clicking Start Your Free Trial');
    await page.click('[data-testid="button-start-trial"]');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'step2-signup-form.png', fullPage: true });
    
    // Step 3: Fill in organization details
    console.log('📸 Step 3: Filling organization details');
    await page.type('[data-testid="input-company-name"]', 'Test Restaurant Co');
    await page.type('[data-testid="input-admin-name"]', 'John Manager');
    await page.type('[data-testid="input-admin-email"]', 'john@testrestaurant.com');
    await page.type('[data-testid="input-password"]', 'SecurePass123!');
    await page.type('[data-testid="input-confirm-password"]', 'SecurePass123!');
    await page.screenshot({ path: 'step3-filled-form.png', fullPage: true });
    
    // Step 4: Submit form
    console.log('📸 Step 4: Submitting form');
    await page.click('[data-testid="button-create-account"]');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'step4-after-submit.png', fullPage: true });
    
    // Step 5: Check for onboarding or dashboard
    console.log('📸 Step 5: Onboarding/Dashboard');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'step5-dashboard.png', fullPage: true });
    
    console.log('✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
  }
  
  await browser.close();
}

testOrganizationSetup();