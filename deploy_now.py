#!/usr/bin/env python3
"""
Deploy Marie Kondo Email to CreateOS
"""
import os
import sys
import json

# Add the CreateOS SDK to path
sys.path.insert(0, '/Users/mac/Documents/Nodeops/marie-kondo-email/.claude/skills/createos/scripts')

# Try importing, if requests is not available, we'll install it
try:
    from createos import CreateOS
except ImportError as e:
    print(f"Error importing CreateOS SDK: {e}")
    print("Installing requests...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
    from createos import CreateOS

# Set API key
API_KEY = "skp_33Y9U0e767f2k9T1lHP3Q918SDdeVm85_4060937166"

print("🚀 Deploying Marie Kondo Email to CreateOS...")
print("=" * 60)

# Initialize CreateOS client
client = CreateOS(api_key=API_KEY)

# Check if project already exists
print("\n📋 Checking for existing project...")
try:
    projects = client.list_projects()
    existing = None
    for p in projects:
        if p.get('uniqueName') == 'marie-kondo-email':
            existing = p
            break

    if existing:
        print(f"✓ Found existing project: {existing['id']}")
        project_id = existing['id']
    else:
        # Create new project
        print("\n📦 Creating new project...")
        project = client.create_project(
            unique_name="marie-kondo-email",
            display_name="Marie Kondo Email",
            project_type="upload",
            settings={
                "framework": "express",
                "runtime": "node:20",
                "port": 3000,
                "installCommand": "npm install --production",
                "buildCommand": "",  # Already built
                "runCommand": "node dist/server/index.js"
            }
        )
        project_id = project['id']
        print(f"✓ Project created: {project_id}")

except Exception as e:
    print(f"❌ Error with project: {e}")
    sys.exit(1)

# Collect files to upload
print("\n📁 Collecting files to upload...")
files_to_upload = {}

import pathlib

# Include package.json and package-lock.json for npm install
for file in ['package.json', 'package-lock.json', '.env.example']:
    path = pathlib.Path(file)
    if path.exists():
        with open(path, 'r') as f:
            files_to_upload[file] = f.read()

# Include all dist files
dist_path = pathlib.Path('dist')
if dist_path.exists():
    for file_path in dist_path.rglob('*'):
        if file_path.is_file():
            rel_path = file_path.relative_to('.')
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    files_to_upload[str(rel_path)] = f.read()
            except:
                # Binary files - skip for now or handle differently
                pass

print(f"✓ Collected {len(files_to_upload)} files")

# Upload files and deploy
print("\n🚀 Uploading files and deploying...")
try:
    deployment = client.upload_files(project_id, files_to_upload)
    deployment_id = deployment.get('id')
    print(f"✓ Deployment created: {deployment_id}")
    print(f"✓ Status: {deployment.get('status')}")

    # Get deployment URL
    print("\n" + "=" * 60)
    print("🎉 Deployment initiated successfully!")
    print("=" * 60)
    print(f"\n📍 Project URL: https://marie-kondo-email.createos.io")
    print(f"🔗 Dashboard: https://createos.nodeops.network")
    print(f"\n⏳ Your deployment is being built and will be live shortly.")
    print(f"   Status: {deployment.get('status')}")

    if deployment.get('status') == 'building':
        print("\n💡 The build process may take a few minutes.")
        print("   You can check the build logs in the CreateOS dashboard.")

    print("\n⚠️  IMPORTANT: After deployment is live, you'll need to:")
    print("   1. Set up environment variables in CreateOS dashboard:")
    print("      - GMAIL_CLIENT_ID")
    print("      - GMAIL_CLIENT_SECRET")
    print("      - SESSION_SECRET")
    print("      - ENCRYPTION_KEY")
    print("   2. Update GMAIL_REDIRECT_URI to: https://marie-kondo-email.createos.io/api/auth/callback")

except Exception as e:
    print(f"❌ Deployment failed: {e}")
    if hasattr(e, 'response'):
        print(f"Response: {e.response}")
    sys.exit(1)
