import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

export interface UnsubscribeMethod {
  method_type: 'one-click' | 'https' | 'mailto';
  url?: string;
  email_address?: string;
  confidence: number;
}

export class UnsubscribeService {
  // RFC 2369/8058 List-Unsubscribe header patterns
  private readonly LIST_UNSUBSCRIBE_HEADER = 'list-unsubscribe';
  private readonly LIST_UNSUBSCRIBE_POST_HEADER = 'list-unsubscribe-post';

  // URL patterns for unsubscribe links
  private readonly UNSUBSCRIBE_PATTERNS = [
    /unsubscribe/i,
    /opt-out/i,
    /opt_out/i,
    /remove.*list/i,
    /email.*preferences/i,
    /manage.*subscriptions/i
  ];

  async detectUnsubscribeMethods(
    headers: { [key: string]: string },
    bodyHtml?: string
  ): Promise<UnsubscribeMethod[]> {
    const methods: UnsubscribeMethod[] = [];

    // Method 1: Check List-Unsubscribe header (highest priority)
    const headerMethods = this.parseListUnsubscribeHeader(headers);
    methods.push(...headerMethods);

    // Method 2: Parse HTML body for unsubscribe links
    if (bodyHtml && methods.length === 0) {
      const htmlMethods = this.parseHtmlBody(bodyHtml);
      methods.push(...htmlMethods);
    }

    // Remove duplicates and return
    return this.deduplicateMethods(methods);
  }

  private parseListUnsubscribeHeader(headers: { [key: string]: string }): UnsubscribeMethod[] {
    const methods: UnsubscribeMethod[] = [];
    const listUnsubscribe = headers[this.LIST_UNSUBSCRIBE_HEADER];
    const listUnsubscribePost = headers[this.LIST_UNSUBSCRIBE_POST_HEADER];

    if (!listUnsubscribe) {
      return methods;
    }

    // Parse List-Unsubscribe header: <url1>, <url2>, <mailto:...>
    const urlMatches = listUnsubscribe.match(/<([^>]+)>/g);

    if (!urlMatches) {
      return methods;
    }

    for (const match of urlMatches) {
      const url = match.slice(1, -1); // Remove < and >

      if (url.startsWith('mailto:')) {
        // mailto link
        const email = url.replace('mailto:', '').split('?')[0];
        methods.push({
          method_type: 'mailto',
          email_address: email,
          confidence: 95
        });
      } else if (url.startsWith('http')) {
        // HTTP(S) link
        // Check if it's a one-click unsubscribe (RFC 8058)
        if (listUnsubscribePost?.includes('List-Unsubscribe=One-Click')) {
          methods.push({
            method_type: 'one-click',
            url: url,
            confidence: 100
          });
        } else {
          methods.push({
            method_type: 'https',
            url: url,
            confidence: 90
          });
        }
      }
    }

    return methods;
  }

  private parseHtmlBody(html: string): UnsubscribeMethod[] {
    const methods: UnsubscribeMethod[] = [];

    try {
      const $ = cheerio.load(html);

      // Find all links
      $('a').each((_, element) => {
        const href = $(element).attr('href');
        const text = $(element).text().toLowerCase();

        if (!href) return;

        // Check if link text or href matches unsubscribe patterns
        const isUnsubscribeLink = this.UNSUBSCRIBE_PATTERNS.some(
          pattern => pattern.test(text) || pattern.test(href)
        );

        if (isUnsubscribeLink) {
          if (href.startsWith('mailto:')) {
            const email = href.replace('mailto:', '').split('?')[0];
            methods.push({
              method_type: 'mailto',
              email_address: email,
              confidence: 75
            });
          } else if (href.startsWith('http')) {
            methods.push({
              method_type: 'https',
              url: href,
              confidence: 70
            });
          }
        }
      });

      // Also check for mailto links in plain text
      const mailtoMatches = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
      if (mailtoMatches) {
        for (const match of mailtoMatches) {
          const email = match.replace('mailto:', '');
          if (!methods.some(m => m.email_address === email)) {
            methods.push({
              method_type: 'mailto',
              email_address: email,
              confidence: 60
            });
          }
        }
      }
    } catch (error) {
      console.error('Error parsing HTML body:', error);
    }

    return methods;
  }

  private deduplicateMethods(methods: UnsubscribeMethod[]): UnsubscribeMethod[] {
    const seen = new Set<string>();
    const unique: UnsubscribeMethod[] = [];

    for (const method of methods) {
      const key = method.url || method.email_address || '';
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(method);
      }
    }

    // Sort by confidence descending
    return unique.sort((a, b) => b.confidence - a.confidence);
  }

  async executeUnsubscribe(method: UnsubscribeMethod): Promise<{ success: boolean; message: string }> {
    try {
      switch (method.method_type) {
        case 'one-click':
          return await this.executeOneClick(method.url!);

        case 'https':
          // For HTTPS links, we can't automatically execute
          // User needs to visit the link in their browser
          return {
            success: true,
            message: 'Please visit the unsubscribe link in your browser to complete the process.'
          };

        case 'mailto':
          // For mailto, we return instructions for the user
          return {
            success: true,
            message: `Send an email to ${method.email_address} to unsubscribe. This can be automated via Gmail API.`
          };

        default:
          return {
            success: false,
            message: 'Unknown unsubscribe method'
          };
      }
    } catch (error) {
      console.error('Error executing unsubscribe:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to execute unsubscribe'
      };
    }
  }

  private async executeOneClick(url: string): Promise<{ success: boolean; message: string }> {
    try {
      // RFC 8058: One-Click unsubscribe via POST request
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'List-Unsubscribe=One-Click'
      });

      if (response.ok) {
        return {
          success: true,
          message: 'Successfully unsubscribed via one-click method'
        };
      } else {
        return {
          success: false,
          message: `Unsubscribe request failed with status ${response.status}`
        };
      }
    } catch (error) {
      console.error('Error executing one-click unsubscribe:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to execute one-click unsubscribe'
      };
    }
  }

  validateUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      // Only allow HTTPS for security (except mailto)
      return parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
    } catch {
      return false;
    }
  }

  isSuspiciousUrl(url: string): boolean {
    // Check for suspicious patterns that might indicate phishing
    const suspiciousPatterns = [
      /bit\.ly/i,
      /tinyurl/i,
      /goo\.gl/i,
      /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, // IP addresses
      /@/, // @ symbol in domain (phishing technique)
    ];

    return suspiciousPatterns.some(pattern => pattern.test(url));
  }
}

export default UnsubscribeService;
