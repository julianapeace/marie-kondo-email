import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { gmailConfig } from '../config/gmail';
import { DatabaseService } from './database.service';

export class AuthService {
  private oauth2Client: OAuth2Client;

  constructor(private db: DatabaseService) {
    this.oauth2Client = new google.auth.OAuth2(
      gmailConfig.clientId,
      gmailConfig.clientSecret,
      gmailConfig.redirectUri
    );
  }

  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: gmailConfig.scopes,
      prompt: 'consent' // Force consent to get refresh token
    });
  }

  async handleCallback(code: string): Promise<{ userId: number; email: string; name?: string }> {
    try {
      // Exchange code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      // Get user info
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      const email = userInfo.data.email!;
      const name = userInfo.data.name || undefined;
      const picture = userInfo.data.picture || undefined;

      // Create or update user
      const user = this.db.createOrUpdateUser(email, name, picture);

      // Store tokens
      this.db.updateUserTokens(
        user.id,
        tokens.access_token!,
        tokens.refresh_token || undefined,
        tokens.expiry_date || undefined
      );

      return {
        userId: user.id,
        email: user.email,
        name: user.name
      };
    } catch (error) {
      console.error('Error in handleCallback:', error);
      throw new Error('Failed to authenticate with Gmail');
    }
  }

  async getAuthenticatedClient(userId: number): Promise<OAuth2Client> {
    const tokens = this.db.getUserTokens(userId);

    if (!tokens) {
      throw new Error('No tokens found for user');
    }

    this.oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiryDate
    });

    // Check if token needs refresh
    if (tokens.expiryDate && tokens.expiryDate < Date.now()) {
      try {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        this.oauth2Client.setCredentials(credentials);

        // Update tokens in database
        this.db.updateUserTokens(
          userId,
          credentials.access_token!,
          credentials.refresh_token || undefined,
          credentials.expiry_date || undefined
        );
      } catch (error) {
        console.error('Error refreshing token:', error);
        throw new Error('Failed to refresh access token');
      }
    }

    return this.oauth2Client;
  }

  async revokeAccess(userId: number): Promise<void> {
    const tokens = this.db.getUserTokens(userId);

    if (tokens && tokens.accessToken) {
      try {
        await this.oauth2Client.revokeToken(tokens.accessToken);
      } catch (error) {
        console.error('Error revoking token:', error);
      }
    }

    // Clear tokens from database
    this.db.updateUserTokens(userId, '', undefined, undefined);
  }
}

export default AuthService;
