import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, User, Mail, Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

// Full schema for validation
const signupSchema = z.object({
  // Organization details
  organizationName: z.string().min(2, "Organization name must be at least 2 characters").max(100, "Organization name too long"),
  industry: z.string().min(1, "Please select your industry"),
  organizationSize: z.string().min(1, "Please select organization size"),
  
  // Admin user details
  firstName: z.string().min(2, "First name must be at least 2 characters").max(50, "First name too long"),
  lastName: z.string().min(2, "Last name must be at least 2 characters").max(50, "Last name too long"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password too long"),
  confirmPassword: z.string(),
  
  // Agreement
  acceptTerms: z.boolean().refine(val => val === true, "You must accept the terms and conditions"),
  subscribeNewsletter: z.boolean().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Page-specific schemas for partial validation
const page1Schema = z.object({
  organizationName: z.string().min(2, "Organization name must be at least 2 characters").max(100, "Organization name too long"),
  industry: z.string().min(1, "Please select your industry"),
});

const page2Schema = z.object({
  organizationSize: z.string().min(1, "Please select organization size"),
});

const page3Schema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters").max(50, "First name too long"),
  lastName: z.string().min(2, "Last name must be at least 2 characters").max(50, "Last name too long"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password too long"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const page4Schema = z.object({
  acceptTerms: z.boolean().refine(val => val === true, "You must accept the terms and conditions"),
  subscribeNewsletter: z.boolean().optional(),
});

type SignupForm = z.infer<typeof signupSchema>;

const organizationSizes = [
  { value: "1-10", label: "1-10 employees" },
  { value: "11-50", label: "11-50 employees" },
  { value: "51-200", label: "51-200 employees" },
  { value: "201-1000", label: "201-1000 employees" },
  { value: "1000+", label: "1000+ employees" },
];

const industries = [
  { value: "technology", label: "Technology" },
  { value: "healthcare", label: "Healthcare" },
  { value: "finance", label: "Finance & Banking" },
  { value: "retail", label: "Retail & E-commerce" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "education", label: "Education" },
  { value: "hospitality", label: "Hospitality & Tourism" },
  { value: "realestate", label: "Real Estate" },
  { value: "nonprofit", label: "Non-profit" },
  { value: "government", label: "Government" },
  { value: "consulting", label: "Consulting & Professional Services" },
  { value: "media", label: "Media & Entertainment" },
  { value: "transportation", label: "Transportation & Logistics" },
  { value: "energy", label: "Energy & Utilities" },
  { value: "agriculture", label: "Agriculture" },
  { value: "other", label: "Other" },
];

interface BusinessSignupProps {
  onSignupComplete: (data: SignupForm) => void;
  isLoading?: boolean;
  className?: string;
}

export function BusinessSignup({ onSignupComplete, isLoading = false, className }: BusinessSignupProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();
  
  // Persistent form data state
  const [formData, setFormData] = useState<Partial<SignupForm>>({
    organizationName: "",
    industry: "",
    organizationSize: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
    subscribeNewsletter: true,
  });

  const form = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: formData,
  });

  const getPageSchema = (page: number) => {
    switch (page) {
      case 1:
        return page1Schema;
      case 2:
        return page2Schema;
      case 3:
        return page3Schema;
      case 4:
        return page4Schema;
      default:
        return signupSchema;
    }
  };

  const validateCurrentPage = async () => {
    const currentValues = form.getValues();
    const pageSchema = getPageSchema(currentPage);
    
    try {
      // Extract only the fields relevant to the current page
      const pageData: any = {};
      Object.keys(pageSchema.shape || {}).forEach(key => {
        pageData[key] = currentValues[key as keyof SignupForm];
      });
      
      await pageSchema.parseAsync(pageData);
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Set errors for the current page fields
        error.errors.forEach(err => {
          form.setError(err.path[0] as keyof SignupForm, {
            message: err.message,
          });
        });
      }
      return false;
    }
  };

  const handleNext = async () => {
    const isValid = await validateCurrentPage();
    if (!isValid) return;
    
    // Save current page data to persistent state
    const currentValues = form.getValues();
    setFormData(prev => ({ ...prev, ...currentValues }));
    
    setCurrentPage(prev => prev + 1);
  };

  const handleBack = () => {
    // Save current page data before going back
    const currentValues = form.getValues();
    setFormData(prev => ({ ...prev, ...currentValues }));
    
    setCurrentPage(prev => prev - 1);
  };

  const onSubmit = async (data: SignupForm) => {
    try {
      // Merge all form data to ensure everything is included
      const completeData = {
        ...formData,
        ...data,
      };
      
      // Remove confirmPassword before sending to API
      const { confirmPassword, ...submitData } = completeData;
      
      onSignupComplete(submitData as SignupForm);
    } catch (error) {
      toast({
        title: "Signup Failed",
        description: "There was an error creating your account. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getStepTitle = () => {
    switch (currentPage) {
      case 1:
        return "Organization Information";
      case 2:
        return "Organization Size";
      case 3:
        return "Administrator Account";
      case 4:
        return "Terms & Conditions";
      default:
        return "";
    }
  };

  const getStepDescription = () => {
    switch (currentPage) {
      case 1:
        return "Tell us about your organization";
      case 2:
        return "How big is your team?";
      case 3:
        return "Create your administrator account";
      case 4:
        return "Review and accept our terms";
      default:
        return "";
    }
  };

  const progress = (currentPage / 4) * 100;

  return (
    <div className={`max-w-2xl mx-auto ${className}`} data-testid="business-signup">
      <Card>
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">Create Your Business Account</CardTitle>
            <CardDescription className="text-base mt-2">
              {getStepDescription()}
            </CardDescription>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Step {currentPage} of 4</span>
              <span>{Math.round(progress)}% Complete</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardHeader>
        
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Page 1: Organization Info */}
              {currentPage === 1 && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-sm font-medium text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span>{getStepTitle()}</span>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="organizationName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization Name *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Acme Corporation" 
                            {...field} 
                            data-testid="input-organization-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry *</FormLabel>
                        <FormControl>
                          <select 
                            {...field} 
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            data-testid="select-industry"
                          >
                            <option value="">Select your industry</option>
                            {industries.map((ind) => (
                              <option key={ind.value} value={ind.value}>
                                {ind.label}
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Page 2: Organization Size */}
              {currentPage === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-sm font-medium text-muted-foreground">
                    <Info className="h-4 w-4" />
                    <span>{getStepTitle()}</span>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="organizationSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization Size *</FormLabel>
                        <FormControl>
                          <select 
                            {...field} 
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            data-testid="select-organization-size"
                          >
                            <option value="">Select organization size</option>
                            {organizationSizes.map((size) => (
                              <option key={size.value} value={size.value}>
                                {size.label}
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <FormDescription>
                          This helps us tailor the experience to your needs
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="mt-8 p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-medium mb-2">Why we ask this:</h4>
                    <p className="text-sm text-muted-foreground">
                      Knowing your organization size helps us recommend the right features, 
                      pricing plans, and implementation strategies for your team.
                    </p>
                  </div>
                </div>
              )}

              {/* Page 3: Admin Account */}
              {currentPage === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-sm font-medium text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>{getStepTitle()}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="John" 
                              {...field} 
                              data-testid="input-first-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Doe" 
                              {...field} 
                              data-testid="input-last-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address *</FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="john.doe@company.com" 
                            {...field} 
                            data-testid="input-email"
                          />
                        </FormControl>
                        <FormDescription>
                          This will be your login email and the primary contact for your organization
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input 
                              type={showPassword ? "text" : "password"} 
                              placeholder="Create a strong password"
                              {...field} 
                              data-testid="input-password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => setShowPassword(!showPassword)}
                              data-testid="toggle-password"
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormDescription>
                          Must be at least 8 characters long
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input 
                              type={showConfirmPassword ? "text" : "password"} 
                              placeholder="Confirm your password"
                              {...field} 
                              data-testid="input-confirm-password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              data-testid="toggle-confirm-password"
                            >
                              {showConfirmPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Page 4: Terms & Newsletter */}
              {currentPage === 4 && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-sm font-medium text-muted-foreground">
                    <CheckCircle className="h-4 w-4" />
                    <span>{getStepTitle()}</span>
                  </div>
                  
                  {/* Summary of entered information */}
                  <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    <h4 className="font-medium mb-3">Please review your information:</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Organization:</div>
                      <div className="font-medium">{formData.organizationName || form.getValues("organizationName")}</div>
                      
                      <div className="text-muted-foreground">Industry:</div>
                      <div className="font-medium">
                        {industries.find(i => i.value === (formData.industry || form.getValues("industry")))?.label || "Not selected"}
                      </div>
                      
                      <div className="text-muted-foreground">Size:</div>
                      <div className="font-medium">
                        {organizationSizes.find(s => s.value === (formData.organizationSize || form.getValues("organizationSize")))?.label || "Not selected"}
                      </div>
                      
                      <div className="text-muted-foreground">Admin Name:</div>
                      <div className="font-medium">
                        {formData.firstName || form.getValues("firstName")} {formData.lastName || form.getValues("lastName")}
                      </div>
                      
                      <div className="text-muted-foreground">Admin Email:</div>
                      <div className="font-medium">{formData.email || form.getValues("email")}</div>
                    </div>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="acceptTerms"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-accept-terms"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-normal">
                            I accept the{" "}
                            <a href="/terms" className="text-primary hover:underline" target="_blank">
                              Terms of Service
                            </a>{" "}
                            and{" "}
                            <a href="/privacy" className="text-primary hover:underline" target="_blank">
                              Privacy Policy
                            </a>{" "}
                            *
                          </FormLabel>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="subscribeNewsletter"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-newsletter"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-normal">
                            Send me product updates and team management tips
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Navigation buttons */}
              <div className="flex justify-between">
                {currentPage > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    data-testid="button-back"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                )}
                
                {currentPage < 4 ? (
                  <Button
                    type="button"
                    onClick={handleNext}
                    className={currentPage === 1 ? "ml-auto" : ""}
                    data-testid="button-next"
                  >
                    Next
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button 
                    type="submit" 
                    className="ml-auto" 
                    size="lg"
                    disabled={isLoading}
                    data-testid="button-create-account"
                  >
                    {isLoading ? (
                      "Creating Account..."
                    ) : (
                      <>
                        Create Account & Continue
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </form>
          </Form>
          
          {currentPage === 1 && (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <a href="/login" className="text-primary hover:underline font-medium">
                Sign in here
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}