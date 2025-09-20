import { ConfidentialClientApplication, AuthenticationResult, LogLevel } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';

interface MicrosoftUserProfile {
  id: string;
  userPrincipalName: string;
  displayName: string;
  givenName?: string;
  surname?: string;
  mail?: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
}

interface AuthConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  scopes: string[];
}

export class MicrosoftAuthService {
  private msalApp: ConfidentialClientApplication | null = null;
  private config: AuthConfig | null = null;

  constructor() {
    // Lazy initialization to prevent crashes when env vars are missing
    this.initializeIfConfigured();
  }

  private initializeIfConfigured() {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const tenantId = process.env.MICROSOFT_TENANT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    
    // For confidential client applications, we need ALL credentials
    if (!clientId || !tenantId || !clientSecret) {
      console.warn('Microsoft authentication not fully configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_TENANT_ID, and MICROSOFT_CLIENT_SECRET environment variables to enable.');
      return;
    }

    this.config = {
      clientId,
      clientSecret,
      tenantId,
      scopes: ['openid', 'profile', 'User.Read', 'email']
    };

    const msalConfig = {
      auth: {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
      },
      system: {
        loggerOptions: {
          loggerCallback(loglevel: any, message: string, containsPii: boolean) {
            if (!containsPii) {
              console.log(message);
            }
          },
          piiLoggingEnabled: false,
          logLevel: LogLevel.Info,
        }
      }
    };

    this.msalApp = new ConfidentialClientApplication(msalConfig);
  }

  /**
   * Generate Microsoft OAuth authorization URL
   * Build manually to avoid MSAL authority metadata fetch hanging
   */
  async getAuthUrl(redirectUri: string, state?: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Microsoft authentication is not configured');
    }
    
    try {
      // Build authorize URL manually to avoid MSAL network hangs
      const tenantId = this.config!.tenantId;
      const clientId = this.config!.clientId;
      const scopes = encodeURIComponent('openid profile email User.Read');
      
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: scopes,
        prompt: 'select_account'
      });
      
      if (state) {
        params.append('state', state);
      }
      
      const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
      console.log('Generated Microsoft auth URL:', authUrl);
      return authUrl;
    } catch (error) {
      console.error('Failed to generate Microsoft auth URL:', error);
      throw new Error('Failed to generate authorization URL');
    }
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string, redirectUri: string, state?: string): Promise<AuthenticationResult> {
    if (!this.isConfigured()) {
      throw new Error('Microsoft authentication is not configured');
    }
    
    try {
      const tokenRequest = {
        code,
        scopes: this.config!.scopes,
        redirectUri,
      };

      const response = await this.msalApp!.acquireTokenByCode(tokenRequest);
      return response;
    } catch (error) {
      console.error('Failed to exchange code for token:', error);
      throw new Error('Failed to authenticate with Microsoft');
    }
  }

  /**
   * Get user profile from Microsoft Graph
   */
  async getUserProfile(accessToken: string): Promise<MicrosoftUserProfile> {
    try {
      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        }
      });

      const user = await graphClient.api('/me').get();
      
      return {
        id: user.id,
        userPrincipalName: user.userPrincipalName,
        displayName: user.displayName,
        givenName: user.givenName,
        surname: user.surname,
        mail: user.mail || user.userPrincipalName,
        jobTitle: user.jobTitle,
        department: user.department,
        officeLocation: user.officeLocation
      };
    } catch (error) {
      console.error('Failed to get user profile from Microsoft Graph:', error);
      throw new Error('Failed to retrieve user profile');
    }
  }

  /**
   * Refresh access token silently
   */
  async refreshToken(account: any): Promise<AuthenticationResult> {
    if (!this.isConfigured()) {
      throw new Error('Microsoft authentication is not configured');
    }
    
    try {
      const silentRequest = {
        account,
        scopes: this.config!.scopes,
      };

      const response = await this.msalApp!.acquireTokenSilent(silentRequest);
      return response;
    } catch (error) {
      console.error('Failed to refresh Microsoft token:', error);
      throw new Error('Failed to refresh authentication token');
    }
  }

  /**
   * Validate Microsoft access token
   */
  async validateToken(accessToken: string): Promise<boolean> {
    try {
      await this.getUserProfile(accessToken);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get logout URL
   */
  getLogoutUrl(baseUrl: string, postLogoutRedirectUri?: string): string {
    const redirectUri = postLogoutRedirectUri || `${baseUrl}/`;
    return `https://login.microsoftonline.com/${this.config!.tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;
  }

  /**
   * Check if Microsoft authentication is configured
   */
  isConfigured(): boolean {
    return !!(this.msalApp && this.config && process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_TENANT_ID);
  }
}

// Export singleton instance
export const microsoftAuthService = new MicrosoftAuthService();