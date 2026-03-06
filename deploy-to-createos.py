#!/usr/bin/env python3
"""Deploy Marie Kondo Email Triage to CreateOS"""

import sys
import os
sys.path.insert(0, '.agents/skills/createos/scripts')

from createos import CreateOS

# Configuration
API_KEY = "skp_33Y9U0e767f2k9T1lHP3Q918SDdeVm85_4060937166"
PROJECT_NAME = "marie-kondo-email"
DISPLAY_NAME = "Marie Kondo Email Triage"

def main():
    print("🚀 Deploying Marie Kondo Email Triage to CreateOS...")

    # Initialize CreateOS client
    client = CreateOS(api_key=API_KEY)

    # Step 1: Get GitHub accounts
    print("\n📦 Step 1: Getting GitHub accounts...")
    try:
        github_accounts = client._request("GET", "/v1/github/connected-accounts")
        print(f"✓ Found {len(github_accounts)} GitHub account(s)")

        if not github_accounts:
            print("❌ No GitHub accounts connected. Please connect GitHub at https://createos.io")
            return

        installation_id = github_accounts[0]["installationId"]
        print(f"✓ Using GitHub installation: {installation_id}")

    except Exception as e:
        print(f"❌ Error getting GitHub accounts: {e}")
        return

    # Step 2: Get repository ID
    print("\n📦 Step 2: Finding repository...")
    try:
        repos = client._request("GET", f"/v1/github/repositories?installationId={installation_id}")

        # Find our repo
        repo = next((r for r in repos if "marie-kondo-email" in r.get("fullName", "")), None)

        if not repo:
            print(f"❌ Repository 'marie-kondo-email' not found")
            print(f"Available repos: {[r.get('fullName') for r in repos]}")
            return

        repo_id = repo["id"]
        repo_name = repo["fullName"]
        print(f"✓ Found repository: {repo_name} (ID: {repo_id})")

    except Exception as e:
        print(f"❌ Error finding repository: {e}")
        return

    # Step 3: Create project
    print("\n📦 Step 3: Creating CreateOS project...")
    try:
        project = client.create_vcs_project(
            unique_name=PROJECT_NAME,
            display_name=DISPLAY_NAME,
            installation_id=installation_id,
            repo_id=repo_id,
            runtime="node:20",
            port=3000,
            installCommand="npm install",
            buildCommand="npm run build",
            runCommand="npm start",
            framework="express"
        )

        project_id = project["id"]
        print(f"✓ Project created: {project_id}")

    except Exception as e:
        print(f"❌ Error creating project: {e}")
        # Check if project already exists
        try:
            projects = client._request("GET", "/v1/projects")
            existing = next((p for p in projects if p.get("uniqueName") == PROJECT_NAME), None)
            if existing:
                project_id = existing["id"]
                print(f"ℹ️  Using existing project: {project_id}")
            else:
                return
        except:
            return

    # Step 4: Set environment variables
    print("\n📦 Step 4: Setting environment variables...")
    try:
        # Read .env file
        env_vars = {}
        if os.path.exists('.env'):
            with open('.env', 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        env_vars[key] = value

        # Update redirect URI for production
        env_vars['GMAIL_REDIRECT_URI'] = f'https://{PROJECT_NAME}.createos.io/api/auth/callback'
        env_vars['NODE_ENV'] = 'production'

        client._request("POST", f"/v1/projects/{project_id}/env-vars", json={"envVars": env_vars})
        print(f"✓ Set {len(env_vars)} environment variables")

    except Exception as e:
        print(f"⚠️  Warning: Could not set env vars: {e}")

    # Step 5: Trigger deployment
    print("\n📦 Step 5: Triggering deployment...")
    try:
        deployment = client._request("POST", f"/v1/projects/{project_id}/deploy", json={})
        deployment_id = deployment.get("id", "unknown")
        print(f"✓ Deployment triggered: {deployment_id}")

    except Exception as e:
        print(f"❌ Error triggering deployment: {e}")
        return

    # Success!
    print("\n" + "="*60)
    print("✨ Deployment complete!")
    print("="*60)
    print(f"\n🌐 Your app will be available at:")
    print(f"   https://{PROJECT_NAME}.createos.io")
    print(f"\n📊 Dashboard:")
    print(f"   https://createos.io/projects/{project_id}")
    print(f"\n⚙️  IMPORTANT: Update your Google OAuth redirect URI to:")
    print(f"   https://{PROJECT_NAME}.createos.io/api/auth/callback")
    print("\n💡 The app will auto-deploy on every git push!")
    print()

if __name__ == "__main__":
    main()
