# Quick Start Guide

Get Marie Kondo Email Triage running in 5 minutes!

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Google OAuth

1. Go to https://console.cloud.google.com
2. Create a new project
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Set redirect URI: `http://localhost:3000/api/auth/callback`
6. Copy Client ID and Client Secret

## Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
GMAIL_CLIENT_ID=your_client_id_here
GMAIL_CLIENT_SECRET=your_client_secret_here
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

## Step 4: Build

```bash
npm run build
```

## Step 5: Start

```bash
npm start
```

## Step 6: Open Browser

Visit: http://localhost:3000

## Verification Checklist

- [ ] Dependencies installed
- [ ] Google Cloud project created
- [ ] Gmail API enabled
- [ ] OAuth credentials created
- [ ] `.env` file configured
- [ ] Application built successfully
- [ ] Server running on port 3000
- [ ] Can access web UI
- [ ] Can login with Gmail
- [ ] Can scan emails

## Common Issues

### "Cannot find module" errors
```bash
npm install
npm run build
```

### OAuth errors
- Check Client ID and Secret in `.env`
- Verify redirect URI in Google Cloud Console
- Make sure your email is added as a test user

### Database errors
```bash
rm -rf data/
npm run build
npm start
```

## Next Steps

1. Click "Login with Gmail"
2. Authorize the application
3. Click "Scan Emails"
4. Review the Triage Queue
5. Approve suggested actions

## Need Help?

See README.md for detailed documentation.
