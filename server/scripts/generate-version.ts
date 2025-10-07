import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Function to get git commit hash
function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch (e) {
    return 'unknown';
  }
}

// Function to get git branch
function getGitBranch() {
  try {
    return execSync('git branch --show-current').toString().trim();
  } catch (e) {
    return 'unknown';
  }
}

// Generate version info
const versionInfo = {
  buildTime: new Date().toISOString(),
  buildNumber: process.env.BUILD_NUMBER || Date.now().toString(),
  version: process.env.VERSION || '1.0.0',
  gitCommit: getGitCommit(),
  gitBranch: getGitBranch(),
  environment: process.env.NODE_ENV || 'development',
  builder: process.env.USER || process.env.USERNAME || 'unknown',
  buildMachine: process.env.HOSTNAME || 'unknown',
};

// Write version.json to client directory so it's served by Vite
// In Vite, files in the root client directory are served as static files
const clientDir = path.join(process.cwd(), 'client');
const versionFile = path.join(clientDir, 'version.json');
fs.writeFileSync(versionFile, JSON.stringify(versionInfo, null, 2));

console.log(`✅ Version file generated at: ${versionFile}`);
console.log(`Build info:`, versionInfo);