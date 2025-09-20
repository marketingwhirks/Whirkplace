import brandGuideImage from "@/assets/brand-guide.jpeg";

export function BrandGuideViewer() {
  return (
    <div className="p-8 bg-background">
      <h1 className="text-2xl font-bold mb-4">Brand Guide</h1>
      <div className="border border-border rounded-lg overflow-hidden">
        <img 
          src={brandGuideImage} 
          alt="Brand Guide" 
          className="w-full h-auto max-w-4xl"
        />
      </div>
      <div className="mt-4 text-sm text-muted-foreground">
        Please describe the specific colors and fonts you'd like me to implement from this brand guide.
      </div>
    </div>
  );
}