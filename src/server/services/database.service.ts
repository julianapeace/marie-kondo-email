import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class DatabaseService {
  private db!: Database;
  private encryptionKey: Buffer;
  private dbPath: string;
  private SQL: any;

  constructor(dbPath: string, encryptionKey: string) {
    this.dbPath = dbPath;
    this.encryptionKey = Buffer.from(encryptionKey, 'hex');
  }

  async initialize(): Promise<void> {
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize sql.js
    this.SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
      this.initializeSchema();
      this.save();
    }

    this.initializeSchema();
  }

  private initializeSchema(): void {
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    this.db.run(schema);
    this.save();
  }

  private save(): void {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, data);
  }

  // Encryption utilities for OAuth tokens
  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // User operations
  createOrUpdateUser(email: string, name?: string, picture?: string): any {
    const stmt = this.db.prepare(`
      INSERT INTO users (email, name, picture, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        picture = excluded.picture,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `);
    stmt.bind([email, name || null, picture || null]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    this.save();
    return result;
  }

  getUserByEmail(email: string): any {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    stmt.bind([email]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
  }

  getUserById(id: number): any {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    stmt.bind([id]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
  }

  updateUserTokens(userId: number, accessToken: string, refreshToken?: string, expiryDate?: number): void {
    const encryptedAccess = this.encrypt(accessToken);
    const encryptedRefresh = refreshToken ? this.encrypt(refreshToken) : null;

    const stmt = this.db.prepare(`
      UPDATE users
      SET access_token_encrypted = ?,
          refresh_token_encrypted = ?,
          token_expiry = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.bind([encryptedAccess, encryptedRefresh, expiryDate || null, userId]);
    stmt.step();
    stmt.free();
    this.save();
  }

  getUserTokens(userId: number): { accessToken: string; refreshToken?: string; expiryDate?: number } | null {
    const stmt = this.db.prepare(`
      SELECT access_token_encrypted, refresh_token_encrypted, token_expiry
      FROM users WHERE id = ?
    `);
    stmt.bind([userId]);
    const result: any = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (!result || !result.access_token_encrypted) {
      return null;
    }

    return {
      accessToken: this.decrypt(result.access_token_encrypted),
      refreshToken: result.refresh_token_encrypted ? this.decrypt(result.refresh_token_encrypted) : undefined,
      expiryDate: result.token_expiry
    };
  }

  // Email operations
  createEmail(userId: number, emailData: {
    gmail_id: string;
    thread_id: string;
    subject?: string;
    from_email: string;
    from_name?: string;
    to_email: string;
    date: string;
    snippet?: string;
    is_promotional?: boolean;
    is_read?: boolean;
    has_attachments?: boolean;
    labels?: string[];
    size_bytes?: number;
  }): any {
    const stmt = this.db.prepare(`
      INSERT INTO emails (
        user_id, gmail_id, thread_id, subject, from_email, from_name,
        to_email, date, snippet, is_promotional, is_read, has_attachments,
        labels, size_bytes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(gmail_id) DO UPDATE SET
        subject = excluded.subject,
        is_read = excluded.is_read,
        labels = excluded.labels
      RETURNING *
    `);

    stmt.bind([
      userId,
      emailData.gmail_id,
      emailData.thread_id,
      emailData.subject || null,
      emailData.from_email,
      emailData.from_name || null,
      emailData.to_email,
      emailData.date,
      emailData.snippet || null,
      emailData.is_promotional ? 1 : 0,
      emailData.is_read ? 1 : 0,
      emailData.has_attachments ? 1 : 0,
      emailData.labels ? JSON.stringify(emailData.labels) : null,
      emailData.size_bytes || null
    ]);

    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    this.save();
    return result;
  }

  getEmailById(id: number): any {
    const stmt = this.db.prepare('SELECT * FROM emails WHERE id = ?');
    stmt.bind([id]);
    const email: any = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (email && email.labels) {
      email.labels = JSON.parse(email.labels);
    }
    return email;
  }

  getEmailByGmailId(gmailId: string): any {
    const stmt = this.db.prepare('SELECT * FROM emails WHERE gmail_id = ?');
    stmt.bind([gmailId]);
    const email: any = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (email && email.labels) {
      email.labels = JSON.parse(email.labels);
    }
    return email;
  }

  getEmails(userId: number, limit: number = 50, offset: number = 0): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM emails
      WHERE user_id = ?
      ORDER BY date DESC
      LIMIT ? OFFSET ?
    `);
    stmt.bind([userId, limit, offset]);

    const emails: any[] = [];
    while (stmt.step()) {
      const email: any = stmt.getAsObject();
      if (email.labels) {
        email.labels = JSON.parse(email.labels);
      }
      emails.push(email);
    }
    stmt.free();
    return emails;
  }

  getPromotionalEmails(userId: number, limit: number = 100): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM emails
      WHERE user_id = ? AND is_promotional = 1
      ORDER BY date DESC
      LIMIT ?
    `);
    stmt.bind([userId, limit]);

    const emails: any[] = [];
    while (stmt.step()) {
      const email: any = stmt.getAsObject();
      if (email.labels) {
        email.labels = JSON.parse(email.labels);
      }
      emails.push(email);
    }
    stmt.free();
    return emails;
  }

  // Triage queue operations
  createTriageItem(userId: number, triageData: {
    email_id: number;
    action_type: string;
    confidence_score: number;
    reason?: string;
  }): any {
    const stmt = this.db.prepare(`
      INSERT INTO triage_queue (user_id, email_id, action_type, confidence_score, reason)
      VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `);
    stmt.bind([
      userId,
      triageData.email_id,
      triageData.action_type,
      triageData.confidence_score,
      triageData.reason || null
    ]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    this.save();
    return result;
  }

  getTriageQueue(userId: number, status: string = 'pending'): any[] {
    const stmt = this.db.prepare(`
      SELECT
        tq.*,
        e.gmail_id, e.subject, e.from_email, e.from_name, e.date, e.snippet
      FROM triage_queue tq
      JOIN emails e ON tq.email_id = e.id
      WHERE tq.user_id = ? AND tq.status = ?
      ORDER BY tq.confidence_score DESC, tq.created_at ASC
    `);
    stmt.bind([userId, status]);

    const items: any[] = [];
    while (stmt.step()) {
      items.push(stmt.getAsObject());
    }
    stmt.free();
    return items;
  }

  updateTriageStatus(id: number, status: string): void {
    const stmt = this.db.prepare(`
      UPDATE triage_queue
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.bind([status, id]);
    stmt.step();
    stmt.free();
    this.save();
  }

  getTriageItemById(id: number): any {
    const stmt = this.db.prepare('SELECT * FROM triage_queue WHERE id = ?');
    stmt.bind([id]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
  }

  getTriageItemWithGmailId(id: number): any {
    const stmt = this.db.prepare(`
      SELECT tq.*, e.gmail_id
      FROM triage_queue tq
      JOIN emails e ON tq.email_id = e.id
      WHERE tq.id = ?
    `);
    stmt.bind([id]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
  }

  // Unsubscribe methods operations
  createUnsubscribeMethod(emailId: number, methodData: {
    method_type: 'one-click' | 'https' | 'mailto';
    url?: string;
    email_address?: string;
    confidence?: number;
  }): any {
    const stmt = this.db.prepare(`
      INSERT INTO unsubscribe_methods (email_id, method_type, url, email_address, confidence)
      VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `);
    stmt.bind([
      emailId,
      methodData.method_type,
      methodData.url || null,
      methodData.email_address || null,
      methodData.confidence || 100
    ]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    this.save();
    return result;
  }

  getUnsubscribeMethodsByEmailId(emailId: number): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM unsubscribe_methods
      WHERE email_id = ?
      ORDER BY confidence DESC
    `);
    stmt.bind([emailId]);

    const methods: any[] = [];
    while (stmt.step()) {
      methods.push(stmt.getAsObject());
    }
    stmt.free();
    return methods;
  }

  updateUnsubscribeStatus(id: number, status: string, errorMessage?: string): void {
    const stmt = this.db.prepare(`
      UPDATE unsubscribe_methods
      SET status = ?,
          error_message = ?,
          executed_at = CASE WHEN ? IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE executed_at END
      WHERE id = ?
    `);
    stmt.bind([status, errorMessage || null, status, id]);
    stmt.step();
    stmt.free();
    this.save();
  }

  // Sender stats operations
  updateSenderStats(userId: number, senderEmail: string, senderName?: string, isPromotional: boolean = false, emailDate?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO sender_stats (user_id, sender_email, sender_name, total_emails, promotional_count, last_email_date, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, sender_email) DO UPDATE SET
        total_emails = total_emails + 1,
        promotional_count = promotional_count + ?,
        sender_name = COALESCE(excluded.sender_name, sender_name),
        last_email_date = CASE WHEN excluded.last_email_date > last_email_date THEN excluded.last_email_date ELSE last_email_date END,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.bind([userId, senderEmail, senderName || null, isPromotional ? 1 : 0, emailDate || null, isPromotional ? 1 : 0]);
    stmt.step();
    stmt.free();
    this.save();
  }

  getSenderStats(userId: number, limit: number = 20): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sender_stats
      WHERE user_id = ?
      ORDER BY total_emails DESC
      LIMIT ?
    `);
    stmt.bind([userId, limit]);

    const stats: any[] = [];
    while (stmt.step()) {
      stats.push(stmt.getAsObject());
    }
    stmt.free();
    return stats;
  }

  markSenderUnsubscribed(userId: number, senderEmail: string): void {
    const stmt = this.db.prepare(`
      UPDATE sender_stats
      SET unsubscribed = 1, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND sender_email = ?
    `);
    stmt.bind([userId, senderEmail]);
    stmt.step();
    stmt.free();
    this.save();
  }

  // Action log operations
  logAction(userId: number, actionType: string, targetType: string, targetId: string, status: 'success' | 'failed', errorMessage?: string, metadata?: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO action_log (user_id, action_type, target_type, target_id, status, error_message, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.bind([
      userId,
      actionType,
      targetType,
      targetId,
      status,
      errorMessage || null,
      metadata ? JSON.stringify(metadata) : null
    ]);
    stmt.step();
    stmt.free();
    this.save();
  }

  getActionLog(userId: number, limit: number = 100): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM action_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    stmt.bind([userId, limit]);

    const logs: any[] = [];
    while (stmt.step()) {
      logs.push(stmt.getAsObject());
    }
    stmt.free();
    return logs;
  }

  // Dashboard statistics
  getDashboardStats(userId: number): any {
    const getCount = (query: string, params: any[]): number => {
      const stmt = this.db.prepare(query);
      stmt.bind(params);
      const result: any = stmt.step() ? stmt.getAsObject() : { count: 0 };
      stmt.free();
      return result.count || 0;
    };

    const totalScanned = getCount('SELECT COUNT(*) as count FROM emails WHERE user_id = ?', [userId]);
    const totalArchived = getCount('SELECT COUNT(*) as count FROM action_log WHERE user_id = ? AND action_type = ? AND status = ?', [userId, 'archive', 'success']);
    const totalUnsubscribed = getCount('SELECT COUNT(*) as count FROM unsubscribe_methods um JOIN emails e ON um.email_id = e.id WHERE e.user_id = ? AND um.status = ?', [userId, 'completed']);
    const pendingTriage = getCount('SELECT COUNT(*) as count FROM triage_queue WHERE user_id = ? AND status = ?', [userId, 'pending']);

    const stmt = this.db.prepare('SELECT sender_email, sender_name, total_emails FROM sender_stats WHERE user_id = ? ORDER BY total_emails DESC LIMIT 10');
    stmt.bind([userId]);
    const topSenders: any[] = [];
    while (stmt.step()) {
      const sender: any = stmt.getAsObject();
      topSenders.push({
        email: sender.sender_email,
        name: sender.sender_name,
        count: sender.total_emails
      });
    }
    stmt.free();

    const sizeStmt = this.db.prepare('SELECT SUM(size_bytes) as total FROM emails WHERE user_id = ?');
    sizeStmt.bind([userId]);
    const sizeResult: any = sizeStmt.step() ? sizeStmt.getAsObject() : { total: 0 };
    sizeStmt.free();

    return {
      totalScanned,
      totalArchived,
      totalUnsubscribed,
      pendingTriage,
      topSenders,
      spaceSavedMB: sizeResult.total ? Math.round(sizeResult.total / 1024 / 1024) : 0
    };
  }

  close(): void {
    this.save();
    this.db.close();
  }
}

export default DatabaseService;
