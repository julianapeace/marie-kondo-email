import { GmailService, ParsedEmail } from './gmail.service';
import { DatabaseService } from './database.service';
import { UnsubscribeService } from './unsubscribe.service';

export interface ScanProgress {
  total: number;
  processed: number;
  promotional: number;
  withUnsubscribe: number;
  currentBatch: number;
  status: 'running' | 'completed' | 'error';
  error?: string;
}

export type ProgressCallback = (progress: ScanProgress) => void;

export class ScannerService {
  constructor(
    private gmailService: GmailService,
    private db: DatabaseService,
    private unsubscribeService: UnsubscribeService,
    private userId: number
  ) {}

  async scanEmails(
    query: string = 'in:inbox OR category:promotions',
    maxEmails: number = 500,
    onProgress?: ProgressCallback
  ): Promise<ScanProgress> {
    const progress: ScanProgress = {
      total: 0,
      processed: 0,
      promotional: 0,
      withUnsubscribe: 0,
      currentBatch: 0,
      status: 'running'
    };

    try {
      // Step 1: Get list of message IDs
      const messageIds: string[] = [];
      let pageToken: string | undefined;

      do {
        const result = await this.gmailService.listMessages(query, 100, pageToken);
        messageIds.push(...result.messages.map(m => m.id));
        pageToken = result.nextPageToken;

        if (messageIds.length >= maxEmails) {
          break;
        }
      } while (pageToken);

      progress.total = Math.min(messageIds.length, maxEmails);
      const idsToProcess = messageIds.slice(0, maxEmails);

      if (onProgress) onProgress({ ...progress });

      // Step 2: Process messages in batches
      const batchSize = 50;

      for (let i = 0; i < idsToProcess.length; i += batchSize) {
        const batch = idsToProcess.slice(i, i + batchSize);
        progress.currentBatch = Math.floor(i / batchSize) + 1;

        // Fetch batch
        const messages = await this.gmailService.batchGetMessages(batch);

        // Process each message
        for (const message of messages) {
          await this.processEmail(message, progress);
          progress.processed++;

          if (onProgress) onProgress({ ...progress });
        }
      }

      progress.status = 'completed';
      if (onProgress) onProgress({ ...progress });

      return progress;
    } catch (error) {
      console.error('Error scanning emails:', error);
      progress.status = 'error';
      progress.error = error instanceof Error ? error.message : 'Unknown error';

      if (onProgress) onProgress({ ...progress });

      throw error;
    }
  }

  private async processEmail(gmailMessage: any, progress: ScanProgress): Promise<void> {
    try {
      const parsed = this.gmailService.parseEmail(gmailMessage);

      // Store email in database
      const emailData = {
        gmail_id: parsed.id,
        thread_id: parsed.threadId,
        subject: parsed.subject,
        from_email: parsed.from?.email || '',
        from_name: parsed.from?.name,
        to_email: parsed.to || '',
        date: parsed.date || new Date().toISOString(),
        snippet: parsed.snippet,
        is_promotional: parsed.isPromotional,
        is_read: parsed.isRead,
        has_attachments: parsed.hasAttachments,
        labels: parsed.labelIds,
        size_bytes: parsed.sizeEstimate
      };

      const savedEmail = this.db.createEmail(this.userId, emailData);

      // Update sender stats
      if (parsed.from?.email) {
        this.db.updateSenderStats(
          this.userId,
          parsed.from.email,
          parsed.from.name,
          parsed.isPromotional,
          parsed.date
        );
      }

      // Detect unsubscribe methods for promotional emails
      if (parsed.isPromotional) {
        progress.promotional++;

        const unsubMethods = await this.unsubscribeService.detectUnsubscribeMethods(
          parsed.headers,
          parsed.bodyHtml
        );

        if (unsubMethods.length > 0) {
          progress.withUnsubscribe++;

          // Store unsubscribe methods
          for (const method of unsubMethods) {
            this.db.createUnsubscribeMethod(savedEmail.id, method);
          }
        }
      }
    } catch (error) {
      console.error('Error processing email:', error);
      // Continue processing other emails
    }
  }

  async scanInboxOnly(maxEmails: number = 200, onProgress?: ProgressCallback): Promise<ScanProgress> {
    return this.scanEmails('in:inbox', maxEmails, onProgress);
  }

  async scanPromotionalOnly(maxEmails: number = 500, onProgress?: ProgressCallback): Promise<ScanProgress> {
    return this.scanEmails('category:promotions', maxEmails, onProgress);
  }

  async scanOldEmails(monthsOld: number = 6, maxEmails: number = 500, onProgress?: ProgressCallback): Promise<ScanProgress> {
    const date = new Date();
    date.setMonth(date.getMonth() - monthsOld);
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '/');

    const query = `before:${dateStr} category:promotions`;
    return this.scanEmails(query, maxEmails, onProgress);
  }
}

export default ScannerService;
