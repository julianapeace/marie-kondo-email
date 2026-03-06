#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = 'skp_33Y9U0e767f2k9T1lHP3Q918SDdeVm85_4060937166';
const BASE_URL = 'api-createos.nodeops.network';
const PROJECT_NAME = 'marie-kondo-email';

console.log('🚀 Deploying Marie Kondo Email to CreateOS...');
console.log('='.repeat(60));

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      port: 443,
      path: path,
      method: method,
      headers: {
        'X-Api-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

function collectFiles(dir, baseDir = dir, maxFiles = 100) {
  const files = {};
  let count = 0;

  function traverse(currentDir) {
    if (count >= maxFiles) return;

    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      if (count >= maxFiles) break;

      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (stat.isFile()) {
        try {
          const relativePath = path.relative(baseDir, fullPath);
          const content = fs.readFileSync(fullPath, 'utf8');
          files[relativePath] = content;
          count++;
        } catch (e) {
          // Skip binary files or files that can't be read as UTF-8
          console.log(`⚠️  Skipping ${fullPath}: ${e.message}`);
        }
      }
    }
  }

  traverse(dir);
  return files;
}

async function main() {
  try {
    // Step 1: Check if project exists
    console.log('\n📋 Checking for existing project...');
    const projects = await makeRequest('GET', '/v1/projects');

    let projectId = null;
    let projectsList = projects.data || projects || [];

    // Handle if data is an object with a nested array
    if (!Array.isArray(projectsList) && projectsList.data) {
      projectsList = projectsList.data;
    }

    // Ensure it's an array
    if (Array.isArray(projectsList)) {
      for (const project of projectsList) {
        if (project.uniqueName === PROJECT_NAME) {
          projectId = project.id;
          break;
        }
      }
    } else {
      console.log('⚠️  Could not parse projects list, will create new project');
    }

    // Step 2: Create project if it doesn't exist
    if (!projectId) {
      console.log('📦 Creating new project...');
      const createResult = await makeRequest('POST', '/v1/projects', {
        uniqueName: PROJECT_NAME,
        displayName: 'Marie Kondo Email',
        type: 'upload',
        source: {},
        settings: {
          runtime: 'node:20',
          port: 3000,
          installCommand: 'npm install --production',
          buildCommand: '',
          runCommand: 'node dist/server/index.js',
          useBuildAI: true
        }
      });

      projectId = createResult.data.id;
      console.log(`✓ Project created: ${projectId}`);
    } else {
      console.log(`✓ Found existing project: ${projectId}`);
    }

    // Step 3: Collect files
    console.log('\n📁 Collecting files to upload...');
    const files = {};

    // Add package files
    ['package.json', 'package-lock.json'].forEach(file => {
      if (fs.existsSync(file)) {
        files[file] = fs.readFileSync(file, 'utf8');
      }
    });

    // Add dist files (limit to 90 files to stay under 100)
    const distFiles = collectFiles('dist', process.cwd(), 90);
    Object.assign(files, distFiles);

    console.log(`✓ Collected ${Object.keys(files).length} files`);

    // Step 4: Upload files
    console.log('\n🚀 Uploading files and deploying...');

    const fileArray = Object.entries(files).map(([filePath, content]) => ({
      path: filePath,
      content: content
    }));

    const deployment = await makeRequest(
      'PUT',
      `/v1/projects/${projectId}/deployments/files`,
      { files: fileArray }
    );

    console.log(`✓ Deployment created: ${deployment.data.id}`);
    console.log(`✓ Status: ${deployment.data.status}`);

    // Success message
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Deployment initiated successfully!');
    console.log('='.repeat(60));
    console.log('\n📍 Project URL: https://marie-kondo-email.createos.io');
    console.log('🔗 Dashboard: https://createos.nodeops.network');
    console.log(`\n⏳ Your deployment is being built (Status: ${deployment.data.status})`);
    console.log('\n💡 The build process may take a few minutes.');
    console.log('   You can check the build logs in the CreateOS dashboard.');
    console.log('\n⚠️  IMPORTANT: After deployment is live, set these environment variables:');
    console.log('   1. GMAIL_CLIENT_ID - Your Google OAuth client ID');
    console.log('   2. GMAIL_CLIENT_SECRET - Your Google OAuth client secret');
    console.log('   3. GMAIL_REDIRECT_URI - https://marie-kondo-email.createos.io/api/auth/callback');
    console.log('   4. SESSION_SECRET - A random 32-character string');
    console.log('   5. ENCRYPTION_KEY - A 32-byte hex string');
    console.log('   6. PORT - 3000');
    console.log('   7. NODE_ENV - production');

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

main();
