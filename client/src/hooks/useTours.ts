import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { UserTour } from '@shared/schema';
import type { TourId } from '@/lib/tours/tour-configs';

// Hook to fetch all tour statuses for current user
export function useTours() {
  return useQuery<UserTour[]>({
    queryKey: ['/api/tours'],
  });
}

// Hook to fetch a specific tour status
export function useTour(tourId: TourId) {
  return useQuery<UserTour>({
    queryKey: [`/api/tours/${tourId}`],
    enabled: !!tourId,
  });
}

// Hook to update tour progress
export function useUpdateTour(tourId: TourId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      currentStep?: number;
      status?: string;
      lastShownAt?: Date;
    }) => {
      return apiRequest(`/api/tours/${tourId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...data,
          lastShownAt: data.lastShownAt?.toISOString(),
        }),
      });
    },
    onSuccess: () => {
      // Invalidate both the specific tour and the list of all tours
      queryClient.invalidateQueries({ queryKey: [`/api/tours/${tourId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/tours'] });
    },
  });
}

// Hook to mark a tour as completed
export function useCompleteTour(tourId: TourId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/tours/${tourId}/complete`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tours/${tourId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/tours'] });
    },
  });
}

// Hook to skip a tour
export function useSkipTour(tourId: TourId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/tours/${tourId}/skip`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tours/${tourId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/tours'] });
    },
  });
}

// Hook to reset a tour
export function useResetTour(tourId: TourId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/tours/${tourId}/reset`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tours/${tourId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/tours'] });
    },
  });
}

// Hook to check if a tour should be shown
export function useShouldShowTour(tourId: TourId) {
  const { data: tour, isLoading } = useTour(tourId);

  // Don't show if loading or if tour doesn't exist yet (will be created when shown)
  if (isLoading) return false;

  // Show tour if it hasn't been completed or skipped
  if (!tour) return true; // No record means it hasn't been shown yet
  
  return tour.status === 'not_started' || tour.status === 'in_progress';
}

// Hook to get tour progress
export function useTourProgress(tourId: TourId) {
  const { data: tour } = useTour(tourId);

  return {
    currentStep: tour?.currentStep ?? 0,
    status: tour?.status ?? 'not_started',
    isCompleted: tour?.status === 'completed',
    isSkipped: tour?.status === 'skipped',
    isInProgress: tour?.status === 'in_progress',
    completedAt: tour?.completedAt,
    skippedAt: tour?.skippedAt,
    lastShownAt: tour?.lastShownAt,
  };
}

// Hook to manage tour state with all operations
export function useTourManager(tourId: TourId) {
  const tour = useTour(tourId);
  const updateTour = useUpdateTour(tourId);
  const completeTour = useCompleteTour(tourId);
  const skipTour = useSkipTour(tourId);
  const resetTour = useResetTour(tourId);
  const shouldShow = useShouldShowTour(tourId);
  const progress = useTourProgress(tourId);

  return {
    tour: tour.data,
    isLoading: tour.isLoading,
    shouldShow,
    progress,
    
    // Actions
    updateProgress: (step: number) => updateTour.mutate({ 
      currentStep: step, 
      status: 'in_progress',
      lastShownAt: new Date() 
    }),
    
    markAsShown: () => updateTour.mutate({ 
      lastShownAt: new Date(),
      status: 'in_progress'
    }),
    
    complete: () => completeTour.mutate(),
    skip: () => skipTour.mutate(),
    reset: () => resetTour.mutate(),
    
    // Loading states
    isUpdating: updateTour.isPending,
    isCompleting: completeTour.isPending,
    isSkipping: skipTour.isPending,
    isResetting: resetTour.isPending,
  };
}

// Hook to get all tours with their statuses
export function useAllToursStatus() {
  const { data: tours = [], isLoading } = useTours();

  const tourStatuses = tours.reduce((acc, tour) => {
    acc[tour.tourId as TourId] = {
      status: tour.status,
      currentStep: tour.currentStep ?? 0,
      completedAt: tour.completedAt,
      skippedAt: tour.skippedAt,
      lastShownAt: tour.lastShownAt,
    };
    return acc;
  }, {} as Record<TourId, {
    status: string;
    currentStep: number;
    completedAt?: Date | null;
    skippedAt?: Date | null;
    lastShownAt?: Date | null;
  }>);

  return {
    tourStatuses,
    isLoading,
    hasCompletedAll: tours.length > 0 && tours.every(t => t.status === 'completed'),
    completedCount: tours.filter(t => t.status === 'completed').length,
    totalCount: tours.length,
  };
}