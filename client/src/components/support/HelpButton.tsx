import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, MessageSquare, Lightbulb, CheckCircle2 } from "lucide-react";
import { getHelpContent } from "@/lib/helpRegistry";
import { SupportReportForm } from "./SupportReportForm";

export function HelpButton() {
  const [location] = useLocation();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSupportFormOpen, setIsSupportFormOpen] = useState(false);
  
  const helpContent = getHelpContent(location);

  const openSupportForm = (category: "bug" | "question" | "feature_request" = "question") => {
    setIsHelpOpen(false);
    setIsSupportFormOpen(true);
  };

  return (
    <>
      <Sheet open={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="fixed bottom-6 right-6 z-50 shadow-lg hover:shadow-xl transition-shadow bg-white dark:bg-gray-800 border-2"
            data-testid="button-help"
          >
            <HelpCircle className="w-4 h-4 mr-2" />
            Help
          </Button>
        </SheetTrigger>
        
        <SheetContent className="w-[400px] sm:w-[540px]" data-testid="sheet-help">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-blue-500" />
              {helpContent.title}
            </SheetTitle>
            <SheetDescription>
              Get help with this page and contact support
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-6 space-y-6">
            {/* Current Page Help */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Tips for this page
              </h3>
              <div className="space-y-2">
                {helpContent.tips.map((tip, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-700 dark:text-gray-300">{tip}</p>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Quick Support Actions */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Need more help?
              </h3>
              <div className="grid gap-2">
                <Button
                  variant="outline"
                  className="justify-start h-auto p-4"
                  onClick={() => openSupportForm("question")}
                  data-testid="button-ask-question"
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-blue-500" />
                    <div className="text-left">
                      <div className="font-medium">Ask a Question</div>
                      <div className="text-sm text-muted-foreground">Get help from our support team</div>
                    </div>
                  </div>
                </Button>
                
                <Button
                  variant="outline"
                  className="justify-start h-auto p-4"
                  onClick={() => openSupportForm("bug")}
                  data-testid="button-report-bug"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 flex items-center justify-center">🐛</div>
                    <div className="text-left">
                      <div className="font-medium">Report a Bug</div>
                      <div className="text-sm text-muted-foreground">Something not working as expected?</div>
                    </div>
                  </div>
                </Button>
                
                <Button
                  variant="outline"
                  className="justify-start h-auto p-4"
                  onClick={() => openSupportForm("feature_request")}
                  data-testid="button-suggest-feature"
                >
                  <div className="flex items-center gap-3">
                    <Lightbulb className="w-5 h-5 text-yellow-500" />
                    <div className="text-left">
                      <div className="font-medium">Suggest a Feature</div>
                      <div className="text-sm text-muted-foreground">Have an idea to improve the app?</div>
                    </div>
                  </div>
                </Button>
              </div>
            </div>

            <Separator />

            {/* Current Page Info */}
            <div className="space-y-2">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Page Information
              </h3>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {location}
                </Badge>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <SupportReportForm
        isOpen={isSupportFormOpen}
        onClose={() => setIsSupportFormOpen(false)}
        defaultCategory="question"
      />
    </>
  );
}