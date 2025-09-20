import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Palette, Eye, RotateCcw } from "lucide-react";

const themeOnboardingSchema = z.object({
  enableCustomTheme: z.boolean(),
  primaryColor: z.string().optional(),
  fontFamily: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
});

type ThemeOnboardingForm = z.infer<typeof themeOnboardingSchema>;

interface ThemeOnboardingProps {
  onComplete: (themeData: ThemeOnboardingForm) => void;
  onSkip: () => void;
  isLoading?: boolean;
  className?: string;
}

const colorPresets = [
  { name: "Blue", primary: "#2563eb", secondary: "#eff6ff", accent: "#3b82f6" },
  { name: "Green", primary: "#059669", secondary: "#f0fdf4", accent: "#10b981" },
  { name: "Purple", primary: "#7c3aed", secondary: "#faf5ff", accent: "#8b5cf6" },
  { name: "Orange", primary: "#ea580c", secondary: "#fff7ed", accent: "#f97316" },
  { name: "Pink", primary: "#db2777", secondary: "#fdf2f8", accent: "#ec4899" },
  { name: "Teal", primary: "#0891b2", secondary: "#f0fdfa", accent: "#06b6d4" },
];

const fontPresets = [
  "Inter, sans-serif",
  "Roboto, sans-serif", 
  "Open Sans, sans-serif",
  "Poppins, sans-serif",
  "Montserrat, sans-serif",
  "Lato, sans-serif",
];

