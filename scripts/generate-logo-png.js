import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the sizes we want to generate
const sizes = [
  { size: 16, name: 'logo-16.png' },      // Favicon small
  { size: 32, name: 'logo-32.png' },      // Favicon
  { size: 64, name: 'logo-64.png' },      // Small icon
  { size: 128, name: 'logo-128.png' },    // Medium icon  
  { size: 192, name: 'logo-192.png' },    // PWA icon
  { size: 512, name: 'logo-512.png' },    // Large icon
  { size: 1024, name: 'logo-1024.png' },  // Extra large
];

// Path to the SVG file
const svgPath = path.join(__dirname, '..', 'icon.svg');
const outputDir = path.join(__dirname, '..', 'client', 'src', 'assets');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Read the SVG file
const svgBuffer = fs.readFileSync(svgPath);

async function generatePNGs() {
  console.log('🎨 Starting logo PNG generation...');
  
  for (const { size, name } of sizes) {
    const outputPath = path.join(outputDir, name);
    
    try {
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);
        
      console.log(`✅ Generated ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`❌ Error generating ${name}:`, error.message);
    }
  }
  
  console.log('\n🎉 Logo PNG generation complete!');
  console.log(`📁 Files saved to: ${outputDir}`);
}

// Run the generation
generatePNGs().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});