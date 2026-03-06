# Marie Kondo Email Triage

A standalone web-based email triage application that helps you declutter your Gmail inbox with smart categorization, unsubscribe detection, and bulk archiving.

## Features

- **Smart Email Scanning**: Automatically scans your Gmail inbox and promotional emails
- **Unsubscribe Detection**: Detects unsubscribe methods using RFC 2369/8058 headers and HTML parsing
- **Intelligent Triage**: Scores emails based on age, sender frequency, and user behavior
- **Bulk Actions**: Archive multiple emails with one click
- **Gmail Labels**: Automatically applies labels for organization
- **Safe Operations**: Never deletes emails without explicit permission
- **Privacy-First**: All data stored locally on your machine
- **Real-time Progress**: Live updates during email scanning

## Architecture

### Backend
- Node.js + TypeScript + Express.js
- SQLite (sql.js) for local data storage
- Gmail API for email operations
- OAuth 2.0 for authentication

### Frontend
- Vanilla TypeScript (no framework)
- Modern DOM APIs
- Server-Sent Events for progress updates
- Responsive design

## Prerequisites

- Node.js 18 or higher
- Gmail account
- Google Cloud Console account (for OAuth credentials)

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd marie-kondo-email
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Gmail API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click "Enable"
4. Configure OAuth consent screen:
   - Navigate to "APIs & Services" > "OAuth consent screen"
   - Choose "External" user type
   - Fill in required fields:
     - App name: "Marie Kondo Email Triage"
     - User support email: Your email
     - Developer contact: Your email
   - Add scopes:
     - `https://www.googleapis.com/auth/gmail.modify`
     - `https://www.googleapis.com/auth/gmail.labels`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`
   - Add test users (your Gmail address)
5. Create OAuth 2.0 credentials:
   - Navigate to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: "Web application"
   - Name: "Marie Kondo Email Client"
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback`
   - Click "Create"
   - Copy the Client ID and Client Secret

### 4. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# Gmail OAuth Credentials
GMAIL_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Session Configuration
SESSION_SECRET=your_random_32_character_string_here

# Database Configuration
DATABASE_PATH=./data/database.sqlite

# Server Configuration
PORT=3000
NODE_ENV=development

# Security (will be auto-generated if not provided)
ENCRYPTION_KEY=your_32_byte_hex_string_here
```

Generate secure random strings for `SESSION_SECRET` and `ENCRYPTION_KEY`:

```bash
# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Build the Application

```bash
npm run build
```

### 6. Start the Server

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Usage

### 1. Login

1. Open http://localhost:3000 in your browser
2. Click "Login with Gmail"
3. Authenticate with your Google account
4. Grant the requested permissions

### 2. Scan Emails

1. Click "Scan Emails" on the dashboard
2. Watch the progress bar as emails are scanned
3. The app will:
   - Fetch emails from your inbox and promotions
   - Detect promotional emails
   - Find unsubscribe links
   - Generate triage suggestions

### 3. Review Triage Queue

1. Navigate to "Triage Queue"
2. Review suggested actions for each email:
   - **Archive**: Remove from inbox (keeps in Gmail)
   - **Unsubscribe**: Attempt to unsubscribe
   - **Archive & Unsubscribe**: Both actions
3. Each suggestion includes:
   - Confidence score (0-100)
   - Reason for suggestion
   - Email details

### 4. Approve Actions

**Single Approval:**
- Click "Approve" on individual items
- Click "Reject" to dismiss suggestions

**Bulk Approval:**
1. Check the boxes next to items you want to approve
2. Click "Approve Selected" at the top
3. All selected items will be processed

### 5. Unsubscribe

The app detects three types of unsubscribe methods:

1. **One-Click (RFC 8058)**: Automatically executed via POST request
2. **HTTPS Link**: Opens in your browser (you complete the process)
3. **mailto**: Generates an unsubscribe email (via Gmail API or manual)

### 6. View Statistics

Dashboard shows:
- Total emails scanned
- Emails archived
- Successful unsubscribes
- Pending triage items
- Top senders by volume

## API Endpoints

### Authentication
- `GET /api/auth/login` - Get OAuth URL
- `GET /api/auth/callback` - OAuth callback
- `GET /api/auth/status` - Check auth status
- `POST /api/auth/logout` - Logout

### Emails
- `GET /api/emails/scan` - Start email scan (SSE)
- `GET /api/emails` - List scanned emails
- `GET /api/emails/:id` - Get email details

