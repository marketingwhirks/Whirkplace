import { getTemplatesByOrganization } from './shared/defaultKraTemplates.ts';

console.log('Testing getTemplatesByOrganization function:');
console.log('--------------------------------------------');

const allTemplates = getTemplatesByOrganization('all');
console.log(`All templates: ${allTemplates.length}`);

const patrickTemplates = getTemplatesByOrganization('Patrick Accounting');
console.log(`Patrick Accounting templates: ${patrickTemplates.length}`);

const whirksTemplates = getTemplatesByOrganization('Whirks');
console.log(`Whirks templates: ${whirksTemplates.length}`);

// Test with incorrect values (should return 0)
const invalidTemplates = getTemplatesByOrganization('invalid');
console.log(`Invalid organization templates: ${invalidTemplates.length}`);

// Show first template from each org
console.log('\nFirst template from Patrick Accounting:');
if (patrickTemplates.length > 0) {
  console.log({
    name: patrickTemplates[0].name,
    organization: patrickTemplates[0].organization,
    category: patrickTemplates[0].category
  });
}

console.log('\nFirst template from Whirks:');
if (whirksTemplates.length > 0) {
  console.log({
    name: whirksTemplates[0].name,
    organization: whirksTemplates[0].organization,
    category: whirksTemplates[0].category
  });
}

// Test that "Patrick" doesn't match "Patrick Accounting"
const wrongPatrick = getTemplatesByOrganization('Patrick');
console.log(`\nTesting wrong capitalization: 'Patrick' returns ${wrongPatrick.length} templates (should be 0)`);

// Test that "patrick" doesn't match "Patrick Accounting" 
const lowerPatrick = getTemplatesByOrganization('patrick');
console.log(`Testing lowercase: 'patrick' returns ${lowerPatrick.length} templates (should be 0)`);