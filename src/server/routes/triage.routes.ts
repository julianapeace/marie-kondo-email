import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { AuthService } from '../services/auth.service';
import { GmailService } from '../services/gmail.service';
import { TriageService } from '../services/triage.service';
import { ArchiveService } from '../services/archive.service';
import { LabelService } from '../services/label.service';
import { UnsubscribeService } from '../services/unsubscribe.service';

export function createTriageRouter(
  db: DatabaseService,
  authService: AuthService
): Router {
  const router = Router();

  // Get triage queue
  router.get('/queue', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const status = (req.query.status as string) || 'pending';

      const triageService = new TriageService(db, userId);
      const queue = triageService.getTriageQueue(status);

      res.json({
        success: true,
        data: queue
      });
    } catch (error) {
      console.error('Error getting triage queue:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get triage queue'
      });
    }
  });

  // Approve triage item
  router.post('/approve/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const triageId = parseInt(req.params.id);

      const triageItem = db.getTriageItemById(triageId);
      if (!triageItem) {
        return res.status(404).json({
          success: false,
          error: 'Triage item not found'
        });
      }

      // Approve the item
      const triageService = new TriageService(db, userId);
      await triageService.approveTriageItem(triageId);

      // Execute the action
      const auth = await authService.getAuthenticatedClient(userId);
      const gmailService = new GmailService(auth);
      const labelService = new LabelService(gmailService, db, userId);
      const archiveService = new ArchiveService(gmailService, db, labelService, userId);

      switch (triageItem.action_type) {
        case 'archive':
          await archiveService.archiveByTriageId(triageId);
          break;

        case 'unsubscribe':
          // Mark for manual unsubscribe
          db.updateTriageStatus(triageId, 'executed');
          break;

        case 'archive_and_unsubscribe':
          await archiveService.archiveByTriageId(triageId);
          // Unsubscribe will be handled separately
          break;
      }

      res.json({
        success: true,
        message: 'Triage item approved and executed'
      });
    } catch (error) {
      console.error('Error approving triage item:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to approve triage item'
      });
    }
  });

  // Reject triage item
  router.post('/reject/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const triageId = parseInt(req.params.id);

      const triageService = new TriageService(db, userId);
      await triageService.rejectTriageItem(triageId);

      res.json({
        success: true,
        message: 'Triage item rejected'
      });
    } catch (error) {
      console.error('Error rejecting triage item:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reject triage item'
      });
    }
  });

  // Bulk approve
  router.post('/bulk-approve', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { triageIds } = req.body;

      if (!Array.isArray(triageIds)) {
        return res.status(400).json({
          success: false,
          error: 'triageIds must be an array'
        });
      }

      const triageService = new TriageService(db, userId);
      const auth = await authService.getAuthenticatedClient(userId);
      const gmailService = new GmailService(auth);
      const labelService = new LabelService(gmailService, db, userId);
      const archiveService = new ArchiveService(gmailService, db, labelService, userId);

      for (const triageId of triageIds) {
        const triageItem = db.getTriageItemById(triageId);
        if (triageItem) {
          await triageService.approveTriageItem(triageId);

          if (triageItem.action_type === 'archive' || triageItem.action_type === 'archive_and_unsubscribe') {
            await archiveService.archiveByTriageId(triageId);
          }
        }
      }

      res.json({
        success: true,
        message: `Approved ${triageIds.length} items`
      });
    } catch (error) {
      console.error('Error bulk approving:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to bulk approve'
      });
    }
  });

  return router;
}
