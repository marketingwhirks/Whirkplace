import { organizations, users, billingEvents } from "@shared/schema";
import type { Organization, User, InsertBillingEvent, BillingEvent } from "@shared/schema";
import { and, eq, desc, gte, lte } from "drizzle-orm";
import { differenceInDays, addMonths, startOfMonth, endOfMonth } from "date-fns";
import Stripe from "stripe";
import { db } from "../db";

// Initialize Stripe
const isDevelopment = process.env.NODE_ENV !== 'production';
const stripeSecretKey = isDevelopment 
  ? process.env.STRIPE_TEST_SECRET_KEY 
  : process.env.STRIPE_SECRET_KEY;

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

interface BillingService {
  calculateProRataCharge(organization: Organization, newUserCount: number): Promise<number>;
  updateStripeSubscriptionQuantity(organization: Organization, newQuantity: number): Promise<void>;
  trackBillingChange(params: {
    organizationId: string;
    eventType: string;
    userCount: number;
    previousUserCount?: number;
    amount?: number;
    description?: string;
    stripeInvoiceItemId?: string;
    stripeSubscriptionId?: string;
    userId?: string;
    metadata?: any;
  }): Promise<BillingEvent>;
  handleUserAddition(organization: Organization, userId?: string): Promise<void>;
  handleUserRemoval(organization: Organization, userId?: string): Promise<void>;
  syncBillingPeriod(organization: Organization): Promise<void>;
  getCurrentBillingUsage(organizationId: string): Promise<{
    currentUserCount: number;
    billedUserCount: number;
    pendingChanges: any;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    pricePerUser: number;
  }>;
}

class BillingServiceImpl implements BillingService {
  /**
   * Calculate pro-rata charge for adding users
   */
  async calculateProRataCharge(organization: Organization, newUserCount: number): Promise<number> {
    if (!organization.billingPeriodStart || !organization.billingPeriodEnd) {
      return 0;
    }

    const currentUserCount = organization.billingUserCount || 0;
    const newUsersAdded = Math.max(0, newUserCount - currentUserCount);

    if (newUsersAdded === 0) {
      return 0;
    }

    const pricePerUser = organization.billingPricePerUser || 0;
    const now = new Date();
    const periodEnd = new Date(organization.billingPeriodEnd);
    const periodStart = new Date(organization.billingPeriodStart);

    // Calculate days remaining in current billing period
    const daysRemaining = Math.max(0, differenceInDays(periodEnd, now));
    const totalDaysInPeriod = Math.max(1, differenceInDays(periodEnd, periodStart));

    // Calculate pro-rata amount (in cents)
    const proRataAmount = Math.round((pricePerUser * newUsersAdded * daysRemaining) / totalDaysInPeriod);

    return proRataAmount;
  }

  /**
   * Update Stripe subscription quantity
   */
  async updateStripeSubscriptionQuantity(organization: Organization, newQuantity: number): Promise<void> {
    if (!organization.stripeSubscriptionId) {
      console.error(`Organization ${organization.id} has no Stripe subscription`);
      return;
    }

    try {
      await stripe.subscriptions.update(organization.stripeSubscriptionId, {
        items: [
          {
            quantity: newQuantity,
          },
        ],
      });

      // Update organization billing user count
      await db
        .update(organizations)
        .set({ billingUserCount: newQuantity })
        .where(eq(organizations.id, organization.id));
    } catch (error) {
      console.error(`Failed to update Stripe subscription quantity:`, error);
      throw error;
    }
  }

  /**
   * Track billing change in the billing_events table
   */
  async trackBillingChange(params: {
    organizationId: string;
    eventType: string;
    userCount: number;
    previousUserCount?: number;
    amount?: number;
    description?: string;
    stripeInvoiceItemId?: string;
    stripeSubscriptionId?: string;
    userId?: string;
    metadata?: any;
  }): Promise<BillingEvent> {
    const billingEvent: InsertBillingEvent = {
      organizationId: params.organizationId,
      eventType: params.eventType,
      userId: params.userId,
      userCount: params.userCount,
      previousUserCount: params.previousUserCount,
      amount: params.amount,
      currency: "usd",
      stripeInvoiceItemId: params.stripeInvoiceItemId,
      stripeSubscriptionId: params.stripeSubscriptionId,
      description: params.description,
      metadata: params.metadata,
    };

    const [event] = await db.insert(billingEvents).values(billingEvent).returning();
    return event;
  }

