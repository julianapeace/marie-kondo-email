import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env from project root (works when run from dist/ or any cwd)
const envPath = path.resolve(__dirname, '..', '..', '..', '.env');
dotenv.config({ path: envPath });
if (!process.env.GMAIL_CLIENT_ID) {
  dotenv.config();
}

function loadFromClientSecret(): { clientId: string; clientSecret: string } | null {
  const paths = [
    path.join(process.cwd(), 'client_secret.json'),
    path.join(process.cwd(), '..', 'client_secret.json')
  ];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        const creds = data.installed || data.web;
        if (creds?.client_id && creds?.client_secret) {
          return { clientId: creds.client_id, clientSecret: creds.client_secret };
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

const fromEnv = {
  clientId: process.env.GMAIL_CLIENT_ID || '',
  clientSecret: process.env.GMAIL_CLIENT_SECRET || ''
};
const fromFile = !fromEnv.clientId ? loadFromClientSecret() : null;

export const gmailConfig = {
  clientId: fromEnv.clientId || fromFile?.clientId || '',
  clientSecret: fromEnv.clientSecret || fromFile?.clientSecret || '',
  redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/api/auth/callback',
  scopes: [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ]
};

if (!gmailConfig.clientId) {
  throw new Error(
    'Missing GMAIL_CLIENT_ID. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env, or place client_secret.json (with installed.client_id and client_secret) in the project root.'
  );
}

export default gmailConfig;
