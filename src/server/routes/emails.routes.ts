import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { AuthService } from '../services/auth.service';
import { GmailService } from '../services/gmail.service';
import { ScannerService } from '../services/scanner.service';
import { UnsubscribeService } from '../services/unsubscribe.service';
import { TriageService } from '../services/triage.service';

export function createEmailsRouter(
  db: DatabaseService,
  authService: AuthService
): Router {
  const router = Router();

  // Start email scan with SSE progress updates
  router.get('/scan', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const maxEmails = parseInt(req.query.max as string) || 500;
      const query = (req.query.query as string) || 'in:inbox OR category:promotions';

      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Get authenticated Gmail client
      const auth = await authService.getAuthenticatedClient(userId);
      const gmailService = new GmailService(auth);
      const unsubscribeService = new UnsubscribeService();
      const scannerService = new ScannerService(gmailService, db, unsubscribeService, userId);

      // Scan with progress updates
      await scannerService.scanEmails(query, maxEmails, (progress) => {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      });

      // Generate triage suggestions after scan
      const triageService = new TriageService(db, userId);
      await triageService.generateTriageSuggestions();

      res.write('data: {"status":"done"}\n\n');
      res.end();
    } catch (error) {
      console.error('Error scanning emails:', error);
      res.write(`data: ${JSON.stringify({ status: 'error', error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`);
      res.end();
    }
  });

  // List scanned emails
  router.get('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const filters: { sender?: string; dateFrom?: string; dateTo?: string; promotional?: boolean; search?: string } = {};
      if (req.query.sender != null && req.query.sender !== '') {
        filters.sender = String(req.query.sender);
      }
      if (req.query.dateFrom != null && req.query.dateFrom !== '') {
        filters.dateFrom = String(req.query.dateFrom);
      }
      if (req.query.dateTo != null && req.query.dateTo !== '') {
        filters.dateTo = String(req.query.dateTo);
      }
      if (req.query.promotional !== undefined && req.query.promotional !== '') {
        const v = String(req.query.promotional).toLowerCase();
        if (v === 'true') filters.promotional = true;
        else if (v === 'false') filters.promotional = false;
      }
      if (req.query.search != null && req.query.search !== '') {
        filters.search = String(req.query.search);
      }

      const emails = db.getEmails(userId, limit, offset, Object.keys(filters).length > 0 ? filters : undefined);

      res.json({
        success: true,
        data: emails
      });
    } catch (error) {
      console.error('Error listing emails:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list emails'
      });
    }
  });

  // Get email by ID
  router.get('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const emailId = parseInt(req.params.id);
      const email = db.getEmailById(emailId);

      if (!email) {
        return res.status(404).json({
          success: false,
          error: 'Email not found'
        });
      }

      // Get unsubscribe methods for this email
      const unsubMethods = db.getUnsubscribeMethodsByEmailId(emailId);

      res.json({
        success: true,
        data: {
          ...email,
          unsubscribeMethods: unsubMethods
        }
      });
    } catch (error) {
      console.error('Error getting email:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get email'
      });
    }
  });

  return router;
}
