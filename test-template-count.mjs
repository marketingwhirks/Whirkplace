#!/usr/bin/env node

import fs from 'fs';

// Read the file
const fileContent = fs.readFileSync('./shared/defaultKraTemplates.ts', 'utf-8');

// Extract the templates array
const templateStart = fileContent.indexOf('export const DEFAULT_KRA_TEMPLATES');
const templateEnd = fileContent.lastIndexOf('];');
const templateSection = fileContent.slice(templateStart, templateEnd + 2);

// Count templates by organization using regex
const patrickTemplates = [];
const whirksTemplates = [];
const unknownTemplates = [];

// Match each template object
const templateMatches = templateSection.matchAll(/\{\s*name:\s*"([^"]+)"[\s\S]*?organization:\s*"([^"]+)"[\s\S]*?jobTitle:\s*"([^"]+)"/g);

for (const match of templateMatches) {
  const [, name, org, jobTitle] = match;
  const template = { name, organization: org, jobTitle };
  
  if (org === "Patrick Accounting") {
    patrickTemplates.push(template);
  } else if (org === "Whirks") {
    whirksTemplates.push(template);
  } else {
    unknownTemplates.push(template);
  }
}

console.log(`\n=== Template Count Analysis ===`);
console.log(`Total templates found: ${patrickTemplates.length + whirksTemplates.length + unknownTemplates.length}`);
console.log(`Patrick Accounting: ${patrickTemplates.length} (should be 19)`);
console.log(`Whirks: ${whirksTemplates.length} (should be 9)`);
console.log(`Unknown/Invalid org: ${unknownTemplates.length}\n`);

if (patrickTemplates.length !== 19) {
  console.log(`❌ Patrick Accounting is missing ${19 - patrickTemplates.length} templates`);
}
if (whirksTemplates.length !== 9) {
  console.log(`❌ Whirks is missing ${9 - whirksTemplates.length} templates`);
}
if (unknownTemplates.length > 0) {
  console.log(`❌ Found templates with invalid organization:`);
  unknownTemplates.forEach(t => console.log(`   - ${t.name} (org: ${t.organization})`));
}

console.log(`\n=== Patrick Accounting Templates (${patrickTemplates.length}) ===`);
patrickTemplates.forEach((t, i) => console.log(`${i + 1}. ${t.name} - ${t.jobTitle}`));

console.log(`\n=== Whirks Templates (${whirksTemplates.length}) ===`);
whirksTemplates.forEach((t, i) => console.log(`${i + 1}. ${t.name} - ${t.jobTitle}`));

// Check attached_assets for PATS files to see what might be missing
const patsFiles = [
  "Production Admin",
  "Firm Administrator", 
  "Marketing Manager",
  "Sales & Business Development Rep",
  "Senior Staff Accountant",
  "Staff Accountant",
  "Team Lead ATM",
  "Strategic Financial Controller",
  "Videographer",
  "Accounting and Tax Manager",
  "BOSS Coordinator",
  "Digital Marketing Specialist",
  "Director of People Services",
  "Client Care Coordinator",
  "Director of Accounting",
  "Director of Tax",
  "Director of Business Development"
];

console.log(`\n=== Cross-checking with expected PATS roles ===`);
const foundPatsRoles = patrickTemplates.map(t => t.jobTitle);
const missingFromExpected = patsFiles.filter(role => 
  !foundPatsRoles.some(found => found.includes(role))
);

if (missingFromExpected.length > 0) {
  console.log(`Missing expected PATS roles:`);
  missingFromExpected.forEach(r => console.log(`   - ${r}`));
} else {
  console.log(`All expected PATS roles are present in templates`);
}

// Look for potential duplicates
console.log(`\n=== Checking for duplicate job titles ===`);
const allTemplates = [...patrickTemplates, ...whirksTemplates];
const titleCounts = {};
allTemplates.forEach(t => {
  if (titleCounts[t.jobTitle]) {
    titleCounts[t.jobTitle]++;
  } else {
    titleCounts[t.jobTitle] = 1;
  }
});

const duplicates = Object.entries(titleCounts).filter(([, count]) => count > 1);
if (duplicates.length > 0) {
  console.log(`Found duplicate job titles:`);
  duplicates.forEach(([title, count]) => console.log(`   - "${title}" appears ${count} times`));
} else {
  console.log(`No duplicate job titles found`);
}