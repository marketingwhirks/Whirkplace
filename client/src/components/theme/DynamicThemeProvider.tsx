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
      } catch (error: any) {
        // Only log non-authentication errors (401 is expected when not logged in)
        if (error?.status !== 401) {
          console.warn("Failed to fetch theme configuration:", error);
        }
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
      // Validate CSS custom property names and values
      const isValidCSSPropertyName = (name: string): boolean => {
        return /^--[a-z0-9-]{1,64}$/i.test(name);
      };

      const isValidCSSValue = (value: string): boolean => {
        // Allow only safe CSS values: colors, fonts, and basic measurements
        const safePatterns = [
          /^#[0-9a-f]{3,8}$/i, // hex colors
          /^rgb\(\s*\d+(\.\d+)?\s*[,\s]\s*\d+(\.\d+)?\s*[,\s]\s*\d+(\.\d+)?\s*\)$/i, // rgb colors (comma or space separated)
          /^rgba\(\s*\d+(\.\d+)?\s*[,\s]\s*\d+(\.\d+)?\s*[,\s]\s*\d+(\.\d+)?\s*[,\/\s]\s*[0-1](\.\d+)?\s*\)$/i, // rgba colors
          /^hsl\(\s*\d+(\.\d+)?\s*[,\s]\s*\d+(\.\d+)?%\s*[,\s]\s*\d+(\.\d+)?%\s*\)$/i, // hsl colors (comma or space separated)
          /^hsla\(\s*\d+(\.\d+)?\s*[,\s]\s*\d+(\.\d+)?%\s*[,\s]\s*\d+(\.\d+)?%\s*[,\/\s]\s*[0-1](\.\d+)?\s*\)$/i, // hsla colors
          /^["']?[a-zA-Z0-9 \-]+["']?(\s*,\s*["']?[a-zA-Z0-9 \-]+["']?)*$/i, // font families with quotes and stacks
          /^\d+(\.\d+)?(px|em|rem|%|vh|vw|pt|pc|in|cm|mm|ex|ch)$/i, // measurements
          /^(transparent|inherit|initial|unset|none|auto|normal|bold|lighter|bolder|[1-9]00)$/i, // CSS keywords
          /^(red|blue|green|black|white|gray|grey|yellow|orange|purple|pink|brown|cyan|magenta|lime|navy|teal|olive|maroon|fuchsia|aqua|silver)$/i // named colors
        ];
        
        return typeof value === 'string' && 
               value.length > 0 && 
               value.length <= 200 && 
               !/(javascript|data|expression|@import|@media|url\()/i.test(value) &&
               safePatterns.some(pattern => pattern.test(value.trim()));
      };

      // Apply theme variables programmatically to prevent CSS injection
      const themeConfig = themeData.themeConfig;
      const appliedVariables: string[] = [];
      
      // Standard theme properties with foreground pairs
      const standardProperties = [
        { key: '--primary', foreground: '--primary-foreground', foregroundValue: 'hsl(210 40% 98%)' },
        { key: '--secondary', foreground: '--secondary-foreground', foregroundValue: 'hsl(222.2 84% 4.9%)' },
        { key: '--accent', foreground: '--accent-foreground', foregroundValue: 'hsl(210 40% 98%)' }
      ];

      // Set standard properties and their foregrounds
      standardProperties.forEach(({ key, foreground, foregroundValue }) => {
        if (themeConfig[key] && isValidCSSValue(themeConfig[key])) {
          document.documentElement.style.setProperty(key, themeConfig[key]);
          document.documentElement.style.setProperty(foreground, foregroundValue);
          appliedVariables.push(key, foreground);
        }
      });

      // Set font family on body element if provided
      if (themeConfig["--font-sans"] && isValidCSSValue(themeConfig["--font-sans"])) {
        document.body.style.fontFamily = `${themeConfig["--font-sans"]}, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`;
        appliedVariables.push("--font-sans");
      }

      // Apply any other valid custom properties
      Object.entries(themeConfig).forEach(([key, value]) => {
        if (typeof value === 'string' && 
            !appliedVariables.includes(key) && 
            isValidCSSPropertyName(key) && 
            isValidCSSValue(value)) {
          document.documentElement.style.setProperty(key, value);
          appliedVariables.push(key);
        } else if (!appliedVariables.includes(key)) {
          console.warn(`Rejected invalid theme property: ${key} = ${value}`);
        }
      });

      // Create marker element to track applied theme
      const styleElement = document.createElement('meta');
      styleElement.id = injectedStyleId;
      styleElement.setAttribute('name', 'theme-applied');
      styleElement.setAttribute('content', appliedVariables.join(','));
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