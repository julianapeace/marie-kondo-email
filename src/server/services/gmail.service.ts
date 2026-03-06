import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: gmail_v1.Schema$MessagePart;
  internalDate?: string;
  sizeEstimate?: number;
}

export interface ParsedEmail {
  id: string;
  threadId: string;
  subject?: string;
  from?: { email: string; name?: string };
  to?: string;
  date?: string;
  snippet?: string;
  labelIds?: string[];
  isPromotional: boolean;
  isRead: boolean;
  hasAttachments: boolean;
  headers: { [key: string]: string };
  bodyHtml?: string;
  bodyText?: string;
  sizeEstimate?: number;
}

export class GmailService {
  private gmail: gmail_v1.Gmail;

  constructor(private auth: OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async listMessages(query: string = '', maxResults: number = 100, pageToken?: string): Promise<{ messages: GmailMessage[]; nextPageToken?: string }> {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
        pageToken
      });

      return {
        messages: (response.data.messages || []) as GmailMessage[],
        nextPageToken: response.data.nextPageToken || undefined
      };
    } catch (error) {
      console.error('Error listing messages:', error);
      throw new Error('Failed to list messages');
    }
  }

  async getMessage(messageId: string, format: 'full' | 'metadata' | 'minimal' = 'full'): Promise<GmailMessage> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format
      });

      return response.data as GmailMessage;
    } catch (error) {
      console.error('Error getting message:', error);
      throw new Error('Failed to get message');
    }
  }

  async batchGetMessages(messageIds: string[]): Promise<GmailMessage[]> {
    const messages: GmailMessage[] = [];
    const batchSize = 50; // Gmail API recommends batch size of 100 or less

    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      const promises = batch.map(id => this.getMessage(id, 'full'));
      const results = await Promise.all(promises);
      messages.push(...results);

      // Rate limiting: wait 100ms between batches
      if (i + batchSize < messageIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return messages;
  }

  parseEmail(message: GmailMessage): ParsedEmail {
    const headers: { [key: string]: string } = {};
    const payload = message.payload;

    // Extract headers
    if (payload?.headers) {
      payload.headers.forEach(header => {
        if (header.name && header.value) {
          headers[header.name.toLowerCase()] = header.value;
        }
      });
    }

    // Parse from address
    const fromHeader = headers['from'] || '';
    const fromMatch = fromHeader.match(/(?:"?([^"]*)"?\s)?<?([^>]+)>?/);
    const from = fromMatch ? {
      name: fromMatch[1]?.trim() || undefined,
      email: fromMatch[2]?.trim() || fromHeader
    } : { email: fromHeader };

    // Check if promotional
    const isPromotional = message.labelIds?.includes('CATEGORY_PROMOTIONS') || false;
    const isRead = !message.labelIds?.includes('UNREAD');

    // Check for attachments
    const hasAttachments = this.hasAttachments(payload);

    // Extract body
    const { html, text } = this.extractBody(payload);

    return {
      id: message.id,
      threadId: message.threadId,
      subject: headers['subject'],
      from,
      to: headers['to'],
      date: headers['date'],
      snippet: message.snippet,
      labelIds: message.labelIds,
      isPromotional,
      isRead,
      hasAttachments,
      headers,
      bodyHtml: html,
      bodyText: text,
      sizeEstimate: message.sizeEstimate
    };
  }

  private hasAttachments(payload?: gmail_v1.Schema$MessagePart): boolean {
    if (!payload) return false;

    if (payload.filename && payload.body?.attachmentId) {
      return true;
    }

    if (payload.parts) {
      return payload.parts.some(part => this.hasAttachments(part));
    }

    return false;
  }

  private extractBody(payload?: gmail_v1.Schema$MessagePart): { html?: string; text?: string } {
    if (!payload) return {};

    let html: string | undefined;
    let text: string | undefined;

    const findPart = (part: gmail_v1.Schema$MessagePart, mimeType: string): string | undefined => {
      if (part.mimeType === mimeType && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }

      if (part.parts) {
        for (const subPart of part.parts) {
          const result = findPart(subPart, mimeType);
          if (result) return result;
        }
      }

      return undefined;
    };

    html = findPart(payload, 'text/html');
    text = findPart(payload, 'text/plain');

    return { html, text };
  }

  async modifyLabels(messageId: string, addLabelIds: string[] = [], removeLabelIds: string[] = []): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds,
          removeLabelIds
        }
      });
    } catch (error) {
      console.error('Error modifying labels:', error);
      throw new Error('Failed to modify labels');
    }
  }

  async batchModifyLabels(messageIds: string[], addLabelIds: string[] = [], removeLabelIds: string[] = []): Promise<void> {
    try {
      await this.gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids: messageIds,
          addLabelIds,
          removeLabelIds
        }
      });
    } catch (error) {
      console.error('Error batch modifying labels:', error);
      throw new Error('Failed to batch modify labels');
    }
  }

  async archiveMessage(messageId: string): Promise<void> {
    await this.modifyLabels(messageId, [], ['INBOX']);
  }

  async archiveMessages(messageIds: string[]): Promise<void> {
    await this.batchModifyLabels(messageIds, [], ['INBOX']);
  }

  async listLabels(): Promise<gmail_v1.Schema$Label[]> {
    try {
      const response = await this.gmail.users.labels.list({
        userId: 'me'
      });

      return response.data.labels || [];
    } catch (error) {
      console.error('Error listing labels:', error);
      throw new Error('Failed to list labels');
    }
  }

  async createLabel(name: string, labelListVisibility: string = 'labelShow', messageListVisibility: string = 'show'): Promise<gmail_v1.Schema$Label> {
    try {
      const response = await this.gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name,
          labelListVisibility,
          messageListVisibility
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error creating label:', error);
      throw new Error('Failed to create label');
    }
  }

  async getOrCreateLabel(name: string): Promise<string> {
    const labels = await this.listLabels();
    const existing = labels.find(l => l.name === name);

    if (existing?.id) {
      return existing.id;
    }

    const newLabel = await this.createLabel(name);
    return newLabel.id!;
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    try {
      const email = [
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        `To: ${to}`,
        `Subject: ${subject}`,
        '',
        body
      ].join('\n');

      const encodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail
        }
      });
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send email');
    }
  }
}

export default GmailService;
