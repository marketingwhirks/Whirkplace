import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ThemeProperty {
  property: string;
  description: string;
  currentValue: string;
  category: 'Colors' | 'Fonts' | 'Spacing';
}

export function ThemeCustomizer() {
  const themeProperties: ThemeProperty[] = [
    // Colors - Light Mode
    { property: '--background', description: 'Main background color', currentValue: 'hsl(210, 40%, 98%)', category: 'Colors' },
    { property: '--foreground', description: 'Main text color', currentValue: 'hsl(222.2, 84%, 4.9%)', category: 'Colors' },
    { property: '--primary', description: 'Primary brand color (buttons, links)', currentValue: 'hsl(221.2, 83.2%, 53.3%)', category: 'Colors' },
    { property: '--primary-foreground', description: 'Text on primary color', currentValue: 'hsl(210, 40%, 98%)', category: 'Colors' },
    { property: '--secondary', description: 'Secondary background color', currentValue: 'hsl(210, 40%, 96%)', category: 'Colors' },
    { property: '--secondary-foreground', description: 'Text on secondary background', currentValue: 'hsl(222.2, 84%, 4.9%)', category: 'Colors' },
    { property: '--card', description: 'Card background color', currentValue: 'hsl(0, 0%, 100%)', category: 'Colors' },
    { property: '--card-foreground', description: 'Text on cards', currentValue: 'hsl(222.2, 84%, 4.9%)', category: 'Colors' },
    { property: '--muted', description: 'Muted/disabled elements background', currentValue: 'hsl(210, 40%, 96%)', category: 'Colors' },
    { property: '--muted-foreground', description: 'Muted/disabled text color', currentValue: 'hsl(215.4, 16.3%, 46.9%)', category: 'Colors' },
    { property: '--accent', description: 'Accent color (hover states)', currentValue: 'hsl(210, 40%, 96%)', category: 'Colors' },
    { property: '--destructive', description: 'Error/danger color', currentValue: 'hsl(0, 84.2%, 60.2%)', category: 'Colors' },
    { property: '--border', description: 'Border color', currentValue: 'hsl(214.3, 31.8%, 91.4%)', category: 'Colors' },
    
    // Fonts
    { property: '--font-sans', description: 'Main font family', currentValue: 'Inter, system-ui, sans-serif', category: 'Fonts' },
    { property: '--font-serif', description: 'Serif font family', currentValue: 'Georgia, serif', category: 'Fonts' },
    { property: '--font-mono', description: 'Monospace font family', currentValue: 'Menlo, monospace', category: 'Fonts' },
    
    // Spacing
    { property: '--radius', description: 'Border radius', currentValue: '0.5rem', category: 'Spacing' },
    { property: '--spacing', description: 'Base spacing unit', currentValue: '0.25rem', category: 'Spacing' },
  ];

  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const handleValueChange = (property: string, value: string) => {
    setCustomValues(prev => ({
      ...prev,
      [property]: value
    }));
  };

  const generateCSS = () => {
    const updates = Object.entries(customValues)
      .filter(([_, value]) => value.trim() !== '')
      .map(([property, value]) => `  ${property}: ${value};`)
      .join('\n');
    
    if (updates) {
      return `:root {\n${updates}\n}`;
    }
    return '';
  };

  const groupedProperties = themeProperties.reduce((acc, prop) => {
    if (!acc[prop.category]) acc[prop.category] = [];
    acc[prop.category].push(prop);
    return acc;
  }, {} as Record<string, ThemeProperty[]>);

  return (
    <div className="space-y-6 p-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Theme Customizer</h1>
        <p className="text-muted-foreground">
          Current theme values with options to customize colors, fonts, and spacing
        </p>
      </div>

      {Object.entries(groupedProperties).map(([category, properties]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{category}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Property</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[250px]">Current Value</TableHead>
                  <TableHead className="w-[250px]">New Value (Optional)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {properties.map((prop) => (
                  <TableRow key={prop.property}>
                    <TableCell className="font-mono text-xs">{prop.property}</TableCell>
                    <TableCell>{prop.description}</TableCell>
                    <TableCell className="font-mono text-xs">{prop.currentValue}</TableCell>
                    <TableCell>
                      <Input
                        placeholder={category === 'Colors' ? 'e.g. #1E40AF or hsl(220, 91%, 60%)' : 
                                   category === 'Fonts' ? 'e.g. Roboto, sans-serif' : 
                                   'e.g. 0.75rem'}
                        value={customValues[prop.property] || ''}
                        onChange={(e) => handleValueChange(prop.property, e.target.value)}
                        className="text-xs"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {Object.keys(customValues).some(key => customValues[key].trim() !== '') && (
        <Card>
          <CardHeader>
            <CardTitle>Generated CSS</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto">
              <code>{generateCSS()}</code>
            </pre>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => {
                navigator.clipboard.writeText(generateCSS());
              }}>
                Copy CSS
              </Button>
              <Button variant="outline" onClick={() => setCustomValues({})}>
                Clear All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-sm text-muted-foreground space-y-2">
        <p><strong>Color Format Examples:</strong></p>
        <ul className="list-disc list-inside space-y-1">
          <li>Hex: #1E40AF, #10B981</li>
          <li>HSL: hsl(220, 91%, 60%), hsl(159, 100%, 36%)</li>
          <li>RGB: rgb(30, 64, 175)</li>
        </ul>
        <p><strong>Font Format Examples:</strong></p>
        <ul className="list-disc list-inside space-y-1">
          <li>Google Fonts: 'Roboto', sans-serif</li>
          <li>System Fonts: 'SF Pro Display', system-ui, sans-serif</li>
          <li>With fallbacks: 'Inter', 'Helvetica Neue', Arial, sans-serif</li>
        </ul>
      </div>
    </div>
  );
}