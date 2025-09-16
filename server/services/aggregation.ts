import { db } from "../db";
import { 
  checkins, shoutouts, users, teams, vacations,
  pulseMetricsDaily, shoutoutMetricsDaily, complianceMetricsDaily, aggregationWatermarks,
  type InsertPulseMetricsDaily, type InsertShoutoutMetricsDaily,
  type InsertComplianceMetricsDaily, type InsertAggregationWatermark
} from "@shared/schema";
import { eq, and, gte, lte, sum, count, avg, sql, asc, desc } from "drizzle-orm";
import { getWeekStartCentral } from "@shared/utils/dueDates";

/**
 * AggregationService handles pre-computing daily analytics aggregates for improved performance
 * This service implements the strategy of maintaining accurate daily rollups while keeping
 * raw data access for recent/fresh data queries.
 */
export class AggregationService {
  private static instance: AggregationService;
  private sweepInterval: NodeJS.Timeout | null = null;

  public static getInstance(): AggregationService {
    if (!AggregationService.instance) {
      AggregationService.instance = new AggregationService();
    }
    return AggregationService.instance;
  }

  /**
   * Recompute all aggregates for a specific user and date
   * This ensures accuracy by recalculating from raw data
   */
  async recomputeUserDayAggregates(
    organizationId: string, 
    userId: string, 
    bucketDate: Date
  ): Promise<void> {
    try {
      console.log(`Recomputing aggregates for user ${userId} on ${bucketDate.toISOString().split('T')[0]}`);

      // Get user's team for aggregation
      const [user] = await db
        .select({ teamId: users.teamId })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.organizationId, organizationId)));

      const teamId = user?.teamId || null;

      // Set date range for the bucket date (full day)
      const startOfDay = new Date(bucketDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(bucketDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Compute pulse metrics for the day
      await this.recomputePulseMetrics(organizationId, userId, teamId, bucketDate, startOfDay, endOfDay);

      // Compute shoutout metrics for the day
      await this.recomputeShoutoutMetrics(organizationId, userId, teamId, bucketDate, startOfDay, endOfDay);

      // Compute compliance metrics for the day
      await this.recomputeComplianceMetrics(organizationId, userId, teamId, bucketDate, startOfDay, endOfDay);

      console.log(`Successfully recomputed aggregates for user ${userId} on ${bucketDate.toISOString().split('T')[0]}`);
    } catch (error) {
      console.error(`Failed to recompute aggregates for user ${userId} on ${bucketDate.toISOString().split('T')[0]}:`, error);
      throw error;
    }
  }

  /**
   * Recompute pulse metrics for a specific user and date
   */
  private async recomputePulseMetrics(
    organizationId: string,
    userId: string,
    teamId: string | null,
    bucketDate: Date,
    startOfDay: Date,
    endOfDay: Date
  ): Promise<void> {
    // Query raw checkin data for the day
    const checkinData = await db
      .select({
        moodSum: sum(checkins.overallMood),
        checkinCount: count(checkins.id)
      })
      .from(checkins)
      .where(and(
        eq(checkins.organizationId, organizationId),
        eq(checkins.userId, userId),
        gte(checkins.createdAt, startOfDay),
        lte(checkins.createdAt, endOfDay),
        eq(checkins.isComplete, true)
      ));

    const moodSum = Number(checkinData[0]?.moodSum) || 0;
    const checkinCount = Number(checkinData[0]?.checkinCount) || 0;

    // Delete existing aggregate for this day and user (if any)
    await db
      .delete(pulseMetricsDaily)
      .where(and(
        eq(pulseMetricsDaily.organizationId, organizationId),
        eq(pulseMetricsDaily.userId, userId),
        eq(pulseMetricsDaily.bucketDate, bucketDate.toISOString().split('T')[0])
      ));

    // Insert new aggregate (only if there's data)
    if (checkinCount > 0) {
      await db
        .insert(pulseMetricsDaily)
        .values({
          organizationId,
          userId,
          teamId,
          bucketDate: bucketDate.toISOString().split('T')[0],
          moodSum,
          checkinCount,
          updatedAt: sql`now()`
        });
    }
  }

  /**
   * Recompute shoutout metrics for a specific user and date
   */
  private async recomputeShoutoutMetrics(
    organizationId: string,
    userId: string,
    teamId: string | null,
    bucketDate: Date,
    startOfDay: Date,
    endOfDay: Date
  ): Promise<void> {
    // Query raw shoutout data for received shoutouts
    const receivedData = await db
      .select({
        total: count(shoutouts.id),
        publicCount: sum(sql`CASE WHEN ${shoutouts.isPublic} = true THEN 1 ELSE 0 END`),
        privateCount: sum(sql`CASE WHEN ${shoutouts.isPublic} = false THEN 1 ELSE 0 END`)
      })
      .from(shoutouts)
      .where(and(
        eq(shoutouts.organizationId, organizationId),
        eq(shoutouts.toUserId, userId),
        gte(shoutouts.createdAt, startOfDay),
        lte(shoutouts.createdAt, endOfDay)
      ));

    // Query raw shoutout data for given shoutouts
    const givenData = await db
      .select({
        givenCount: count(shoutouts.id)
      })
      .from(shoutouts)
      .where(and(
        eq(shoutouts.organizationId, organizationId),
        eq(shoutouts.fromUserId, userId),
        gte(shoutouts.createdAt, startOfDay),
        lte(shoutouts.createdAt, endOfDay)
      ));

    const receivedCount = Number(receivedData[0]?.total) || 0;
    const publicCount = Number(receivedData[0]?.publicCount) || 0;
    const privateCount = Number(receivedData[0]?.privateCount) || 0;
    const givenCount = Number(givenData[0]?.givenCount) || 0;

    // Delete existing aggregate for this day and user (if any)
    await db
      .delete(shoutoutMetricsDaily)
      .where(and(
        eq(shoutoutMetricsDaily.organizationId, organizationId),
        eq(shoutoutMetricsDaily.userId, userId),
        eq(shoutoutMetricsDaily.bucketDate, bucketDate.toISOString().split('T')[0])
      ));

    // Insert new aggregate (only if there's data)
    if (receivedCount > 0 || givenCount > 0) {
      await db
        .insert(shoutoutMetricsDaily)
        .values({
          organizationId,
          userId,
          teamId,
          bucketDate: bucketDate.toISOString().split('T')[0],
          receivedCount,
          givenCount,
          publicCount,
          privateCount,
          updatedAt: sql`now()`
        });
    }
  }

  /**
   * Recompute compliance metrics for a specific user and date
   * This method now handles vacation exclusions to match real-time calculations
   */
  private async recomputeComplianceMetrics(
    organizationId: string,
    userId: string,
    teamId: string | null,
    bucketDate: Date,
    startOfDay: Date,
    endOfDay: Date
  ): Promise<void> {
    // Query checkin compliance data for the day with vacation awareness
    const checkinData = await db
      .select({
        checkinId: checkins.id,
        weekOf: checkins.weekOf,
        submittedOnTime: checkins.submittedOnTime,
        reviewedBy: checkins.reviewedBy,
        reviewedOnTime: checkins.reviewedOnTime,
        reviewedAt: checkins.reviewedAt
      })
      .from(checkins)
      .where(and(
        eq(checkins.organizationId, organizationId),
        eq(checkins.userId, userId),
        gte(checkins.createdAt, startOfDay),
        lte(checkins.createdAt, endOfDay),
        eq(checkins.isComplete, true) // Only completed check-ins
      ));

    // Query vacation status for each check-in week
    const checkinVacationStatus = await Promise.all(
      checkinData.map(async (checkin) => {
        const normalizedWeekOf = getWeekStartCentral(checkin.weekOf);
        const [vacation] = await db
          .select({ id: vacations.id })
          .from(vacations)
          .where(and(
            eq(vacations.organizationId, organizationId),
            eq(vacations.userId, userId),
            eq(vacations.weekOf, normalizedWeekOf)
          ))
          .limit(1);
        
        return {
          ...checkin,
          isOnVacation: !!vacation
        };
      })
    );

    // Calculate checkin compliance with vacation exclusions
    const nonVacationCheckins = checkinVacationStatus.filter(c => !c.isOnVacation);
    const checkinComplianceCount = nonVacationCheckins.length; // Only non-vacation weeks count as "due"
    const checkinOnTimeCount = checkinVacationStatus.filter(c => c.submittedOnTime).length; // All on-time submissions count

    // Query review compliance data for the day (where user is the reviewer)
    const reviewData = await db
      .select({
        checkinId: checkins.id,
        weekOf: checkins.weekOf,
        reviewedBy: checkins.reviewedBy,
        reviewedOnTime: checkins.reviewedOnTime,
        reviewedAt: checkins.reviewedAt
      })
      .from(checkins)
      .where(and(
        eq(checkins.organizationId, organizationId),
        eq(checkins.reviewedBy, userId),
        gte(checkins.createdAt, startOfDay),
        lte(checkins.createdAt, endOfDay),
        sql`${checkins.reviewedAt} IS NOT NULL` // Only reviewed check-ins
      ));

    // Query vacation status for each review week (for the reviewer)
    const reviewVacationStatus = await Promise.all(
      reviewData.map(async (review) => {
        const normalizedWeekOf = getWeekStartCentral(review.weekOf);
        const [vacation] = await db
          .select({ id: vacations.id })
          .from(vacations)
          .where(and(
            eq(vacations.organizationId, organizationId),
            eq(vacations.userId, userId), // Reviewer's vacation status
            eq(vacations.weekOf, normalizedWeekOf)
          ))
          .limit(1);
        
        return {
          ...review,
          reviewerOnVacation: !!vacation
        };
      })
    );

    // Calculate review compliance with vacation exclusions
    const nonVacationReviews = reviewVacationStatus.filter(r => !r.reviewerOnVacation);
    const reviewComplianceCount = nonVacationReviews.length; // Only non-vacation weeks count as "due"
    const reviewOnTimeCount = reviewVacationStatus.filter(r => r.reviewedOnTime).length; // All on-time reviews count

    // Delete existing aggregate for this day and user (if any)
    await db
      .delete(complianceMetricsDaily)
      .where(and(
        eq(complianceMetricsDaily.organizationId, organizationId),
        eq(complianceMetricsDaily.userId, userId),
        eq(complianceMetricsDaily.bucketDate, bucketDate.toISOString().split('T')[0])
      ));

    // Insert new aggregate (only if there's data)
    if (checkinComplianceCount > 0 || reviewComplianceCount > 0) {
      await db
        .insert(complianceMetricsDaily)
        .values({
          organizationId,
          userId,
          teamId,
          bucketDate: bucketDate.toISOString().split('T')[0],
          checkinComplianceCount,
          checkinOnTimeCount,
          reviewComplianceCount,
          reviewOnTimeCount,
          updatedAt: sql`now()`
        });
    }
  }

  /**
   * Periodic sweep to process recent data that hasn't been aggregated yet
   * Runs every 15 minutes and processes data since the last watermark
   */
  async periodicSweep(): Promise<void> {
    try {
      console.log("Starting periodic aggregation sweep...");

      // Get all organizations that have recent activity from BOTH checkins AND shoutouts
      // This prevents missing shoutout-only organizations
      const checkinOrgs = db
        .selectDistinct({ organizationId: checkins.organizationId })
        .from(checkins)
        .where(gte(checkins.createdAt, sql`now() - interval '1 day'`));

      const shoutoutOrgs = db
        .selectDistinct({ organizationId: shoutouts.organizationId })
        .from(shoutouts)
        .where(gte(shoutouts.createdAt, sql`now() - interval '1 day'`));

      const organizations = await checkinOrgs.union(shoutoutOrgs);

      console.log(`Found ${organizations.length} organizations with recent activity`);

      for (const org of organizations) {
        await this.processOrganizationSweep(org.organizationId);
      }

      console.log("Completed periodic aggregation sweep");
    } catch (error) {
      console.error("Error during periodic aggregation sweep:", error);
      throw error;
    }
  }

  /**
   * Process aggregation sweep for a specific organization
   */
  private async processOrganizationSweep(organizationId: string): Promise<void> {
    try {
      // Get or create watermark for this organization
      let [watermark] = await db
        .select()
        .from(aggregationWatermarks)
        .where(eq(aggregationWatermarks.organizationId, organizationId));

      if (!watermark) {
        // Create initial watermark starting from 7 days ago
        const initialDate = new Date();
        initialDate.setDate(initialDate.getDate() - 7);
        
        [watermark] = await db
          .insert(aggregationWatermarks)
          .values({
            organizationId,
            lastProcessedAt: initialDate
          })
          .returning();
      }

      const lastProcessed = watermark.lastProcessedAt;
      const now = new Date();

      console.log(`Processing sweep for org ${organizationId} from ${lastProcessed.toISOString()}`);

      // Find all users with activity since last processed time
      const activeUsers = await db
        .selectDistinct({ 
          userId: checkins.userId,
          activityDate: sql<Date>`DATE(${checkins.createdAt})::date`
        })
        .from(checkins)
        .where(and(
          eq(checkins.organizationId, organizationId),
          gte(checkins.createdAt, lastProcessed)
        ))
        .union(
          db.selectDistinct({ 
            userId: shoutouts.toUserId,
            activityDate: sql<Date>`DATE(${shoutouts.createdAt})::date`
          })
          .from(shoutouts)
          .where(and(
            eq(shoutouts.organizationId, organizationId),
            gte(shoutouts.createdAt, lastProcessed)
          ))
        );

      // Recompute aggregates for each user-day combination
      for (const activity of activeUsers) {
        await this.recomputeUserDayAggregates(
          organizationId, 
          activity.userId, 
          new Date(activity.activityDate)
        );
      }

      // Update watermark to max processed event timestamp instead of now to prevent drift
      const maxEventTimestamp = await this.getMaxEventTimestamp(organizationId, lastProcessed);
      await this.updateWatermark(organizationId, maxEventTimestamp || now);

    } catch (error) {
      console.error(`Error processing sweep for organization ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Backfill historical data for an organization
   */
  async backfillHistoricalData(
    organizationId: string, 
    fromDate: Date, 
    toDate: Date
  ): Promise<void> {
    try {
      console.log(`Starting backfill for org ${organizationId} from ${fromDate.toISOString()} to ${toDate.toISOString()}`);

      // Get all user-day combinations that have activity in the date range
      const userDays = await db
        .selectDistinct({ 
          userId: checkins.userId,
          activityDate: sql<Date>`DATE(${checkins.createdAt})::date`
        })
        .from(checkins)
        .where(and(
          eq(checkins.organizationId, organizationId),
          gte(checkins.createdAt, fromDate),
          lte(checkins.createdAt, toDate)
        ))
        .union(
          db.selectDistinct({ 
            userId: shoutouts.toUserId,
            activityDate: sql<Date>`DATE(${shoutouts.createdAt})::date`
          })
          .from(shoutouts)
          .where(and(
            eq(shoutouts.organizationId, organizationId),
            gte(shoutouts.createdAt, fromDate),
            lte(shoutouts.createdAt, toDate)
          ))
        )
        .orderBy(asc(sql`activity_date`));

      console.log(`Found ${userDays.length} user-day combinations to backfill`);

      // Process in batches to avoid overwhelming the database
      const batchSize = 100;
      for (let i = 0; i < userDays.length; i += batchSize) {
        const batch = userDays.slice(i, i + batchSize);
        
        for (const userDay of batch) {
          await this.recomputeUserDayAggregates(
            organizationId,
            userDay.userId,
            new Date(userDay.activityDate)
          );
        }

        console.log(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(userDays.length / batchSize)}`);
      }

      // Update watermark to the end of backfill period
      await this.updateWatermark(organizationId, toDate);

      console.log(`Completed backfill for org ${organizationId}`);
    } catch (error) {
      console.error(`Error during backfill for organization ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Get the maximum event timestamp from processed events to prevent watermark drift
   */
  private async getMaxEventTimestamp(organizationId: string, fromDate: Date): Promise<Date | null> {
    try {
      // Get max timestamp from checkins
      const maxCheckinResult = await db
        .select({ maxTimestamp: sql<Date>`MAX(${checkins.createdAt})` })
        .from(checkins)
        .where(and(
          eq(checkins.organizationId, organizationId),
          gte(checkins.createdAt, fromDate)
        ));

      // Get max timestamp from shoutouts
      const maxShoutoutResult = await db
        .select({ maxTimestamp: sql<Date>`MAX(${shoutouts.createdAt})` })
        .from(shoutouts)
        .where(and(
          eq(shoutouts.organizationId, organizationId),
          gte(shoutouts.createdAt, fromDate)
        ));

      // Ensure timestamps are properly converted to Date objects
      const maxCheckin = maxCheckinResult[0]?.maxTimestamp ? new Date(maxCheckinResult[0].maxTimestamp) : null;
      const maxShoutout = maxShoutoutResult[0]?.maxTimestamp ? new Date(maxShoutoutResult[0].maxTimestamp) : null;

      // Return the latest timestamp among both event types
      if (maxCheckin && maxShoutout) {
        return maxCheckin > maxShoutout ? maxCheckin : maxShoutout;
      } else if (maxCheckin) {
        return maxCheckin;
      } else if (maxShoutout) {
        return maxShoutout;
      }

      return null;
    } catch (error) {
      console.error(`Error getting max event timestamp for org ${organizationId}:`, error);
      return null;
    }
  }

  /**
   * Update the watermark for an organization
   */
  async updateWatermark(organizationId: string, timestamp: Date): Promise<void> {
    try {
      await db
        .insert(aggregationWatermarks)
        .values({
          organizationId,
          lastProcessedAt: timestamp
        })
        .onConflictDoUpdate({
          target: aggregationWatermarks.organizationId,
          set: {
            lastProcessedAt: timestamp,
            updatedAt: sql`now()`
          }
        });

      console.log(`Updated watermark for org ${organizationId} to ${timestamp.toISOString()}`);
    } catch (error) {
      console.error(`Error updating watermark for organization ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Start the periodic sweep background job
   */
  startPeriodicSweep(intervalMinutes: number = 15): void {
    if (this.sweepInterval) {
      console.log("Periodic sweep already running");
      return;
    }

    console.log(`Starting periodic sweep with ${intervalMinutes} minute intervals`);
    
    this.sweepInterval = setInterval(async () => {
      try {
        await this.periodicSweep();
      } catch (error) {
        console.error("Error in periodic sweep:", error);
      }
    }, intervalMinutes * 60 * 1000);

    // Run initial sweep
    this.periodicSweep().catch(error => {
      console.error("Error in initial sweep:", error);
    });
  }

  /**
   * Stop the periodic sweep background job
   */
  stopPeriodicSweep(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
      console.log("Stopped periodic sweep");
    }
  }

  /**
   * Trigger recomputation for recent data that may have been affected by new checkins/shoutouts
   * This is called on-write when new data is inserted
   */
  async triggerRecompute(organizationId: string, userId: string, activityDate: Date): Promise<void> {
    try {
      // Convert to date only for bucket matching
      const bucketDate = new Date(activityDate);
      bucketDate.setHours(0, 0, 0, 0);

      await this.recomputeUserDayAggregates(organizationId, userId, bucketDate);
    } catch (error) {
      console.error(`Error triggering recompute for user ${userId}:`, error);
      // Don't throw here - we don't want to fail the main operation if aggregation fails
    }
  }
}

// Export singleton instance for easy access
export const aggregationService = AggregationService.getInstance();

// Start periodic sweep if not in test environment
if (process.env.NODE_ENV !== 'test') {
  aggregationService.startPeriodicSweep();
}