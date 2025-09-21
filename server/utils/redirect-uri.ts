import type { Request } from 'express';

/**
 * Resolves the redirect URI for OAuth callbacks based on the request environment
 * Supports development, Replit dev, and production (whirkplace.com) environments
 */
export function resolveRedirectUri(req: Request, path: string = '/auth/microsoft/callback'): string {
  // Check for explicit redirect URIs based on the path
  if (path.includes('slack') && process.env.SLACK_REDIRECT_URI_OVERRIDE) {
    return process.env.SLACK_REDIRECT_URI_OVERRIDE;
  }
  if (path.includes('microsoft') && process.env.MICROSOFT_REDIRECT_URI) {
    // For production, always use the correct domain regardless of env var
    if (process.env.NODE_ENV === 'production') {
      return 'https://whirkplace.com/auth/microsoft/callback';
    }
    return process.env.MICROSOFT_REDIRECT_URI;
  }

  // Determine protocol from headers (for proxied environments) or request
  const protocol = req.get('X-Forwarded-Proto') || req.protocol || 'http';
  
  // Determine host from headers (for proxied environments) or request
  const host = req.get('X-Forwarded-Host') || req.get('host') || 'localhost:5000';

  // For production, use the custom domain
  if (process.env.NODE_ENV === 'production' || 
      host === 'whirkplace.com' || 
      host === 'www.whirkplace.com') {
    return `https://whirkplace.com${path}`;
  }

  // Use the actual current host for Replit environments
  if (host.includes('.replit.dev') || host.includes('repl.co')) {
    return `${protocol}://${host}${path}`;
  }

  // Build the full callback URL for development/staging
  const baseUrl = `${protocol}://${host}`;
  return `${baseUrl}${path}`;
}

/**
 * Validates if a host is allowed for redirect URIs (optional security feature)
 */
export function isAllowedHost(host: string): boolean {
  const allowedHosts = process.env.ALLOWED_HOSTS?.split(',').map(h => h.trim()) || [];
  
  // If no allowed hosts configured, allow all (for development flexibility)
  if (allowedHosts.length === 0) {
    return true;
  }

  // Check explicitly configured hosts first
  if (allowedHosts.includes(host)) {
    return true;
  }

  // Development and staging environment hosts
  if (host === 'localhost:5000' || 
      host.endsWith('.repl.co') || 
      host.endsWith('.replit.dev') ||
      host === 'whirkplace.com' ||
      host === 'www.whirkplace.com') {
    return true;
  }

  return false;
}