import { createContext, useContext, useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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
  organizationId?: string; // Allow override for signup flow
}

export function DynamicThemeProvider({ children, organizationId }: DynamicThemeProviderProps) {
  const { data: currentUser } = useCurrentUser();
  const [injectedStyleId] = useState(`dynamic-theme-${Date.now()}`);
  
  // Use provided organizationId or fall back to currentUser's organizationId
  const activeOrgId = organizationId || currentUser?.organizationId;

  // Fetch organization theme configuration
  const { 
    data: themeData, 
    isLoading, 
    refetch: refreshTheme 
  } = useQuery({
    queryKey: ["/api/organizations/theme", { orgId: activeOrgId }],
    queryFn: async () => {
      if (!activeOrgId) return null;
      
      try {
        const response = await apiRequest('GET', `/api/organizations/${activeOrgId}/theme`);
        return response.json();
      } catch (error) {
        console.warn("Failed to fetch theme configuration:", error);
        return null;
      }
    },
    enabled: !!activeOrgId,
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
      // Map custom theme to complete CSS variable set
      const themeConfig = themeData.themeConfig;
      const cssVariables = [];
      
      // Primary colors
      if (themeConfig["--primary"]) {
        cssVariables.push(`  --primary: ${themeConfig["--primary"]};`);
        cssVariables.push(`  --primary-foreground: hsl(210 40% 98%);`);
      }
      
      // Secondary colors
      if (themeConfig["--secondary"]) {
        cssVariables.push(`  --secondary: ${themeConfig["--secondary"]};`);
        cssVariables.push(`  --secondary-foreground: hsl(222.2 84% 4.9%);`);
      }
      
      // Accent colors
      if (themeConfig["--accent"]) {
        cssVariables.push(`  --accent: ${themeConfig["--accent"]};`);
        cssVariables.push(`  --accent-foreground: hsl(210 40% 98%);`);
      }
      
      // Font family
      if (themeConfig["--font-sans"]) {
        cssVariables.push(`  --font-sans: ${themeConfig["--font-sans"]};`);
      }
      
      // Add any other custom variables
      Object.entries(themeConfig).forEach(([key, value]) => {
        if (!key.match(/^--(primary|secondary|accent|font-sans)$/)) {
          cssVariables.push(`  ${key}: ${value};`);
        }
      });

      const styleElement = document.createElement('style');
      styleElement.id = injectedStyleId;
      styleElement.innerHTML = `
        :root {
${cssVariables.join('\n')}
        }
        
        /* Ensure custom theme takes precedence */
        .dark {
${cssVariables.join('\n')}
        }
        
        /* Apply custom font to body */
        ${themeConfig["--font-sans"] ? `
        body {
          font-family: var(--font-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
        }
        ` : ''}
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