### Triage
- `GET /api/triage/queue` - Get triage queue
- `POST /api/triage/approve/:id` - Approve item
- `POST /api/triage/reject/:id` - Reject item
- `POST /api/triage/bulk-approve` - Bulk approve

### Unsubscribe
- `GET /api/unsubscribe/:emailId` - Get unsubscribe methods
- `POST /api/unsubscribe/execute` - Execute unsubscribe

### Statistics
- `GET /api/stats/overview` - Dashboard stats
- `GET /api/stats/actions` - Action log
- `GET /api/stats/senders` - Sender statistics

## Database Schema

The app uses SQLite with the following tables:

- `users` - User accounts and encrypted OAuth tokens
- `emails` - Email metadata cache
- `triage_queue` - Pending triage suggestions
- `unsubscribe_methods` - Detected unsubscribe methods
- `action_log` - Audit trail of all actions
- `sender_stats` - Statistics per sender
- `sessions` - Session data

Database location: `./data/database.sqlite`

## Security Features

- **Token Encryption**: OAuth tokens encrypted with AES-256
- **HTTP-only Cookies**: Session cookies protected from XSS
- **Rate Limiting**: 100 requests per minute per IP
- **CSRF Protection**: Via session middleware
- **Input Validation**: All user inputs validated
- **SQL Injection Prevention**: Parameterized queries only
- **URL Validation**: Only HTTPS unsubscribe links allowed
- **Local Storage**: All data stored on your machine

## Triage Algorithm

The app scores emails (0-100) based on:

1. **Promotional flags** (+30): Gmail category labels
2. **Unsubscribe availability** (+20): Has List-Unsubscribe header or link
3. **Email age** (+25): Older than 6 months
4. **Sender frequency** (+15): More than 50 emails from sender
5. **User history** (+40): User has archived this sender before

**Action thresholds:**
- **80+**: Archive + Unsubscribe
- **60-79**: Archive only
- **40-59**: Review
- **<40**: Keep in inbox

## Troubleshooting

### OAuth Authentication Fails

1. Verify OAuth credentials in `.env`
2. Check redirect URI matches Google Cloud Console
3. Ensure Gmail API is enabled
4. Add your email as a test user

### Database Errors

1. Ensure `./data/` directory exists
2. Check file permissions
3. Delete `database.sqlite` to reset (will lose data)

### Scan Fails

1. Check Gmail API quota (free tier: 1 billion quota units/day)
2. Verify OAuth scopes are correct
3. Check network connectivity
4. Review server logs

### Unsubscribe Not Working

1. One-Click may not be supported by all senders
2. HTTPS links require manual completion
3. Some unsubscribe links may be invalid

## Development

### Project Structure

```
marie-kondo-email/
├── src/
│   ├── server/
│   │   ├── config/          # Configuration
│   │   ├── database/        # Database schema
│   │   ├── middleware/      # Express middleware
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   └── index.ts         # Server entry
│   ├── client/
│   │   ├── js/              # Frontend TypeScript
│   │   ├── styles/          # CSS
│   │   └── index.html       # HTML
│   └── shared/
│       └── types.ts         # Shared types
├── data/                    # SQLite database
├── dist/                    # Compiled output
└── package.json
```

### Scripts

- `npm run build` - Build backend and frontend
- `npm run dev` - Development mode with auto-reload
- `npm start` - Start production server

### Adding Features

1. Backend: Add service in `src/server/services/`
2. Routes: Add route in `src/server/routes/`
3. Frontend: Update `src/client/js/app.ts`
4. Types: Add types to `src/shared/types.ts`

## Known Limitations

- Gmail API free tier rate limits
- OAuth consent screen shows "unverified app" warning (normal for development)
- One-Click unsubscribe depends on sender support
- Maximum 500 emails per scan (configurable)

## Privacy & Data

- All data stored locally on your machine
- No cloud backend or third-party services
- Direct connection to Gmail API only
- You can delete all data by removing `./data/` directory
- OAuth tokens encrypted in database

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
1. Check this README
2. Review server console logs
3. Check browser console for errors
4. Open an issue on GitHub

## Future Enhancements

- Advanced filtering and search
- Configurable triage rules
- Email content preview
- Export reports (CSV/PDF)
- Machine learning for personalized triage
- Scheduled automatic scans
- Multi-account support
- Mobile app

---

Made with ❤️ to help you spark joy in your inbox!
# marie-kondo-email