export function ThemeOnboarding({ onComplete, onSkip, isLoading = false, className }: ThemeOnboardingProps) {
  const [previewTheme, setPreviewTheme] = useState<any>(null);

  const form = useForm<ThemeOnboardingForm>({
    resolver: zodResolver(themeOnboardingSchema),
    defaultValues: {
      enableCustomTheme: false,
      primaryColor: "",
      fontFamily: "",
      secondaryColor: "",
      accentColor: "",
    },
  });

  const watchEnableCustomTheme = form.watch("enableCustomTheme");

  const applyColorPreset = (preset: typeof colorPresets[0]) => {
    form.setValue("primaryColor", preset.primary);
    form.setValue("secondaryColor", preset.secondary);
    form.setValue("accentColor", preset.accent);
    updatePreview();
  };

  const applyFontPreset = (font: string) => {
    form.setValue("fontFamily", font);
    updatePreview();
  };

  const updatePreview = () => {
    const values = form.getValues();
    if (values.enableCustomTheme) {
      const themeConfig: Record<string, string> = {};
      
      if (values.primaryColor) themeConfig["--primary"] = `hsl(${hexToHsl(values.primaryColor)})`;
      if (values.secondaryColor) themeConfig["--secondary"] = `hsl(${hexToHsl(values.secondaryColor)})`;
      if (values.accentColor) themeConfig["--accent"] = `hsl(${hexToHsl(values.accentColor)})`;
      if (values.fontFamily) themeConfig["--font-sans"] = values.fontFamily;
      
      setPreviewTheme(themeConfig);
    } else {
      setPreviewTheme(null);
    }
  };

  // Simple hex to HSL conversion for theme preview
  const hexToHsl = (hex: string): string => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    const sum = max + min;
    const lightness = sum / 2;

    let hue = 0;
    let saturation = 0;

    if (diff !== 0) {
      saturation = lightness > 0.5 ? diff / (2 - sum) : diff / sum;
      
      if (max === r) hue = ((g - b) / diff) + (g < b ? 6 : 0);
      else if (max === g) hue = (b - r) / diff + 2;
      else hue = (r - g) / diff + 4;
      
      hue *= 60;
    }

    return `${Math.round(hue)}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%`;
  };

  const onSubmit = (data: ThemeOnboardingForm) => {
    if (data.enableCustomTheme) {
      // Convert form data to theme config
      const themeConfig: Record<string, string> = {};
      
      if (data.primaryColor) themeConfig["--primary"] = `hsl(${hexToHsl(data.primaryColor)})`;
      if (data.secondaryColor) themeConfig["--secondary"] = `hsl(${hexToHsl(data.secondaryColor)})`;
      if (data.accentColor) themeConfig["--accent"] = `hsl(${hexToHsl(data.accentColor)})`;
      if (data.fontFamily) themeConfig["--font-sans"] = data.fontFamily;
      
      onComplete({
        ...data,
        themeConfig
      } as any);
    } else {
      onComplete(data);
    }
  };

  return (
    <div className={`max-w-4xl mx-auto space-y-6 ${className}`} data-testid="theme-onboarding">
      <div className="text-center space-y-2">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Palette className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-3xl font-bold">Customize Your Brand</h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Make the platform your own with custom colors and fonts that match your brand identity.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Switch
                  checked={watchEnableCustomTheme}
                  onCheckedChange={(checked) => {
                    form.setValue("enableCustomTheme", checked);
                    if (!checked) {
                      setPreviewTheme(null);
                    }
                  }}
                />
                Enable Custom Theme
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {watchEnableCustomTheme 
                  ? "Customize colors and fonts to match your brand"
                  : "Use the default theme (you can customize this later in settings)"
                }
              </p>
            </CardHeader>

            {watchEnableCustomTheme && (
              <CardContent className="space-y-6">
                {/* Color Presets */}
                <div className="space-y-3">
                  <Label className="text-base font-medium">Quick Color Presets</Label>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    {colorPresets.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => applyColorPreset(preset)}
                        className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:border-primary transition-colors"
                        data-testid={`color-preset-${preset.name.toLowerCase()}`}
                      >
                        <div 
                          className="w-6 h-6 rounded-full" 
                          style={{ backgroundColor: preset.primary }}
                        />
                        <span className="text-xs">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Colors */}
                <div className="grid md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="primaryColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Color</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input
                              type="color"
                              {...field}
                              className="w-12 h-10 p-1 border border-border"
                              onChange={(e) => {
                                field.onChange(e);
                                updatePreview();
                              }}
                              data-testid="input-primary-color"
                            />
                            <Input
                              type="text"
                              placeholder="#2563eb"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e);
                                updatePreview();
                              }}
                              data-testid="input-primary-color-text"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="secondaryColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Secondary Color</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input
                              type="color"
                              {...field}
                              className="w-12 h-10 p-1 border border-border"
                              onChange={(e) => {
                                field.onChange(e);
                                updatePreview();
                              }}
                              data-testid="input-secondary-color"
                            />
                            <Input
                              type="text"
                              placeholder="#eff6ff"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e);
                                updatePreview();
                              }}
                              data-testid="input-secondary-color-text"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="accentColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Accent Color</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input
                              type="color"
                              {...field}
                              className="w-12 h-10 p-1 border border-border"
                              onChange={(e) => {
                                field.onChange(e);
                                updatePreview();
                              }}
                              data-testid="input-accent-color"
                            />
                            <Input
                              type="text"
                              placeholder="#3b82f6"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e);
                                updatePreview();
                              }}
                              data-testid="input-accent-color-text"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Font Selection */}
                <div className="space-y-3">
                  <Label className="text-base font-medium">Font Family</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {fontPresets.map((font) => (
                      <button
                        key={font}
                        type="button"
                        onClick={() => applyFontPreset(font)}
                        className="p-3 text-left rounded-lg border border-border hover:border-primary transition-colors"
                        style={{ fontFamily: font }}
                        data-testid={`font-preset-${font.split(',')[0].toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <div className="font-medium">Aa</div>
                        <div className="text-xs text-muted-foreground">
                          {font.split(',')[0]}
                        </div>
                      </button>
                    ))}
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="fontFamily"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom Font (optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., 'Roboto', sans-serif"
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              updatePreview();
                            }}
                            data-testid="input-custom-font"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Preview */}
                {previewTheme && (
                  <div className="space-y-3">
                    <Label className="text-base font-medium flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Theme Preview
                    </Label>
                    <div 
                      className="p-4 rounded-lg border"
                      style={previewTheme as any}
                    >
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold" style={{ color: 'hsl(var(--primary))' }}>
                          Your Brand Colors
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          This is how your custom theme will look in the application.
                        </p>
                        <Button size="sm" className="mt-2">
                          Sample Button
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          <div className="flex justify-between">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onSkip}
              data-testid="button-skip-theme"
            >
              Skip for Now
            </Button>
            <div className="flex gap-2">
              {watchEnableCustomTheme && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    form.reset();
                    setPreviewTheme(null);
                  }}
                  data-testid="button-reset-theme"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              )}
              <Button 
                type="submit" 
                disabled={isLoading}
                data-testid="button-save-theme"
              >
                {isLoading ? "Saving..." : "Continue"}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}