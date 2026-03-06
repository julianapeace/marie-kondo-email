import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';

export function createStatsRouter(db: DatabaseService): Router {
  const router = Router();

  // Get dashboard statistics
  router.get('/overview', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const stats = db.getDashboardStats(userId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get dashboard statistics'
      });
    }
  });

  // Get action log
  router.get('/actions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const limit = parseInt(req.query.limit as string) || 100;

      const actions = db.getActionLog(userId, limit);

      res.json({
        success: true,
        data: actions
      });
    } catch (error) {
      console.error('Error getting action log:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get action log'
      });
    }
  });

  // Get sender statistics
  router.get('/senders', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const limit = parseInt(req.query.limit as string) || 20;

      const senders = db.getSenderStats(userId, limit);

      res.json({
        success: true,
        data: senders
      });
    } catch (error) {
      console.error('Error getting sender stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get sender statistics'
      });
    }
  });

  return router;
}
