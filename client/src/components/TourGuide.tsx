import { useEffect, useState, useCallback } from 'react';
import Joyride, {
  type CallBackProps,
  type Props as JoyrideProps,
  ACTIONS,
  EVENTS,
  STATUS,
} from 'react-joyride';
import { useTourManager } from '@/hooks/useTours';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { X, RotateCcw, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import {
  type TourId,
  type TourConfig,
  defaultTourStyles,
  getMobileAdjustedStyles,
  TOUR_CONFIGS,
} from '@/lib/tours/tour-configs';
import { cn } from '@/lib/utils';

interface TourGuideProps {
  tourId: TourId;
  config?: TourConfig;
  onComplete?: () => void;
  onSkip?: () => void;
  onStepChange?: (step: number) => void;
  autoStart?: boolean;
  delay?: number;
  className?: string;
}

export function TourGuide({
  tourId,
  config: customConfig,
  onComplete,
  onSkip,
  onStepChange,
  autoStart = true,
  delay = 500,
  className,
}: TourGuideProps) {
  const isMobile = useIsMobile();
  const tourManager = useTourManager(tourId);
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Use custom config or default from TOUR_CONFIGS
  const config = customConfig || TOUR_CONFIGS[tourId];

  // Start tour automatically if conditions are met
  useEffect(() => {
    if (autoStart && tourManager.shouldShow && !tourManager.isLoading && config) {
      const timer = setTimeout(() => {
        setRun(true);
        setStepIndex(tourManager.progress.currentStep || 0);
        tourManager.markAsShown();
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [autoStart, tourManager.shouldShow, tourManager.isLoading, delay, config]);

  // Handle tour callbacks
  const handleJoyrideCallback = useCallback((data: CallBackProps) => {
    const { action, index, status, type } = data;

    // Handle step changes
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const nextStepIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      setStepIndex(nextStepIndex);
      tourManager.updateProgress(nextStepIndex);
      onStepChange?.(nextStepIndex);
    }

    // Handle tour completion
    if (status === STATUS.FINISHED) {
      setRun(false);
      tourManager.complete();
      onComplete?.();
    }

    // Handle tour skip
    if (status === STATUS.SKIPPED) {
      setRun(false);
      tourManager.skip();
      onSkip?.();
    }

    // Handle close action
    if (action === ACTIONS.CLOSE) {
      setRun(false);
      // Save current progress without marking as completed or skipped
      tourManager.updateProgress(index);
    }
  }, [tourManager, onComplete, onSkip, onStepChange]);

  // Custom tooltip component for better control
  const TooltipComponent = useCallback(({
    continuous,
    index,
    step,
    backProps,
    closeProps,
    primaryProps,
    skipProps,
    tooltipProps,
    isLastStep,
  }: any) => (
    <div
      {...tooltipProps}
      className={cn(
        'bg-background border border-border rounded-lg shadow-xl p-6 max-w-md',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-200',
        className
      )}
      data-testid="tour-tooltip"
    >
      {/* Close button */}
      <button
        {...closeProps}
        className="absolute top-3 right-3 p-1 rounded-md hover:bg-accent transition-colors"
        aria-label="Close tour"
        data-testid="tour-close"
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Title */}
      {step.title && (
        <h3 className="text-lg font-semibold mb-2 pr-8">
          {step.title}
        </h3>
      )}

      {/* Content */}
      <div className="text-sm text-muted-foreground mb-4">
        {step.content}
      </div>

      {/* Progress indicator */}
      {config?.showProgress && config.steps.length > 1 && (
        <div className="flex items-center gap-1 mb-4">
          {config.steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                i <= index ? 'bg-primary' : 'bg-muted'
              )}
              data-testid={`tour-progress-${i}`}
            />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Back button */}
          {index > 0 && (
            <Button
              {...backProps}
              variant="ghost"
              size="sm"
              className="gap-1"
              data-testid="tour-back"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}

          {/* Skip button */}
          {config?.showSkipButton && !isLastStep && (
            <Button
              {...skipProps}
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              data-testid="tour-skip"
            >
              Skip tour
            </Button>
          )}
        </div>

        {/* Next/Finish button */}
        <Button
          {...primaryProps}
          size="sm"
          className="gap-1"
          data-testid={isLastStep ? 'tour-finish' : 'tour-next'}
        >
          {isLastStep ? (
            <>
              Finish
              <Check className="h-4 w-4" />
            </>
          ) : (
            <>
              Next
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  ), [config, className]);

  // Don't render if no config
  if (!config) {
    console.warn(`No tour configuration found for tourId: ${tourId}`);
    return null;
  }

  const joyrideProps: JoyrideProps = {
    steps: config.steps,
    run,
    stepIndex,
    continuous: config.continuous ?? true,
    showSkipButton: config.showSkipButton ?? true,
    showProgress: config.showProgress ?? true,
    scrollToFirstStep: config.scrollToFirstStep ?? true,
    disableOverlayClose: false,
    disableCloseOnEsc: false,
    spotlightClicks: true,
    spotlightPadding: 8,
    styles: getMobileAdjustedStyles(isMobile),
    locale: {
      back: 'Back',
      close: 'Close',
      last: 'Finish',
      next: 'Next',
      skip: 'Skip tour',
    },
    tooltipComponent: TooltipComponent,
    callback: handleJoyrideCallback,
  };

  return (
    <>
      <Joyride {...joyrideProps} />
      
      {/* Floating restart button for completed/skipped tours */}
      {(tourManager.progress.isCompleted || tourManager.progress.isSkipped) && !run && (
        <Button
          onClick={() => {
            tourManager.reset();
            setTimeout(() => {
              setRun(true);
              setStepIndex(0);
            }, 100);
          }}
          variant="outline"
          size="sm"
          className="fixed bottom-4 right-4 gap-2 shadow-lg z-50"
          disabled={tourManager.isResetting}
          data-testid="tour-restart"
        >
          <RotateCcw className="h-4 w-4" />
          Restart Tour
        </Button>
      )}
    </>
  );
}

// Export a hook to programmatically trigger tours
export function useTourGuide(tourId: TourId) {
  const [isRunning, setIsRunning] = useState(false);
  const tourManager = useTourManager(tourId);

  const startTour = useCallback(() => {
    if (tourManager.progress.isCompleted || tourManager.progress.isSkipped) {
      tourManager.reset();
    }
    setTimeout(() => {
      setIsRunning(true);
      tourManager.markAsShown();
    }, 100);
  }, [tourManager]);

  const stopTour = useCallback(() => {
    setIsRunning(false);
  }, []);

  return {
    startTour,
    stopTour,
    isRunning,
    canStart: tourManager.shouldShow || tourManager.progress.isCompleted || tourManager.progress.isSkipped,
    tourManager,
  };
}