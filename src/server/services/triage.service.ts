import { DatabaseService } from './database.service';

export interface TriageScore {
  emailId: number;
  actionType: 'archive' | 'unsubscribe' | 'archive_and_unsubscribe' | 'review';
  confidenceScore: number;
  reason: string;
}

export class TriageService {
  constructor(private db: DatabaseService, private userId: number) {}

  async generateTriageSuggestions(emailIds?: number[]): Promise<TriageScore[]> {
    // Get emails to analyze
    let emails: any[];

    if (emailIds) {
      emails = emailIds.map(id => this.db.getEmailById(id)).filter(e => e);
    } else {
      // Get all promotional emails
      emails = this.db.getPromotionalEmails(this.userId, 500);
    }

    const suggestions: TriageScore[] = [];

    for (const email of emails) {
      const score = await this.calculateTriageScore(email);
      suggestions.push(score);

      // Create triage item in database if score is actionable
      if (score.confidenceScore >= 40) {
        this.db.createTriageItem(this.userId, {
          email_id: email.id,
          action_type: score.actionType,
          confidence_score: score.confidenceScore,
          reason: score.reason
        });
      }
    }

    return suggestions;
  }

  private async calculateTriageScore(email: any): Promise<TriageScore> {
    let score = 0;
    const reasons: string[] = [];

    // Factor 1: Promotional headers/flags (+30 points)
    if (email.is_promotional) {
      score += 30;
      reasons.push('Promotional email');
    }

    // Factor 2: Has unsubscribe link (+20 points)
    const unsubMethods = this.db.getUnsubscribeMethodsByEmailId(email.id);
    const hasUnsubscribe = unsubMethods.length > 0;
    if (hasUnsubscribe) {
      score += 20;
      reasons.push('Has unsubscribe option');
    }

    // Factor 3: Age > 6 months (+25 points)
    const emailDate = new Date(email.date);
    const monthsOld = this.getMonthsOld(emailDate);
    if (monthsOld > 6) {
      score += 25;
      reasons.push(`${monthsOld} months old`);
    } else if (monthsOld > 3) {
      score += 15;
      reasons.push(`${monthsOld} months old`);
    }

    // Factor 4: High sender frequency (+15 points)
    const senderStats = this.db.getSenderStats(this.userId, 100);
    const sender = senderStats.find(s => s.sender_email === email.from_email);
    if (sender && sender.total_emails > 50) {
      score += 15;
      reasons.push(`Frequent sender (${sender.total_emails} emails)`);
    } else if (sender && sender.total_emails > 20) {
      score += 10;
      reasons.push(`Frequent sender (${sender.total_emails} emails)`);
    }

    // Factor 5: User archive history (+40 points max)
    // Check if user has archived emails from this sender before
    if (sender && sender.archived_count > 0) {
      const archiveRatio = sender.archived_count / sender.total_emails;
      const archivePoints = Math.min(40, Math.floor(archiveRatio * 40));
      score += archivePoints;
      reasons.push(`Previously archived ${sender.archived_count} from this sender`);
    }

    // Determine action type based on score and available methods
    let actionType: 'archive' | 'unsubscribe' | 'archive_and_unsubscribe' | 'review';

    if (score >= 80 && hasUnsubscribe) {
      actionType = 'archive_and_unsubscribe';
    } else if (score >= 60) {
      actionType = 'archive';
    } else if (score >= 40 && hasUnsubscribe) {
      actionType = 'review';
    } else {
      actionType = 'review';
    }

    return {
      emailId: email.id,
      actionType,
      confidenceScore: Math.min(100, score),
      reason: reasons.join('; ')
    };
  }

  private getMonthsOld(date: Date): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
    return diffMonths;
  }

  async approveTriageItem(triageId: number): Promise<void> {
    this.db.updateTriageStatus(triageId, 'approved');
  }

  async rejectTriageItem(triageId: number): Promise<void> {
    this.db.updateTriageStatus(triageId, 'rejected');
  }

  async bulkApprove(triageIds: number[]): Promise<void> {
    for (const id of triageIds) {
      this.db.updateTriageStatus(id, 'approved');
    }
  }

  async getTriageQueue(status: string = 'pending'): Promise<any[]> {
    return this.db.getTriageQueue(this.userId, status);
  }
}

export default TriageService;
