import { GmailService } from './gmail.service';
import { DatabaseService } from './database.service';

export class LabelService {
  private readonly DEFAULT_LABELS = {
    TRIAGE_REVIEW: 'Triage/Review',
    TRIAGE_ARCHIVED: 'Triage/Archived',
    TRIAGE_UNSUBSCRIBED: 'Triage/Unsubscribed',
    TRIAGE_AUTO_DELETE: 'Triage/Auto-Delete'
  };

  constructor(
    private gmailService: GmailService,
    private db: DatabaseService,
    private userId: number
  ) {}

  async initializeDefaultLabels(): Promise<void> {
    for (const labelName of Object.values(this.DEFAULT_LABELS)) {
      await this.gmailService.getOrCreateLabel(labelName);
    }
  }

  async applyLabelToGmailMessage(gmailMessageId: string, labelName: string): Promise<void> {
    if (!gmailMessageId || typeof gmailMessageId !== 'string') {
      throw new Error('Invalid Gmail message ID');
    }
    const labelId = await this.gmailService.getOrCreateLabel(labelName);
    await this.gmailService.modifyLabels(gmailMessageId, [labelId], []);
    this.db.logAction(
      this.userId,
      'apply_label',
      'email',
      gmailMessageId,
      'success',
      undefined,
      { label: labelName }
    );
  }

  async applyLabel(emailId: number, labelName: string): Promise<void> {
    try {
      const email = this.db.getEmailById(emailId);
      if (!email) {
        throw new Error('Email not found');
      }
      const gmailId = email.gmail_id ?? (email as any).GMAIL_ID;
      if (!gmailId) {
        throw new Error('Email has no Gmail message ID');
      }
      await this.applyLabelToGmailMessage(gmailId, labelName);
    } catch (error) {
      this.db.logAction(
        this.userId,
        'apply_label',
        'email',
        emailId.toString(),
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async applyLabelToMultiple(emailIds: number[], labelName: string): Promise<void> {
    const labelId = await this.gmailService.getOrCreateLabel(labelName);
    const gmailIds: string[] = [];

    for (const emailId of emailIds) {
      const email = this.db.getEmailById(emailId);
      if (email) {
        const gmailId = email.gmail_id ?? (email as any).GMAIL_ID;
        if (gmailId) gmailIds.push(gmailId);
      }
    }

    if (gmailIds.length > 0) {
      await this.gmailService.batchModifyLabels(gmailIds, [labelId], []);

      this.db.logAction(
        this.userId,
        'apply_label_bulk',
        'emails',
        gmailIds.join(','),
        'success',
        undefined,
        { label: labelName, count: gmailIds.length }
      );
    }
  }

  async removeLabel(emailId: number, labelName: string): Promise<void> {
    try {
      const email = this.db.getEmailById(emailId);
      if (!email) {
        throw new Error('Email not found');
      }

      const labels = await this.gmailService.listLabels();
      const label = labels.find(l => l.name === labelName);

      if (label?.id) {
        await this.gmailService.modifyLabels(email.gmail_id, [], [label.id]);

        this.db.logAction(
          this.userId,
          'remove_label',
          'email',
          email.gmail_id,
          'success',
          undefined,
          { label: labelName }
        );
      }
    } catch (error) {
      this.db.logAction(
        this.userId,
        'remove_label',
        'email',
        emailId.toString(),
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async listLabels(): Promise<any[]> {
    return await this.gmailService.listLabels();
  }

  async createLabel(name: string): Promise<any> {
    return await this.gmailService.createLabel(name);
  }
}

export default LabelService;
