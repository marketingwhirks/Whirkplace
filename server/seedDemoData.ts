import { db } from './db';
import { organizations, users, teams } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';

export async function ensureDemoDataExists() {
  try {
    console.log('🎬 Checking if demo data exists...');
    
    // Check if the demo organization already exists
    const existingOrg = await db.select()
      .from(organizations)
      .where(eq(organizations.slug, 'fictitious-delicious'))
      .limit(1);

    if (existingOrg.length > 0) {
      console.log('✓ Demo organization already exists');
      return;
    }

    console.log('📝 Creating demo organization and users...');

    // Create the demo organization with specific ID to match what's referenced in demo-login.tsx
    const demoOrgId = 'b74d00fd-e1ce-41ae-afca-4a0d55cb1fe1';
    
    await db.insert(organizations).values({
      id: demoOrgId,
      name: 'Fictitious Delicious',
      slug: 'fictitious-delicious',
      description: 'A fine dining restaurant showcasing Whirkplace for hospitality teams',
      isDemo: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Company values will be added when that feature is implemented

    // Create demo teams for restaurant
    const teamIds = {
      kitchen: crypto.randomUUID(),
      service: crypto.randomUUID(),
      management: crypto.randomUUID()
    };

    await db.insert(teams).values([
      {
        id: teamIds.kitchen,
        organizationId: demoOrgId,
        name: 'Kitchen',
        description: 'Culinary team and back of house',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: teamIds.service,
        organizationId: demoOrgId,
        name: 'Service',
        description: 'Front of house and customer experience',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: teamIds.management,
        organizationId: demoOrgId,
        name: 'Management',
        description: 'Restaurant operations and administration',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    // Hash the demo password
    const demoPassword = await bcrypt.hash('Demo1234!', 10);

    // Create demo users with specific IDs - restaurant staff
    const demoUsers = [
      {
        id: '41803eac-b385-4f1b-883c-bc66f26697db',
        email: 'john@delicious.com',
        name: 'John Delicious',
        role: 'admin' as const,
        teamId: teamIds.management,
        jobTitle: 'Restaurant Owner',
        isAccountOwner: true
      },
      {
        id: crypto.randomUUID(),
        email: 'sarah@delicious.com',
        name: 'Sarah Connor',
        role: 'admin' as const,
        teamId: teamIds.management,
        jobTitle: 'General Manager',
        isAccountOwner: false
      },
      {
        id: crypto.randomUUID(),
        email: 'mike@delicious.com',
        name: 'Mike Chen',
        role: 'manager' as const,
        teamId: teamIds.kitchen,
        jobTitle: 'Executive Chef',
        isAccountOwner: false
      },
      {
        id: crypto.randomUUID(),
        email: 'alice@delicious.com',
        name: 'Alice Johnson',
        role: 'member' as const,
        teamId: teamIds.service,
        jobTitle: 'Head Server',
        isAccountOwner: false
      },
      {
        id: crypto.randomUUID(),
        email: 'bob@delicious.com',
        name: 'Bob Martinez',
        role: 'member' as const,
        teamId: teamIds.kitchen,
        jobTitle: 'Sous Chef',
        isAccountOwner: false
      }
    ];

    for (const user of demoUsers) {
      await db.insert(users).values({
        ...user,
        password: demoPassword,
        username: user.email.split('@')[0],
        organizationId: demoOrgId,
        jobTitle: user.jobTitle,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Update team leaders
    await db.update(teams)
      .set({ leaderId: demoUsers[2].id }) // Mike Chen leads Kitchen
      .where(eq(teams.id, teamIds.kitchen));

    await db.update(teams)
      .set({ leaderId: demoUsers[3].id }) // Alice Johnson leads Service
      .where(eq(teams.id, teamIds.service));

    console.log('✅ Demo data created successfully!');
    console.log('👤 Demo accounts:');
    console.log('   - john@delicious.com (Account Owner)');
    console.log('   - sarah@delicious.com (Admin)');
    console.log('   - mike@delicious.com (Manager)');
    console.log('   - alice@delicious.com (Member)');
    console.log('   - bob@delicious.com (Member)');
    console.log('   🔑 Password for all: Demo1234!');

  } catch (error) {
    console.error('❌ Error creating demo data:', error);
    // Don't throw - allow the app to continue starting even if demo data creation fails
  }
}