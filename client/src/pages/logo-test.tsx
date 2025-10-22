import logo16 from '@/assets/logo-16.png';
import logo32 from '@/assets/logo-32.png';
import logo64 from '@/assets/logo-64.png';
import logo128 from '@/assets/logo-128.png';
import logo192 from '@/assets/logo-192.png';
import logo512 from '@/assets/logo-512.png';
import logo1024 from '@/assets/logo-1024.png';

export function LogoTestPage() {
  const logos = [
    { src: logo16, size: 16, name: 'logo-16.png' },
    { src: logo32, size: 32, name: 'logo-32.png' },
    { src: logo64, size: 64, name: 'logo-64.png' },
    { src: logo128, size: 128, name: 'logo-128.png' },
    { src: logo192, size: 192, name: 'logo-192.png' },
    { src: logo512, size: 512, name: 'logo-512.png' },
    { src: logo1024, size: 1024, name: 'logo-1024.png' },
  ];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-foreground">
          Whirkplace Logo PNG Test
        </h1>
        
        <div className="bg-card rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-card-foreground">
            Generated PNG Logos - Blue (#1b365d) Square with Green (#84ae56) Heart
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {logos.map(({ src, size, name }) => (
              <div key={name} className="bg-background rounded-lg p-4 border border-border">
                <div className="text-sm text-muted-foreground mb-2">
                  {name} ({size}x{size}px)
                </div>
                
                <div className="flex items-center justify-center p-4 bg-muted rounded">
                  <img 
                    src={src} 
                    alt={`Logo ${size}x${size}`}
                    width={Math.min(size, 128)}
                    height={Math.min(size, 128)}
                    className="object-contain"
                  />
                </div>
                
                <div className="mt-2 text-xs text-muted-foreground">
                  Display size: {Math.min(size, 128)}px
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-8 p-4 bg-muted rounded-lg">
            <h3 className="font-semibold mb-2">Logo Information:</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>✅ All PNG files generated from icon.svg</li>
              <li>✅ Blue background: #1b365d</li>
              <li>✅ Green heart: #84ae56</li>
              <li>✅ Multiple sizes available for different use cases</li>
              <li>📁 Location: client/src/assets/</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}