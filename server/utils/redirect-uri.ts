import type { Request } from 'express';

/**
 * Resolves the redirect URI for OAuth callbacks based on the request environment
 * Supports development, Replit dev, and production (whirkplace.com) environments
 */
export function resolveRedirectUri(req: Request, path: string = '/auth/microsoft/callback'): string {
  // Determine host from headers (for proxied environments) or request
  // Handle comma-separated hosts from multiple proxies
  const rawHost = (req.get('X-Forwarded-Host') || req.get('host') || req.hostname || '0.0.0.0:5000')
    .split(',')[0]  // Take first host if comma-separated
    .trim()
    .toLowerCase();
  
  // Get full host with port for development environments
  const fullHost = rawHost;
  // Strip port for cleaner comparison
  const host = rawHost.split(':')[0];
  
  // CRITICAL: In production with trust proxy, X-Forwarded-Proto is authoritative
  const protocol = req.get('X-Forwarded-Proto') || req.protocol || 'http';
  
  // Check if this is a development environment (Replit dev)
  const isDevelopmentEnvironment = fullHost.includes('.replit.dev') || 
                                   fullHost.includes('repl.co') ||
                                   fullHost.startsWith('0.0.0.0:') ||
                                   fullHost === '0.0.0.0';
  
  // Better production domain detection - check if it ends with whirkplace.com
  const isProductionDomain = host === 'whirkplace.com' || 
                            host === 'www.whirkplace.com' ||
                            host === 'app.whirkplace.com' ||
                            host.endsWith('.whirkplace.com') ||
                            host.endsWith('whirkplace.replit.app'); // Also detect Replit deployment
  
  // Production detection: check multiple indicators
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.env.FORCE_PRODUCTION === 'true' ||
                       process.env.FORCE_PRODUCTION_OAUTH === 'true' ||
                       process.env.REPL_SLUG?.includes('whirkplace') ||  // Check if deployed as whirkplace
                       isProductionDomain;
  
  // Smart detection: Use dev URL for dev environments, production URL for production
  if (isDevelopmentEnvironment && !process.env.FORCE_PRODUCTION_OAUTH && !isProduction) {
    // Development environment - use the actual host
    console.log('🔧 Development environment detected, using actual host:', fullHost);
    return `${protocol}://${fullHost}${path}`;
  } else if (isProduction) {
    // Production environment - always use whirkplace.com with HTTPS
    console.log('🚀 Production environment detected, using whirkplace.com');
    return `https://whirkplace.com${path}`;
  }
  
  // Fallback to OAUTH_REDIRECT_BASE_URL if set (for custom configurations)
  if (process.env.OAUTH_REDIRECT_BASE_URL) {
    const baseUrl = process.env.OAUTH_REDIRECT_BASE_URL.replace(/\/$/, ''); // Remove trailing slash
    console.log('🔒 Using OAUTH_REDIRECT_BASE_URL override:', baseUrl);
    return `${baseUrl}${path}`;
  }
  
  // Debug logging
  console.log('🔍 Redirect URI resolution:');
  console.log('  Raw Host Header:', rawHost);
  console.log('  Cleaned Host:', host);
  console.log('  Protocol:', protocol);
  console.log('  Is Production Domain:', isProductionDomain);
  console.log('  Is Production:', isProduction);
  console.log('  ENV: NODE_ENV:', process.env.NODE_ENV);
  console.log('  ENV: FORCE_PRODUCTION:', process.env.FORCE_PRODUCTION);
  console.log('  ENV: FORCE_PRODUCTION_OAUTH:', process.env.FORCE_PRODUCTION_OAUTH);
  console.log('  ENV: OAUTH_REDIRECT_BASE_URL:', process.env.OAUTH_REDIRECT_BASE_URL);
  
  // Check for explicit redirect URI overrides
  if (path.includes('slack') && process.env.SLACK_REDIRECT_URI_OVERRIDE) {
    console.log('  → Using Slack override:', process.env.SLACK_REDIRECT_URI_OVERRIDE);
    return process.env.SLACK_REDIRECT_URI_OVERRIDE;
  }
  if (path.includes('microsoft') && process.env.MICROSOFT_REDIRECT_URI) {
    console.log('  → Using Microsoft override:', process.env.MICROSOFT_REDIRECT_URI);
    return process.env.MICROSOFT_REDIRECT_URI;
  }

  // For production domains, always use whirkplace.com with HTTPS
  // This ensures OAuth callbacks work correctly across all production deployments
  if (isProductionDomain) {
    console.log('  → Production domain detected, using whirkplace.com');
    return `https://whirkplace.com${path}`;
  }

  // Use the actual current host for Replit environments  
  if (fullHost.includes('.replit.dev') || fullHost.includes('repl.co')) {
    console.log('  → Replit environment, using actual host:', fullHost);
    return `${protocol}://${fullHost}${path}`;
  }

  // Build the full callback URL for development/staging
  const baseUrl = `${protocol}://${fullHost}`;
  console.log('  → Default fallback, using:', baseUrl);
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
  if (host === '0.0.0.0:5000' || 
      host.startsWith('0.0.0.0:') ||
      host.endsWith('.repl.co') || 
      host.endsWith('.replit.dev') ||
      host === 'whirkplace.com' ||
      host === 'www.whirkplace.com') {
    return true;
  }

  return false;
}