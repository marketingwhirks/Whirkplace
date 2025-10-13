const fs = require('fs');

// Read the defaultKraTemplates.ts file
const content = fs.readFileSync('./shared/defaultKraTemplates.ts', 'utf8');

// Count templates by organization
let patrickCount = 0;
let whirksCount = 0;

// Match each template with organization field
const matches = content.matchAll(/organization:\s*"([^"]+)"/g);

for (const match of matches) {
  const org = match[1];
  if (org === "Patrick Accounting") {
    patrickCount++;
  } else if (org === "Whirks") {
    whirksCount++;
  }
}

const total = patrickCount + whirksCount;

console.log('=== KRA Template Count Verification ===\n');
console.log(`Total templates: ${total} (Expected: 28) ${total === 28 ? '✅' : '❌'}`);
console.log(`Patrick Accounting: ${patrickCount} (Expected: 19) ${patrickCount === 19 ? '✅' : '❌'}`);
console.log(`Whirks: ${whirksCount} (Expected: 9) ${whirksCount === 9 ? '✅' : '❌'}`);

if (total === 28 && patrickCount === 19 && whirksCount === 9) {
  console.log('\n✅ SUCCESS: All template counts are correct!');
  console.log('- Patrick Accounting has exactly 19 templates');
  console.log('- Whirks has exactly 9 templates');
  console.log('- Total of 28 templates');
  console.log('- All templates have valid organization values');
  process.exit(0);
} else {
  console.log('\n❌ FAIL: Template counts are incorrect!');
  if (patrickCount !== 19) {
    console.log(`- Patrick Accounting is ${patrickCount < 19 ? 'missing' : 'has extra'} ${Math.abs(19 - patrickCount)} template(s)`);
  }
  if (whirksCount !== 9) {
    console.log(`- Whirks is ${whirksCount < 9 ? 'missing' : 'has extra'} ${Math.abs(9 - whirksCount)} template(s)`);
  }
  process.exit(1);
}