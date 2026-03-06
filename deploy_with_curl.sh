#!/bin/bash

# Deploy Marie Kondo Email to CreateOS using REST API

API_KEY="skp_33Y9U0e767f2k9T1lHP3Q918SDdeVm85_4060937166"
BASE_URL="https://api-createos.nodeops.network"
PROJECT_NAME="marie-kondo-email"

echo "🚀 Deploying Marie Kondo Email to CreateOS..."
echo "============================================================"

# Check if project exists
echo ""
echo "📋 Checking for existing project..."
PROJECTS=$(curl -s -X GET "$BASE_URL/v1/projects" \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json")

PROJECT_ID=$(echo "$PROJECTS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    projects = data.get('data', [])
    for p in projects:
        if p.get('uniqueName') == '$PROJECT_NAME':
            print(p['id'])
            break
except:
    pass
" 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
    echo "📦 Creating new project..."

    CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/projects" \
      -H "X-Api-Key: $API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "uniqueName": "marie-kondo-email",
        "displayName": "Marie Kondo Email",
        "type": "upload",
        "source": {},
        "settings": {
          "framework": "express",
          "runtime": "node:20",
          "port": 3000,
          "installCommand": "npm install --production",
          "buildCommand": "",
          "runCommand": "node dist/server/index.js"
        }
      }')

    PROJECT_ID=$(echo "$CREATE_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('data', {}).get('id', ''))
except Exception as e:
    print(f'Error: {e}', file=sys.stderr)
    print(data if 'data' in locals() else sys.stdin.read(), file=sys.stderr)
" 2>&1)

    if [ -z "$PROJECT_ID" ]; then
        echo "❌ Failed to create project"
        echo "$CREATE_RESPONSE"
        exit 1
    fi

    echo "✓ Project created: $PROJECT_ID"
else
    echo "✓ Found existing project: $PROJECT_ID"
fi

echo ""
echo "============================================================"
echo "🎉 Project setup complete!"
echo "============================================================"
echo ""
echo "📍 Project ID: $PROJECT_ID"
echo "🔗 Project URL: https://marie-kondo-email.createos.io"
echo "🌐 Dashboard: https://createos.nodeops.network/projects/$PROJECT_ID"
echo ""
echo "⚠️  NOTE: File upload via REST API requires creating a deployment"
echo "   with all files. This is better done through the CreateOS dashboard"
echo "   or by connecting to GitHub for automatic deployments."
echo ""
echo "📝 Next steps:"
echo "   1. Go to: https://createos.nodeops.network/projects/$PROJECT_ID"
echo "   2. Click 'Upload Files' or 'Deploy'"
echo "   3. Upload your dist/ folder contents"
echo "   4. Or use the CreateOS CLI for easier file uploads"
echo ""
