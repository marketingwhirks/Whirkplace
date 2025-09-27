import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  RotateCcw, 
  Play, 
  CheckCircle2, 
  XCircle, 
  Circle,
  Clock,
  Info
} from 'lucide-react';
import { useResetTour } from '@/hooks/useTours';
import { useTourGuide } from '@/components/TourGuide';
import { useToast } from '@/hooks/use-toast';
import type { UserTour } from '@shared/schema';
import type { TourId, TourConfig } from '@/lib/tours/tour-configs';

interface TourManagementCardProps {
  tour: UserTour;
  tourConfig: TourConfig;
  onTourStart?: () => void;
}

export function TourManagementCard({ 
  tour, 
  tourConfig,
  onTourStart 
}: TourManagementCardProps) {
  const { toast } = useToast();
  const resetTour = useResetTour(tour.tourId as TourId);
  const { startTour } = useTourGuide(tour.tourId as TourId);

  const handleReset = async () => {
    try {
      await resetTour.mutateAsync();
      toast({
        title: "Tour Reset",
        description: `"${tourConfig.title}" has been reset and is ready to start.`,
      });
    } catch (error) {
      toast({
        title: "Reset Failed",
        description: "Failed to reset the tour. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleStart = () => {
    startTour();
    onTourStart?.();
    toast({
      title: "Tour Started",
      description: `Starting the "${tourConfig.title}" tour...`,
    });
  };

  const getStatusBadge = () => {
    switch (tour.status) {
      case 'completed':
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </Badge>
        );
      case 'skipped':
        return (
          <Badge variant="secondary" className="gap-1">
            <XCircle className="h-3 w-3" />
            Skipped
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            In Progress
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <Circle className="h-3 w-3" />
            Not Started
          </Badge>
        );
    }
  };

  const getLastDate = () => {
    if (tour.completedAt) {
      return `Completed on ${format(new Date(tour.completedAt), 'MMM d, yyyy')}`;
    }
    if (tour.skippedAt) {
      return `Skipped on ${format(new Date(tour.skippedAt), 'MMM d, yyyy')}`;
    }
    if (tour.lastShownAt) {
      return `Last viewed ${format(new Date(tour.lastShownAt), 'MMM d, yyyy')}`;
    }
    return null;
  };

  const lastDateText = getLastDate();
  const canStart = tour.status !== 'in_progress';
  const canReset = tour.status === 'completed' || tour.status === 'skipped';

  return (
    <Card className="overflow-hidden" data-testid={`tour-card-${tour.tourId}`}>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Tour Information */}
          <div className="flex-1 space-y-2">
            <div className="flex items-start gap-2">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1">
                <h3 className="font-medium text-sm">{tourConfig.title}</h3>
                {tourConfig.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {tourConfig.description}
                  </p>
                )}
              </div>
            </div>

            {/* Status and Date */}
            <div className="flex flex-wrap items-center gap-3">
              {getStatusBadge()}
              {lastDateText && (
                <span className="text-xs text-muted-foreground">
                  {lastDateText}
                </span>
              )}
              {tour.status === 'in_progress' && tour.currentStep !== undefined && (
                <span className="text-xs text-muted-foreground">
                  Step {tour.currentStep + 1} of {tourConfig.steps.length}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {canReset && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={resetTour.isPending}
                data-testid={`button-reset-${tour.tourId}`}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            )}
            {canStart && (
              <Button
                variant="default"
                size="sm"
                onClick={handleStart}
                data-testid={`button-start-${tour.tourId}`}
              >
                <Play className="h-4 w-4 mr-1" />
                {tour.status === 'not_started' ? 'Start' : 'Restart'}
              </Button>
            )}
            {tour.status === 'in_progress' && (
              <Button
                variant="default"
                size="sm"
                onClick={handleStart}
                data-testid={`button-continue-${tour.tourId}`}
              >
                <Play className="h-4 w-4 mr-1" />
                Continue
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}