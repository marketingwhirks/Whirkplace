import type { Request } from 'express';

/**
 * Resolves the redirect URI for OAuth callbacks based on the request environment
 * Supports both development (localhost) and live (Replit) environments
 */
export function resolveRedirectUri(req: Request, path: string = '/auth/microsoft/callback'): string {
  // If explicit redirect URI is set in environment, use it
  if (process.env.MICROSOFT_REDIRECT_URI) {
    return process.env.MICROSOFT_REDIRECT_URI;
  }

  // Determine protocol from headers (for proxied environments) or request
  const protocol = req.get('X-Forwarded-Proto') || req.protocol || 'http';
  
  // Determine host from headers (for proxied environments) or request
  const host = req.get('X-Forwarded-Host') || req.get('host') || 'localhost:5000';

  // Build the full callback URL
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

  return allowedHosts.includes(host) || 
         host === 'localhost:5000' || 
         host.endsWith('.repl.co');
}