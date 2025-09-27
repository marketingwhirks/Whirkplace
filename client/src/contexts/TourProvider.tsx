import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAllToursStatus, useTourManager } from '@/hooks/useTours';
import { useLocation } from 'wouter';
import { TOUR_IDS, type TourId } from '@/lib/tours/tour-configs';

interface TourProviderState {
  isNewUser: boolean;
  currentActiveTour: TourId | null;
  setCurrentActiveTour: (tourId: TourId | null) => void;
  shouldShowTour: (tourId: TourId) => boolean;
  markTourShown: (tourId: TourId) => void;
  tourQueue: TourId[];
  processNextTour: () => void;
}

const TourProviderContext = createContext<TourProviderState | undefined>(undefined);

// Define tour sequences for different user types
const NEW_USER_TOUR_SEQUENCE: TourId[] = [
  TOUR_IDS.DASHBOARD_INTRO,
  TOUR_IDS.CHECKINS_GUIDE,
  TOUR_IDS.WINS_INTRO,
  TOUR_IDS.SHOUTOUTS_INTRO,
];

const MANAGER_ADDITIONAL_TOURS: TourId[] = [
  TOUR_IDS.TEAM_MANAGEMENT,
  TOUR_IDS.ANALYTICS_GUIDE,
  TOUR_IDS.KRA_MANAGEMENT,
  TOUR_IDS.ONE_ON_ONES,
];

// Map routes to their corresponding tours
const ROUTE_TOUR_MAP: Record<string, TourId> = {
  '/': TOUR_IDS.DASHBOARD_INTRO,
  '/checkins': TOUR_IDS.CHECKINS_GUIDE,
  '/wins': TOUR_IDS.WINS_INTRO,
  '/shoutouts': TOUR_IDS.SHOUTOUTS_INTRO,
  '/team': TOUR_IDS.TEAM_MANAGEMENT,
  '/analytics': TOUR_IDS.ANALYTICS_GUIDE,
  '/kra-management': TOUR_IDS.KRA_MANAGEMENT,
  '/one-on-ones': TOUR_IDS.ONE_ON_ONES,
};

interface TourProviderProps {
  children: ReactNode;
}

export function TourProvider({ children }: TourProviderProps) {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const { tourStatuses, isLoading: toursLoading } = useAllToursStatus();
  const [location] = useLocation();
  const [currentActiveTour, setCurrentActiveTour] = useState<TourId | null>(null);
  const [tourQueue, setTourQueue] = useState<TourId[]>([]);
  const [shownTours, setShownTours] = useState<Set<TourId>>(new Set());
  const [isNewUser, setIsNewUser] = useState(false);

  // Check if user is new (no completed tours)
  useEffect(() => {
    if (!userLoading && !toursLoading) {
      const completedTours = Object.entries(tourStatuses).filter(
        ([_, status]) => status.status === 'completed'
      );
      setIsNewUser(completedTours.length === 0);
    }
  }, [tourStatuses, userLoading, toursLoading]);

  // Initialize tour queue based on user type
  useEffect(() => {
    if (userLoading || toursLoading) return;

    const unshownTours: TourId[] = [];

    if (isNewUser) {
      // For new users, start with the dashboard tour sequence
      NEW_USER_TOUR_SEQUENCE.forEach(tourId => {
        const status = tourStatuses[tourId];
        if (!status || (status.status !== 'completed' && status.status !== 'skipped')) {
          unshownTours.push(tourId);
        }
      });
    } else {
      // For existing users, check if they're visiting a page with an unshown tour
      const currentPageTour = ROUTE_TOUR_MAP[location];
      if (currentPageTour) {
        const status = tourStatuses[currentPageTour];
        if (!status || (status.status !== 'completed' && status.status !== 'skipped')) {
          unshownTours.push(currentPageTour);
        }
      }
    }

    // Add manager-specific tours if user is a manager/admin
    if (currentUser?.role === 'manager' || currentUser?.role === 'admin') {
      MANAGER_ADDITIONAL_TOURS.forEach(tourId => {
        const status = tourStatuses[tourId];
        if (!status || (status.status !== 'completed' && status.status !== 'skipped')) {
          // Only add if it's the relevant page or if new user
          if (isNewUser || ROUTE_TOUR_MAP[location] === tourId) {
            if (!unshownTours.includes(tourId)) {
              unshownTours.push(tourId);
            }
          }
        }
      });
    }

    setTourQueue(unshownTours);
  }, [currentUser, tourStatuses, location, isNewUser, userLoading, toursLoading]);

  // Check if a tour should be shown
  const shouldShowTour = useCallback((tourId: TourId) => {
    // Don't show if there's already an active tour
    if (currentActiveTour && currentActiveTour !== tourId) {
      return false;
    }

    // Don't show if already shown in this session
    if (shownTours.has(tourId)) {
      return false;
    }

    // Check if tour is in the queue and is next
    const isNext = tourQueue[0] === tourId;
    
    // For page-specific tours, also check if we're on the right page
    const currentPageTour = ROUTE_TOUR_MAP[location];
    const isRelevantPage = currentPageTour === tourId;

    // Show if it's next in queue and either new user or on the relevant page
    return isNext && (isNewUser || isRelevantPage);
  }, [currentActiveTour, shownTours, tourQueue, location, isNewUser]);

  // Mark a tour as shown
  const markTourShown = useCallback((tourId: TourId) => {
    setShownTours(prev => new Set([...prev, tourId]));
  }, []);

  // Process the next tour in the queue
  const processNextTour = useCallback(() => {
    setCurrentActiveTour(null);
    
    // Remove the completed tour from queue
    setTourQueue(prev => {
      const newQueue = [...prev];
      if (newQueue.length > 0) {
        newQueue.shift();
      }
      return newQueue;
    });

    // If there are more tours and we're a new user, set the next one as active
    // We'll let the page components handle showing them
  }, []);

  const value: TourProviderState = {
    isNewUser,
    currentActiveTour,
    setCurrentActiveTour,
    shouldShowTour,
    markTourShown,
    tourQueue,
    processNextTour,
  };

  return (
    <TourProviderContext.Provider value={value}>
      {children}
    </TourProviderContext.Provider>
  );
}

export function useTourProvider() {
  const context = useContext(TourProviderContext);
  if (context === undefined) {
    throw new Error('useTourProvider must be used within a TourProvider');
  }
  return context;
}

// Hook to manage a specific tour with provider integration
export function useManagedTour(tourId: TourId) {
  const tourProvider = useTourProvider();
  const tourManager = useTourManager(tourId);

  const shouldShow = tourProvider.shouldShowTour(tourId);

  const handleComplete = useCallback(() => {
    tourManager.complete();
    tourProvider.processNextTour();
  }, [tourManager, tourProvider]);

  const handleSkip = useCallback(() => {
    tourManager.skip();
    tourProvider.processNextTour();
  }, [tourManager, tourProvider]);

  const handleStart = useCallback(() => {
    tourProvider.setCurrentActiveTour(tourId);
    tourProvider.markTourShown(tourId);
    tourManager.markAsShown();
  }, [tourProvider, tourManager, tourId]);

  return {
    ...tourManager,
    shouldShow,
    handleComplete,
    handleSkip,
    handleStart,
  };
}