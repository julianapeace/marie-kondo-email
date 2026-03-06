import { Router } from 'express';
import { AuthService } from '../services/auth.service';
import { DatabaseService } from '../services/database.service';

declare module 'express-session' {
  interface SessionData {
    userId: number;
    userEmail: string;
    userName?: string;
  }
}

export function createAuthRouter(authService: AuthService, db: DatabaseService): Router {
  const router = Router();

  // Initiate OAuth flow
  router.get('/login', (req, res) => {
    try {
      const authUrl = authService.getAuthUrl();
      res.json({
        success: true,
        data: { authUrl }
      });
    } catch (error) {
      console.error('Error generating auth URL:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate authentication URL'
      });
    }
  });

  // OAuth callback
  router.get('/callback', async (req, res) => {
    try {
      const code = req.query.code as string;

      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'No authorization code provided'
        });
      }

      const user = await authService.handleCallback(code);

      // Set session
      req.session.userId = user.userId;
      req.session.userEmail = user.email;
      req.session.userName = user.name;

      // Redirect to frontend
      res.redirect('/?auth=success');
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect('/?auth=error');
    }
  });

  // Check auth status
  router.get('/status', (req, res) => {
    if (req.session.userId) {
      const user = db.getUserById(req.session.userId);
      res.json({
        success: true,
        data: {
          authenticated: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture
          }
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          authenticated: false
        }
      });
    }
  });

  // Logout
  router.post('/logout', async (req, res) => {
    try {
      if (req.session.userId) {
        await authService.revokeAccess(req.session.userId);
      }

      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to logout'
          });
        }

        res.json({
          success: true,
          message: 'Logged out successfully'
        });
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to logout'
      });
    }
  });

  return router;
}
