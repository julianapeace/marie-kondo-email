-- Marie Kondo Email Triage Database Schema

-- Users table for OAuth and session management
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    picture TEXT,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    token_expiry INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email metadata cache
CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    gmail_id TEXT UNIQUE NOT NULL,
    thread_id TEXT NOT NULL,
    subject TEXT,
    from_email TEXT NOT NULL,
    from_name TEXT,
    to_email TEXT NOT NULL,
    date DATETIME NOT NULL,
    snippet TEXT,
    is_promotional BOOLEAN DEFAULT 0,
    is_read BOOLEAN DEFAULT 0,
    has_attachments BOOLEAN DEFAULT 0,
    labels TEXT, -- JSON array of label IDs
    size_bytes INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for email queries
CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_gmail_id ON emails(gmail_id);
CREATE INDEX IF NOT EXISTS idx_emails_from_email ON emails(from_email);
CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date DESC);
CREATE INDEX IF NOT EXISTS idx_emails_promotional ON emails(is_promotional);

-- Triage queue for pending actions
CREATE TABLE IF NOT EXISTS triage_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    email_id INTEGER NOT NULL,
    action_type TEXT NOT NULL CHECK(action_type IN ('archive', 'unsubscribe', 'archive_and_unsubscribe', 'review')),
    confidence_score INTEGER NOT NULL CHECK(confidence_score >= 0 AND confidence_score <= 100),
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'executed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
);

-- Indexes for triage queue
CREATE INDEX IF NOT EXISTS idx_triage_user_status ON triage_queue(user_id, status);
CREATE INDEX IF NOT EXISTS idx_triage_email_id ON triage_queue(email_id);

-- Unsubscribe links and methods
CREATE TABLE IF NOT EXISTS unsubscribe_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id INTEGER NOT NULL,
    method_type TEXT NOT NULL CHECK(method_type IN ('one-click', 'https', 'mailto')),
    url TEXT,
    email_address TEXT,
    confidence INTEGER DEFAULT 100 CHECK(confidence >= 0 AND confidence <= 100),
    status TEXT NOT NULL DEFAULT 'detected' CHECK(status IN ('detected', 'pending', 'completed', 'failed')),
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed_at DATETIME,
    FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
);

-- Indexes for unsubscribe methods
CREATE INDEX IF NOT EXISTS idx_unsubscribe_email_id ON unsubscribe_methods(email_id);
CREATE INDEX IF NOT EXISTS idx_unsubscribe_status ON unsubscribe_methods(status);

-- Action log for audit trail
CREATE TABLE IF NOT EXISTS action_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
    error_message TEXT,
    metadata TEXT, -- JSON object for additional data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for action log
CREATE INDEX IF NOT EXISTS idx_action_log_user_id ON action_log(user_id);
CREATE INDEX IF NOT EXISTS idx_action_log_created_at ON action_log(created_at DESC);

-- Sender statistics
CREATE TABLE IF NOT EXISTS sender_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    sender_email TEXT NOT NULL,
    sender_name TEXT,
    total_emails INTEGER DEFAULT 0,
    promotional_count INTEGER DEFAULT 0,
    archived_count INTEGER DEFAULT 0,
    unsubscribed BOOLEAN DEFAULT 0,
    last_email_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, sender_email)
);

-- Indexes for sender stats
CREATE INDEX IF NOT EXISTS idx_sender_stats_user_id ON sender_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_sender_stats_sender_email ON sender_stats(sender_email);
CREATE INDEX IF NOT EXISTS idx_sender_stats_total_emails ON sender_stats(total_emails DESC);

-- Triage sender rules (allowlist/blocklist per user)
CREATE TABLE IF NOT EXISTS triage_sender_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('allowlist', 'blocklist')),
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, kind, value),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_triage_sender_rules_user_id ON triage_sender_rules(user_id);

-- Sessions table for express-session
CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
