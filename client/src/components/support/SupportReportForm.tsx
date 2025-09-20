import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AlertTriangle, Bug, HelpCircle, Lightbulb } from "lucide-react";

const supportFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be under 200 characters"),
  description: z.string().min(10, "Description must be at least 10 characters").max(2000, "Description must be under 2000 characters"),
  category: z.enum(["bug", "question", "feature_request"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  pagePath: z.string().optional(),
  metadata: z.object({}).optional()
});

type SupportFormData = z.infer<typeof supportFormSchema>;

interface SupportReportFormProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategory?: "bug" | "question" | "feature_request";
}

const categoryIcons = {
  bug: <Bug className="w-4 h-4" />,
  question: <HelpCircle className="w-4 h-4" />,
  feature_request: <Lightbulb className="w-4 h-4" />
};

const severityIcons = {
  low: "🟢",
  medium: "🟡", 
  high: "🟠",
  critical: "🔴"
};

export function SupportReportForm({ isOpen, onClose, defaultCategory = "bug" }: SupportReportFormProps) {
  const { toast } = useToast();
  const [location] = useLocation();
  
  const form = useForm<SupportFormData>({
    resolver: zodResolver(supportFormSchema),
    defaultValues: {
      title: "",
      description: "",
      category: defaultCategory,
      severity: "medium",
      pagePath: location,
      metadata: {}
    }
  });

  const submitMutation = useMutation({
    mutationFn: (data: SupportFormData) => apiRequest("POST", "/api/support/reports", data),
    onSuccess: () => {
      toast({
        title: "Report Submitted! 📨",
        description: "Your support request has been sent to our team. We'll get back to you soon!",
      });
      form.reset();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Submit",
        description: error.message || "Please try again or contact support directly.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SupportFormData) => {
    submitMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[525px]" data-testid="dialog-support-report">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Report a Problem
          </DialogTitle>
          <DialogDescription>
            Help us improve by reporting bugs, asking questions, or suggesting new features.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-category">
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="bug">
                          <div className="flex items-center gap-2">
                            {categoryIcons.bug}
                            Bug Report
                          </div>
                        </SelectItem>
                        <SelectItem value="question">
                          <div className="flex items-center gap-2">
                            {categoryIcons.question}
                            Question
                          </div>
                        </SelectItem>
                        <SelectItem value="feature_request">
                          <div className="flex items-center gap-2">
                            {categoryIcons.feature_request}
                            Feature Request
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="severity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-severity">
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">
                          <div className="flex items-center gap-2">
                            <span>{severityIcons.low}</span>
                            Low
                          </div>
                        </SelectItem>
                        <SelectItem value="medium">
                          <div className="flex items-center gap-2">
                            <span>{severityIcons.medium}</span>
                            Medium
                          </div>
                        </SelectItem>
                        <SelectItem value="high">
                          <div className="flex items-center gap-2">
                            <span>{severityIcons.high}</span>
                            High
                          </div>
                        </SelectItem>
                        <SelectItem value="critical">
                          <div className="flex items-center gap-2">
                            <span>{severityIcons.critical}</span>
                            Critical
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Brief description of the issue..." 
                      {...field} 
                      data-testid="input-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Details</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Please provide as much detail as possible. What did you expect to happen? What actually happened? Steps to reproduce?"
                      className="min-h-[120px]"
                      {...field}
                      data-testid="textarea-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pagePath"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Page (Auto-detected)</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      readOnly 
                      className="bg-muted"
                      data-testid="input-page-path"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                disabled={submitMutation.isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={submitMutation.isPending}
                data-testid="button-submit"
              >
                {submitMutation.isPending ? "Submitting..." : "Submit Report"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}