import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { AuthService } from '../services/auth.service';
import { GmailService } from '../services/gmail.service';
import { UnsubscribeService } from '../services/unsubscribe.service';
import { LabelService } from '../services/label.service';

export function createUnsubscribeRouter(
  db: DatabaseService,
  authService: AuthService
): Router {
  const router = Router();

  // Get unsubscribe methods for an email
  router.get('/:emailId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const emailId = parseInt(req.params.emailId);
      const methods = db.getUnsubscribeMethodsByEmailId(emailId);

      res.json({
        success: true,
        data: methods
      });
    } catch (error) {
      console.error('Error getting unsubscribe methods:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get unsubscribe methods'
      });
    }
  });

  // Execute unsubscribe
  router.post('/execute', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { methodId, emailId } = req.body;

      if (!methodId || !emailId) {
        return res.status(400).json({
          success: false,
          error: 'methodId and emailId are required'
        });
      }

      // Get method and email
      const methods = db.getUnsubscribeMethodsByEmailId(emailId);
      const method = methods.find(m => m.id === methodId);

      if (!method) {
        return res.status(404).json({
          success: false,
          error: 'Unsubscribe method not found'
        });
      }

      const email = db.getEmailById(emailId);
      if (!email) {
        return res.status(404).json({
          success: false,
          error: 'Email not found'
        });
      }

      // Execute unsubscribe
      const unsubscribeService = new UnsubscribeService();
      const result = await unsubscribeService.executeUnsubscribe(method);

      if (result.success) {
        db.updateUnsubscribeStatus(methodId, 'completed');

        // Mark sender as unsubscribed
        db.markSenderUnsubscribed(userId, email.from_email);

        // Apply label
        const auth = await authService.getAuthenticatedClient(userId);
        const gmailService = new GmailService(auth);
        const labelService = new LabelService(gmailService, db, userId);
        await labelService.applyLabel(emailId, 'Triage/Unsubscribed');

        // Log action
        db.logAction(
          userId,
          'unsubscribe',
          'email',
          email.gmail_id,
          'success',
          undefined,
          { method: method.method_type, sender: email.from_email }
        );
      } else {
        db.updateUnsubscribeStatus(methodId, 'failed', result.message);

        db.logAction(
          userId,
          'unsubscribe',
          'email',
          email.gmail_id,
          'failed',
          result.message
        );
      }

      res.json({
        success: result.success,
        message: result.message,
        data: {
          method: method.method_type,
          status: result.success ? 'completed' : 'failed'
        }
      });
    } catch (error) {
      console.error('Error executing unsubscribe:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute unsubscribe'
      });
    }
  });

  return router;
}