  /**
   * Handle user addition - calculate pro-rata charge and update subscription
   */
  async handleUserAddition(organization: Organization, userId?: string): Promise<void> {
    // Get current active user count
    const activeUsers = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.organizationId, organization.id),
          eq(users.isActive, true)
        )
      );

    const newUserCount = activeUsers.length;
    const previousUserCount = organization.billingUserCount || 0;

    if (newUserCount <= previousUserCount) {
      // No new users to bill for
      return;
    }

    // Calculate pro-rata charge
    const proRataAmount = await this.calculateProRataCharge(organization, newUserCount);

    if (proRataAmount > 0 && organization.stripeCustomerId) {
      try {
        // Create Stripe invoice item for pro-rata charge
        const invoiceItem = await stripe.invoiceItems.create({
          customer: organization.stripeCustomerId,
          amount: proRataAmount,
          currency: "usd",
          description: `Pro-rata charge for ${newUserCount - previousUserCount} additional user(s)`,
        });

        // Track the billing event
        await this.trackBillingChange({
          organizationId: organization.id,
          eventType: "user_added",
          userCount: newUserCount,
          previousUserCount: previousUserCount,
          amount: proRataAmount,
          description: `Added ${newUserCount - previousUserCount} user(s) with pro-rata charge`,
          stripeInvoiceItemId: invoiceItem.id,
          stripeSubscriptionId: organization.stripeSubscriptionId || undefined,
          userId: userId,
          metadata: {
            proRataCharge: true,
            usersAdded: newUserCount - previousUserCount,
          },
        });
      } catch (error) {
        console.error("Failed to create pro-rata charge:", error);
        // Still track the event even if Stripe fails
        await this.trackBillingChange({
          organizationId: organization.id,
          eventType: "user_added",
          userCount: newUserCount,
          previousUserCount: previousUserCount,
          description: `Added ${newUserCount - previousUserCount} user(s) (Stripe charge failed)`,
          userId: userId,
          metadata: {
            error: String(error),
            usersAdded: newUserCount - previousUserCount,
          },
        });
      }
    } else {
      // Track the event without charge (trial or no Stripe customer)
      await this.trackBillingChange({
        organizationId: organization.id,
        eventType: "user_added",
        userCount: newUserCount,
        previousUserCount: previousUserCount,
        description: `Added ${newUserCount - previousUserCount} user(s) (no charge - trial/setup)`,
        userId: userId,
        metadata: {
          usersAdded: newUserCount - previousUserCount,
        },
      });
    }

    // Update subscription quantity
    if (organization.stripeSubscriptionId) {
      await this.updateStripeSubscriptionQuantity(organization, newUserCount);
    } else {
      // Just update the database
      await db
        .update(organizations)
        .set({ billingUserCount: newUserCount })
        .where(eq(organizations.id, organization.id));
    }
  }

  /**
   * Handle user removal - track change for next billing cycle
   */
  async handleUserRemoval(organization: Organization, userId?: string): Promise<void> {
    // Get current active user count
    const activeUsers = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.organizationId, organization.id),
          eq(users.isActive, true)
        )
      );

    const newUserCount = activeUsers.length;
    const previousUserCount = organization.billingUserCount || 0;

    if (newUserCount >= previousUserCount) {
      // No users removed
      return;
    }

    // Update pending billing changes
    const currentPendingChanges = organization.pendingBillingChanges as any || {};
    const pendingChanges = {
      ...currentPendingChanges,
      userRemovals: (currentPendingChanges.userRemovals || 0) + (previousUserCount - newUserCount),
      targetUserCount: newUserCount,
      lastUpdated: new Date().toISOString(),
    };

    // Update organization with pending changes
    await db
      .update(organizations)
      .set({ pendingBillingChanges: pendingChanges })
      .where(eq(organizations.id, organization.id));

    // Track the billing event (no immediate charge/refund)
    await this.trackBillingChange({
      organizationId: organization.id,
      eventType: "user_removed",
      userCount: newUserCount,
      previousUserCount: previousUserCount,
      description: `Removed ${previousUserCount - newUserCount} user(s) - will reduce seats on next billing cycle`,
      userId: userId,
      metadata: {
        pendingReduction: true,
        usersRemoved: previousUserCount - newUserCount,
      },
    });
  }

  /**
   * Sync billing period dates from Stripe subscription
   */
  async syncBillingPeriod(organization: Organization): Promise<void> {
    if (!organization.stripeSubscriptionId) {
      return;
    }

    try {
      const subscription = await stripe.subscriptions.retrieve(organization.stripeSubscriptionId);
      
      const periodStart = new Date(subscription.current_period_start * 1000);
      const periodEnd = new Date(subscription.current_period_end * 1000);

      await db
        .update(organizations)
        .set({
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
          stripeSubscriptionStatus: subscription.status,
        })
        .where(eq(organizations.id, organization.id));
    } catch (error) {
      console.error("Failed to sync billing period:", error);
    }
  }

  /**
   * Get current billing usage information
   */
  async getCurrentBillingUsage(organizationId: string): Promise<{
    currentUserCount: number;
    billedUserCount: number;
    pendingChanges: any;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    pricePerUser: number;
  }> {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId));

    if (!organization) {
      throw new Error("Organization not found");
    }

    const activeUsers = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.organizationId, organizationId),
          eq(users.isActive, true)
        )
      );

    return {
      currentUserCount: activeUsers.length,
      billedUserCount: organization.billingUserCount || 0,
      pendingChanges: organization.pendingBillingChanges || {},
      currentPeriodStart: organization.billingPeriodStart || undefined,
      currentPeriodEnd: organization.billingPeriodEnd || undefined,
      pricePerUser: organization.billingPricePerUser || 0,
    };
  }

  /**
   * Process end of billing period - apply pending changes
   */
  async processBillingPeriodEnd(organization: Organization): Promise<void> {
    const pendingChanges = organization.pendingBillingChanges as any;
    
    if (!pendingChanges || !pendingChanges.targetUserCount) {
      return;
    }

    // Update subscription quantity to reflect pending changes
    if (organization.stripeSubscriptionId) {
      await this.updateStripeSubscriptionQuantity(organization, pendingChanges.targetUserCount);
    }

    // Clear pending changes
    await db
      .update(organizations)
      .set({ 
        pendingBillingChanges: null,
        billingUserCount: pendingChanges.targetUserCount,
      })
      .where(eq(organizations.id, organization.id));

    // Track the billing event
    await this.trackBillingChange({
      organizationId: organization.id,
      eventType: "billing_period_reset",
      userCount: pendingChanges.targetUserCount,
      previousUserCount: organization.billingUserCount || 0,
      description: `Applied pending changes at end of billing period`,
      stripeSubscriptionId: organization.stripeSubscriptionId || undefined,
      metadata: pendingChanges,
    });
  }
}

export const billingService = new BillingServiceImpl();