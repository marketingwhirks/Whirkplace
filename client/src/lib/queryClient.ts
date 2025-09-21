import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// CSRF token management
let cachedCSRFToken: string | null = null;

async function getCSRFToken(): Promise<string | null> {
  try {
    // Add localStorage auth headers for CSRF token request
    const authUserId = localStorage.getItem('auth_user_id');
    const headers: Record<string, string> = {};
    
    if (authUserId) {
      headers['x-auth-user-id'] = authUserId;
    }

    const response = await fetch('/api/csrf-token', {
      credentials: 'include',
      headers,
    });
    
    if (response.ok) {
      const data = await response.json();
      cachedCSRFToken = data.csrfToken;
      return cachedCSRFToken;
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to fetch CSRF token:', error);
    return null;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Add localStorage auth headers to bypass cookie issues
  const authUserId = localStorage.getItem('auth_user_id');
  const headers: Record<string, string> = {
    ...(data ? { "Content-Type": "application/json" } : {}),
  };
  
  if (authUserId) {
    headers['x-auth-user-id'] = authUserId;
  }

  // Add CSRF token for state-changing requests
  const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
  if (isStateChanging) {
    // Try to get CSRF token
    let csrfToken = cachedCSRFToken;
    if (!csrfToken) {
      csrfToken = await getCSRFToken();
    }
    
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  // Check for new CSRF token in response headers
  const newCSRFToken = res.headers.get('X-CSRF-Token');
  if (newCSRFToken) {
    cachedCSRFToken = newCSRFToken;
  }

  // If CSRF token failed, try to get a new one and retry once
  if (!res.ok && res.status === 403 && isStateChanging) {
    try {
      const errorText = await res.clone().text();
      if (errorText.includes('CSRF')) {
        console.log('CSRF token failed, attempting to refresh and retry...');
        cachedCSRFToken = null; // Clear cached token
        const newToken = await getCSRFToken();
        
        if (newToken) {
          headers['x-csrf-token'] = newToken;
          
          // Retry the request with new token
          const retryRes = await fetch(url, {
            method,
            headers,
            body: data ? JSON.stringify(data) : undefined,
            credentials: "include",
          });
          
          // Check for new CSRF token in retry response
          const retryCSRFToken = retryRes.headers.get('X-CSRF-Token');
          if (retryCSRFToken) {
            cachedCSRFToken = retryCSRFToken;
          }
          
          await throwIfResNotOk(retryRes);
          return retryRes;
        }
      }
    } catch (retryError) {
      console.warn('CSRF retry failed:', retryError);
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

    // Add localStorage auth headers to bypass cookie issues
    const authUserId = localStorage.getItem('auth_user_id');
    const headers: Record<string, string> = {};
    
    if (authUserId) {
      headers['x-auth-user-id'] = authUserId;
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
