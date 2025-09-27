import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast({
        title: "Email Required",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    // For now, just show a success message
    // In production, this would send a password reset email
    setIsSubmitted(true);
    toast({
      title: "Check Your Email",
      description: "If an account exists with this email, you'll receive password reset instructions shortly.",
    });
  };

  const handleBackToLogin = () => {
    setLocation("/login");
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Mail className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle>Check Your Email</CardTitle>
            <CardDescription className="mt-2">
              We've sent password reset instructions to:
              <br />
              <strong className="text-foreground">{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg text-sm text-muted-foreground space-y-2">
              <p>• Check your inbox for an email from Whirkplace</p>
              <p>• Click the reset link in the email</p>
              <p>• Create a new secure password</p>
              <p>• The link will expire in 1 hour</p>
            </div>
            
            <div className="text-center text-sm text-muted-foreground">
              Didn't receive an email? Check your spam folder or
              <button
                onClick={() => setIsSubmitted(false)}
                className="text-primary hover:underline ml-1"
                data-testid="try-again-link"
              >
                try again
              </button>
            </div>
            
            <Button 
              onClick={handleBackToLogin}
              variant="outline"
              className="w-full"
              data-testid="back-to-login"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Reset Your Password</CardTitle>
          <CardDescription>
            Enter your email address and we'll send you instructions to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="reset-email">Email Address</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="reset-email-input"
              />
              <p className="text-sm text-muted-foreground mt-2">
                Enter the email address associated with your Whirkplace account
              </p>
            </div>
            
            <Button 
              type="submit"
              className="w-full"
              size="lg"
              data-testid="send-reset-button"
            >
              Send Reset Instructions
            </Button>
            
            <div className="text-center">
              <button
                type="button"
                onClick={handleBackToLogin}
                className="text-sm text-muted-foreground hover:text-primary"
                data-testid="back-to-login-link"
              >
                <ArrowLeft className="w-4 h-4 inline mr-1" />
                Back to Sign In
              </button>
            </div>
          </form>
          
          <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Note:</strong> Password reset functionality is currently being implemented. 
              For immediate assistance, please contact your administrator.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}