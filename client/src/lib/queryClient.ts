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

async function getCsrfToken(): Promise<string | null> {
  // Check if we have a valid cached token
  if (csrfToken && csrfTokenExpiry > Date.now()) {
    return csrfToken;
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
      return csrfToken;
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
    const token = await getCsrfToken();
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

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
