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
  router.get('/queue', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const status = (req.query.status as string) || 'pending';
      const sender = req.query.sender as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const actionType = req.query.actionType as string | undefined;
      const minConfidence = req.query.minConfidence as string | undefined;
      const search = req.query.search as string | undefined;

      const filters =
        sender != null || dateFrom != null || dateTo != null || actionType != null || minConfidence != null || search != null
          ? { sender, dateFrom, dateTo, actionType, minConfidence: minConfidence != null && minConfidence !== '' ? Number(minConfidence) : undefined, search }
          : undefined;

      const triageService = new TriageService(db, userId);
      const queue = await triageService.getTriageQueue(status, filters);

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

      const triageItem = db.getTriageItemWithGmailId(triageId);
      if (!triageItem) {
        return res.status(404).json({
          success: false,
          error: 'Triage item not found'
        });
      }

      const triageService = new TriageService(db, userId);
      await triageService.approveTriageItem(triageId);

      const auth = await authService.getAuthenticatedClient(userId);
      const gmailService = new GmailService(auth);
      const labelService = new LabelService(gmailService, db, userId);

      switch (triageItem.action_type) {
        case 'archive':
        case 'archive_and_unsubscribe':
          if (triageItem.gmail_id) {
            await labelService.applyLabelToGmailMessage(triageItem.gmail_id, 'Triage/Auto-Delete');
          } else {
            await labelService.applyLabel(triageItem.email_id, 'Triage/Auto-Delete');
          }
          db.updateTriageStatus(triageId, 'approved');
          break;

        case 'unsubscribe':
          db.updateTriageStatus(triageId, 'executed');
          break;
      }

      res.json({
        success: true,
        message: triageItem.action_type === 'unsubscribe' ? 'Triage item executed' : 'Marked for deletion (use Delete all auto-delete to archive)'
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

  // Preview auto-delete: count emails with Triage/Auto-Delete label
  router.get('/auto-delete-preview', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const auth = await authService.getAuthenticatedClient(userId);
      const gmailService = new GmailService(auth);

      const autoDeleteLabelId = await gmailService.getOrCreateLabel('Triage/Auto-Delete');
      let count = 0;
      let pageToken: string | undefined;

      do {
        const { messages, nextPageToken } = await gmailService.listMessagesByLabel(autoDeleteLabelId, 500, pageToken);
        count += messages.length;
        pageToken = nextPageToken;
      } while (pageToken);

      res.json({
        success: true,
        data: { count }
      });
    } catch (error) {
      console.error('Error getting auto-delete preview:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get auto-delete preview'
      });
    }
  });

  // Execute auto-delete: archive all emails with Triage/Auto-Delete label
  router.post('/execute-auto-delete', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const auth = await authService.getAuthenticatedClient(userId);
      const gmailService = new GmailService(auth);
      const labelService = new LabelService(gmailService, db, userId);
      const archiveService = new ArchiveService(gmailService, db, labelService, userId);

      const autoDeleteLabelId = await gmailService.getOrCreateLabel('Triage/Auto-Delete');
      const allGmailIds: string[] = [];
      let pageToken: string | undefined;

      do {
        const { messages, nextPageToken } = await gmailService.listMessagesByLabel(autoDeleteLabelId, 500, pageToken);
        allGmailIds.push(...messages.map((m) => m.id));
        pageToken = nextPageToken;
      } while (pageToken);

      if (allGmailIds.length === 0) {
        return res.json({
          success: true,
          data: { archived: 0 },
          message: 'No emails labeled for auto-delete'
        });
      }

      const inDbEmailIds: number[] = [];
      const notInDbGmailIds: string[] = [];
      for (const gmailId of allGmailIds) {
        const email = db.getEmailByGmailId(gmailId);
        if (email) inDbEmailIds.push(email.id);
        else notInDbGmailIds.push(gmailId);
      }

      if (inDbEmailIds.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < inDbEmailIds.length; i += batchSize) {
          await archiveService.archiveMultipleEmails(inDbEmailIds.slice(i, i + batchSize));
        }
      }
      if (notInDbGmailIds.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < notInDbGmailIds.length; i += batchSize) {
          await gmailService.archiveMessages(notInDbGmailIds.slice(i, i + batchSize));
        }
      }

      const removeLabelBatchSize = 100;
      for (let i = 0; i < allGmailIds.length; i += removeLabelBatchSize) {
        await gmailService.batchModifyLabels(
          allGmailIds.slice(i, i + removeLabelBatchSize),
          [],
          [autoDeleteLabelId]
        );
      }

      res.json({
        success: true,
        data: { archived: allGmailIds.length },
        message: `Archived ${allGmailIds.length} email(s)`
      });
    } catch (error) {
      console.error('Error executing auto-delete:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute auto-delete'
      });
    }
  });

  // Undo last archive (restore to inbox)
  router.post('/undo-last-archive', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const log = db.getLastArchiveBulkLog(userId, 2);
      if (!log) {
        return res.status(404).json({
          success: false,
          error: 'Nothing to undo'
        });
      }
      const ids = log.target_id.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Nothing to undo'
        });
      }
      const auth = await authService.getAuthenticatedClient(userId);
      const gmailService = new GmailService(auth);
      await gmailService.moveToInbox(ids);
      db.logAction(userId, 'undo_archive', 'emails', log.target_id, 'success', undefined, { count: ids.length });
      res.json({
        success: true,
        data: { restored: ids.length }
      });
    } catch (error) {
      console.error('Error undoing last archive:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to undo last archive'
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
        const triageItem = db.getTriageItemWithGmailId(triageId);
        if (!triageItem) continue;
        await triageService.approveTriageItem(triageId);
        if (triageItem.action_type === 'archive' || triageItem.action_type === 'archive_and_unsubscribe') {
          if (triageItem.gmail_id) {
            await labelService.applyLabelToGmailMessage(triageItem.gmail_id, 'Triage/Auto-Delete');
          } else {
            await labelService.applyLabel(triageItem.email_id, 'Triage/Auto-Delete');
          }
        }
      }

      res.json({
        success: true,
        message: `Marked ${triageIds.length} items (use Delete all auto-delete to archive)`
      });
    } catch (error) {
      console.error('Error bulk approving:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to bulk approve'
      });
    }
  });

  // Sender rules
  router.get('/sender-rules', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const rules = db.getSenderRules(userId);
      res.json({ success: true, data: rules });
    } catch (error) {
      console.error('Error getting sender rules:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get sender rules'
      });
    }
  });

  router.post('/sender-rules', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { kind, value } = req.body;
      if (kind !== 'allowlist' && kind !== 'blocklist') {
        return res.status(400).json({
          success: false,
          error: 'kind must be allowlist or blocklist'
        });
      }
      const trimmed = typeof value === 'string' ? value.trim() : '';
      if (trimmed.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'value must be a non-empty string (email or @domain)'
        });
      }
      const id = db.createSenderRule(userId, kind, trimmed);
      const rules = db.getSenderRules(userId);
      const created = rules.find((r: { id: number }) => r.id === id);
      if (!created) {
        return res.status(500).json({
          success: false,
          error: 'Failed to create sender rule'
        });
      }
      res.status(201).json(created);
    } catch (error) {
      console.error('Error creating sender rule:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create sender rule'
      });
    }
  });

  router.delete('/sender-rules/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid rule id'
        });
      }
      const deleted = db.deleteSenderRule(id, userId);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Sender rule not found'
        });
      }
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting sender rule:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete sender rule'
      });
    }
  });

  return router;
}
