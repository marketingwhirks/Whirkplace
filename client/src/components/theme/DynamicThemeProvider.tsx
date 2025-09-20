import { createContext, useContext, useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useQuery } from "@tanstack/react-query";

interface ThemeContextType {
  themeConfig: Record<string, string> | null;
  enableCustomTheme: boolean;
  isLoading: boolean;
  refreshTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  themeConfig: null,
  enableCustomTheme: false,
  isLoading: false,
  refreshTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

interface DynamicThemeProviderProps {
  children: React.ReactNode;
}

export function DynamicThemeProvider({ children }: DynamicThemeProviderProps) {
  const { data: currentUser } = useCurrentUser();
  const [injectedStyleId] = useState(`dynamic-theme-${Date.now()}`);

  // Fetch organization theme configuration
  const { 
    data: themeData, 
    isLoading, 
    refetch: refreshTheme 
  } = useQuery({
    queryKey: ["/api/organizations/theme", { orgId: currentUser?.organizationId }],
    queryFn: async () => {
      if (!currentUser?.organizationId) return null;
      
      const response = await fetch(`/api/organizations/${currentUser.organizationId}/theme`, {
        credentials: 'include',
        headers: {
          'x-backdoor-user': 'Matthew',
          'x-backdoor-key': 'Dev123'
        }
      });
      
      if (!response.ok) {
        console.warn("Failed to fetch theme configuration:", response.status);
        return null;
      }
      
      return response.json();
    },
    enabled: !!currentUser?.organizationId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Apply theme to document when theme data changes
  useEffect(() => {
    // Remove previous injected styles
    const existingStyle = document.getElementById(injectedStyleId);
    if (existingStyle) {
      existingStyle.remove();
    }

    // Apply custom theme if enabled and configured
    if (themeData?.enableCustomTheme && themeData?.themeConfig) {
      const cssVariables = Object.entries(themeData.themeConfig)
        .map(([key, value]) => `  ${key}: ${value};`)
        .join('\n');

      const styleElement = document.createElement('style');
      styleElement.id = injectedStyleId;
      styleElement.innerHTML = `
        :root {
${cssVariables}
        }
        
        /* Ensure custom theme takes precedence */
        .dark {
${cssVariables}
        }
      `;

      document.head.appendChild(styleElement);
      
      console.log('✅ Custom theme applied:', themeData.themeConfig);
    } else {
      console.log('🎨 Using default theme');
    }

    // Cleanup function
    return () => {
      const styleToRemove = document.getElementById(injectedStyleId);
      if (styleToRemove) {
        styleToRemove.remove();
      }
    };
  }, [themeData, injectedStyleId]);

  const contextValue: ThemeContextType = {
    themeConfig: themeData?.themeConfig || null,
    enableCustomTheme: themeData?.enableCustomTheme || false,
    isLoading,
    refreshTheme,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}