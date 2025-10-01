import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}


// Cache for CSRF token  
let csrfToken: string | null = null;
let csrfTokenExpiry: number = 0;

async function getCsrfToken(forceRefresh: boolean = false): Promise<string | null> {
  // Check if we have a valid cached token (unless force refresh is requested)
  if (!forceRefresh && csrfToken && csrfTokenExpiry > Date.now()) {
    return csrfToken;
  }

  // Clear cache if forcing refresh
  if (forceRefresh) {
    csrfToken = null;
    csrfTokenExpiry = 0;
  }

  try {
    // Fetch new CSRF token
    const headers: Record<string, string> = {};
    const demoToken = localStorage.getItem('demo_token');
    if (demoToken) {
      headers['Authorization'] = `Bearer ${demoToken}`;
    }

    const response = await fetch('/api/csrf-token', {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    
    if (response.ok) {
      const data = await response.json();
      csrfToken = data.csrfToken;
      // Cache for 30 minutes (CSRF tokens are valid for 1 hour)
      csrfTokenExpiry = Date.now() + 30 * 60 * 1000;
      console.log('CSRF token fetched and cached successfully');
      return csrfToken;
    } else if (response.status === 401) {
      // Authentication required - clear cache
      console.warn('CSRF token fetch failed: authentication required (401)');
      csrfToken = null;
      csrfTokenExpiry = 0;
      // Don't throw here, let the actual request handle auth errors
    } else {
      console.error(`CSRF token fetch failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Failed to fetch CSRF token:', error);
  }
  
  return null;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Only add content-type header when sending data
  const headers: Record<string, string> = {
    ...(data ? { "Content-Type": "application/json" } : {}),
  };
  
  // Add demo token if present
  const demoToken = localStorage.getItem('demo_token');
  if (demoToken) {
    headers['Authorization'] = `Bearer ${demoToken}`;
  }

  // Add CSRF token for state-changing requests
  const needsCsrf = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
  if (needsCsrf && !demoToken) { // Demo users don't need CSRF
    let token = await getCsrfToken();
    
    // If token is null, try once more with force refresh
    // This handles cases where the cached token might be invalid
    if (!token) {
      console.warn('CSRF token not available, attempting force refresh...');
      token = await getCsrfToken(true);
    }
    
    if (token) {
      headers['X-CSRF-Token'] = token;
      console.log(`CSRF token added to ${method} request to ${url}`);
    } else {
      // Still no token - warn but proceed (server will reject if CSRF is required)
      console.error(`Warning: No CSRF token available for ${method} ${url}`);
    }
  }

  let res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  // If we get a CSRF error, try to refresh the token and retry once
  if (res.status === 403 && needsCsrf && !demoToken) {
    const errorText = await res.text();
    if (errorText.includes('CSRF')) {
      console.log('CSRF error detected, refreshing token and retrying...');
      
      // Force refresh the CSRF token
      const newToken = await getCsrfToken(true);
      if (newToken) {
        headers['X-CSRF-Token'] = newToken;
        
        // Retry the request with the new token
        res = await fetch(url, {
          method,
          headers,
          body: data ? JSON.stringify(data) : undefined,
          credentials: "include",
        });
      }
    } else {
      // Not a CSRF error, throw the original error
      throw new Error(`${res.status}: ${errorText}`);
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Handle different query key patterns
    let url: string;
    
    if (queryKey.length === 1) {
      // Simple URL: ['/api/users']
      url = queryKey[0] as string;
    } else if (queryKey.length === 2 && typeof queryKey[1] === 'object' && queryKey[1] !== null) {
      // URL with params object: ['/api/analytics/pulse', { scope: 'team', id: '123' }]
      const baseUrl = queryKey[0] as string;
      const params = queryKey[1] as Record<string, any>;
      
      // Filter out undefined/null values and build query string
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, String(value));
        }
      });
      
      const queryString = searchParams.toString();
      url = queryString ? `${baseUrl}?${queryString}` : baseUrl;
    } else {
      // Legacy path segments: ['/api/users', 'id'] or complex arrays
      url = queryKey.join("/") as string;
    }

    // Add demo token if present, otherwise rely on secure session cookies
    const headers: Record<string, string> = {};
    const demoToken = localStorage.getItem('demo_token');
    if (demoToken) {
      headers['Authorization'] = `Bearer ${demoToken}`;
    }

    const res = await fetch(url, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
