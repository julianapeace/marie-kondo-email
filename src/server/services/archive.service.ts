import { GmailService } from './gmail.service';
import { DatabaseService } from './database.service';
import { LabelService } from './label.service';

export class ArchiveService {
  constructor(
    private gmailService: GmailService,
    private db: DatabaseService,
    private labelService: LabelService,
    private userId: number
  ) {}

  async archiveEmail(emailId: number, applyLabel: boolean = true): Promise<void> {
    try {
      const email = this.db.getEmailById(emailId);
      if (!email) {
        throw new Error('Email not found');
      }

      // Archive the email (remove INBOX label)
      await this.gmailService.archiveMessage(email.gmail_id);

      // Optionally apply archived label
      if (applyLabel) {
        await this.labelService.applyLabel(emailId, 'Triage/Archived');
      }

      // Update sender stats
      const senderStats = this.db.getSenderStats(this.userId, 1000);
      const sender = senderStats.find(s => s.sender_email === email.from_email);
      if (sender) {
        this.db.updateSenderStats(this.userId, email.from_email, sender.sender_name, false);
      }

      // Log action
      this.db.logAction(
        this.userId,
        'archive',
        'email',
        email.gmail_id,
        'success'
      );
    } catch (error) {
      this.db.logAction(
        this.userId,
        'archive',
        'email',
        emailId.toString(),
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async archiveMultipleEmails(emailIds: number[], applyLabel: boolean = true): Promise<void> {
    const gmailIds: string[] = [];

    for (const emailId of emailIds) {
      const email = this.db.getEmailById(emailId);
      if (email) {
        gmailIds.push(email.gmail_id);
      }
    }

    if (gmailIds.length === 0) {
      return;
    }

    try {
      // Batch archive
      await this.gmailService.archiveMessages(gmailIds);

      // Apply label if requested
      if (applyLabel) {
        await this.labelService.applyLabelToMultiple(emailIds, 'Triage/Archived');
      }

      // Log action
      this.db.logAction(
        this.userId,
        'archive_bulk',
        'emails',
        gmailIds.join(','),
        'success',
        undefined,
        { count: gmailIds.length }
      );
    } catch (error) {
      this.db.logAction(
        this.userId,
        'archive_bulk',
        'emails',
        emailIds.join(','),
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async archiveByTriageId(triageId: number): Promise<void> {
    const triageItem = this.db.getTriageItemById(triageId);
    if (!triageItem) {
      throw new Error('Triage item not found');
    }

    await this.archiveEmail(triageItem.email_id);
    this.db.updateTriageStatus(triageId, 'executed');
  }

  async archiveBySender(senderEmail: string, maxEmails: number = 100): Promise<number> {
    const emails = this.db.getEmails(this.userId, 1000, 0);
    const senderEmails = emails
      .filter(e => e.from_email === senderEmail)
      .slice(0, maxEmails);

    const emailIds = senderEmails.map(e => e.id);
    await this.archiveMultipleEmails(emailIds);

    return emailIds.length;
  }
}

export default ArchiveService;
