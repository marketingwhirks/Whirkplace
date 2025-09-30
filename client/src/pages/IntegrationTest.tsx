import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, XCircle, Loader2, Slack, Users, Bot } from 'lucide-react';
import { SiMicrosoft, SiOpenai } from 'react-icons/si';

export default function IntegrationTest() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const { toast } = useToast();

  const testIntegrations = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/test-integrations', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to test integrations');
      }

      const data = await response.json();
      setResults(data);
      
      // Check if all tests passed
      const allPassed = data.slack?.success && data.microsoft?.success && data.openai?.success;
      
      toast({
        title: allPassed ? 'All tests passed!' : 'Some tests failed',
        description: allPassed 
          ? 'All integrations are working correctly.' 
          : 'Please check the details below.',
        variant: allPassed ? 'default' : 'destructive'
      });
    } catch (error: any) {
      console.error('Integration test error:', error);
      toast({
        title: 'Test Failed',
        description: error.message || 'Failed to test integrations',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const renderTestResult = (name: string, icon: JSX.Element, result: any) => {
    if (!result) return null;
    
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {icon}
            {name}
            {result.success ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 ml-auto" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500 ml-auto" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">Status:</span>
              <span className={result.success ? 'text-green-600' : 'text-red-600'}>
                {result.success ? 'Working' : 'Failed'}
              </span>
            </div>
            
            {result.error && (
              <Alert variant="destructive">
                <AlertDescription>{result.error}</AlertDescription>
              </Alert>
            )}
            
            {result.success && (
              <div className="text-sm text-muted-foreground">
                {name === 'Slack' && result.botName && (
                  <div>Bot: {result.botName} | Workspace: {result.workspace}</div>
                )}
                {name === 'Microsoft 365' && result.clientId && (
                  <div>Client ID: {result.clientId.substring(0, 8)}...</div>
                )}
                {name === 'OpenAI' && result.model && (
                  <div>Model: {result.model} | Response: {result.response}</div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-integration-test">Integration Testing</h1>
        <p className="text-muted-foreground">Test all external service integrations</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Test All Integrations</CardTitle>
          <CardDescription>
            This will test Slack, Microsoft 365, and OpenAI API connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={testIntegrations} 
            disabled={loading}
            size="lg"
            data-testid="button-test-integrations"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              'Run Integration Tests'
            )}
          </Button>
        </CardContent>
      </Card>

      {results && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Test Results</h2>
          {renderTestResult('Slack', <Slack className="w-5 h-5" />, results.slack)}
          {renderTestResult('Microsoft 365', <SiMicrosoft className="w-5 h-5" />, results.microsoft)}
          {renderTestResult('OpenAI', <SiOpenai className="w-5 h-5" />, results.openai)}
          
          <div className="mt-4 text-sm text-muted-foreground">
            Tested at: {results.timestamp ? new Date(results.timestamp).toLocaleString() : 'Unknown'}
          </div>
        </div>
      )}
    </div>
  );
}