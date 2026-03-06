import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  userId?: number;
  userEmail?: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Please log in.'
    });
  }

  req.userId = req.session.userId;
  req.userEmail = req.session.userEmail;
  next();
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.session && req.session.userId) {
    req.userId = req.session.userId;
    req.userEmail = req.session.userEmail;
  }
  next();
}
