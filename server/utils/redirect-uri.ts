import type { Request } from 'express';

/**
 * Resolves the redirect URI for OAuth callbacks based on the request environment
 * Supports development, Replit dev, and production (whirkplace.com) environments
 */
export function resolveRedirectUri(req: Request, path: string = '/auth/microsoft/callback'): string {
  // Determine host from headers (for proxied environments) or request
  const host = req.get('X-Forwarded-Host') || req.get('host') || 'localhost:5000';
  const protocol = req.get('X-Forwarded-Proto') || req.protocol || 'http';
  
  // Force production URLs if request is from whirkplace.com domain or if in production env
  const isProductionDomain = host === 'whirkplace.com' || 
                            host === 'www.whirkplace.com' ||
                            host === 'app.whirkplace.com';
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.env.FORCE_PRODUCTION === 'true' ||
                       isProductionDomain;
  
  // Debug logging
  console.log('🔍 Redirect URI resolution:');
  console.log('  Host:', host);
  console.log('  Protocol:', protocol);
  console.log('  NODE_ENV:', process.env.NODE_ENV);
  console.log('  Is production domain:', isProductionDomain);
  console.log('  Is production:', isProduction);
  
  // Check for explicit redirect URIs based on the path
  if (path.includes('slack')) {
    // For production, always use the correct domain for Slack
    if (isProduction) {
      console.log('  → Forcing Slack production URL');
      return 'https://whirkplace.com/auth/slack/callback';
    }
    // Only use override in development if provided
    if (process.env.SLACK_REDIRECT_URI_OVERRIDE) {
      console.log('  → Using Slack override:', process.env.SLACK_REDIRECT_URI_OVERRIDE);
      return process.env.SLACK_REDIRECT_URI_OVERRIDE;
    }
  }
  if (path.includes('microsoft')) {
    // For production, always use the correct domain for Microsoft
    if (isProduction) {
      console.log('  → Forcing Microsoft production URL');
      return 'https://whirkplace.com/auth/microsoft/callback';
    }
    // Only use override in development if provided
    if (process.env.MICROSOFT_REDIRECT_URI) {
      console.log('  → Using Microsoft override:', process.env.MICROSOFT_REDIRECT_URI);
      return process.env.MICROSOFT_REDIRECT_URI;
    }
  }

  // For production domains, use the custom domain
  if (isProduction) {
    console.log('  → Using production domain');
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