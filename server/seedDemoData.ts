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
      description: 'A demo organization for exploring Whirkplace features',
      isDemo: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Company values will be added when that feature is implemented

    // Create demo teams
    const teamIds = {
      engineering: crypto.randomUUID(),
      sales: crypto.randomUUID(),
      marketing: crypto.randomUUID()
    };

    await db.insert(teams).values([
      {
        id: teamIds.engineering,
        organizationId: demoOrgId,
        name: 'Engineering',
        description: 'Product development team',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: teamIds.sales,
        organizationId: demoOrgId,
        name: 'Sales',
        description: 'Business development team',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: teamIds.marketing,
        organizationId: demoOrgId,
        name: 'Marketing',
        description: 'Marketing and growth team',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    // Hash the demo password
    const demoPassword = await bcrypt.hash('Demo1234!', 10);

    // Create demo users with specific IDs
    const demoUsers = [
      {
        id: '41803eac-b385-4f1b-883c-bc66f26697db',
        email: 'john@delicious.com',
        name: 'John Delicious',
        role: 'admin' as const,
        teamId: teamIds.engineering,
        isAccountOwner: true
      },
      {
        id: crypto.randomUUID(),
        email: 'sarah@delicious.com',
        name: 'Sarah Connor',
        role: 'admin' as const,
        teamId: teamIds.sales,
        isAccountOwner: false
      },
      {
        id: crypto.randomUUID(),
        email: 'mike@delicious.com',
        name: 'Mike Manager',
        role: 'manager' as const,
        teamId: teamIds.engineering,
        isAccountOwner: false
      },
      {
        id: crypto.randomUUID(),
        email: 'alice@delicious.com',
        name: 'Alice Member',
        role: 'member' as const,
        teamId: teamIds.engineering,
        isAccountOwner: false
      },
      {
        id: crypto.randomUUID(),
        email: 'bob@delicious.com',
        name: 'Bob Builder',
        role: 'member' as const,
        teamId: teamIds.marketing,
        isAccountOwner: false
      }
    ];

    for (const user of demoUsers) {
      await db.insert(users).values({
        ...user,
        password: demoPassword,
        username: user.email.split('@')[0],
        organizationId: demoOrgId,
        jobTitle: user.role === 'admin' ? 'Account Owner' : 
                   user.role === 'manager' ? 'Team Manager' : 'Team Member',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Update team leaders
    await db.update(teams)
      .set({ leaderId: demoUsers[2].id }) // Mike Manager leads Engineering
      .where(eq(teams.id, teamIds.engineering));

    await db.update(teams)
      .set({ leaderId: demoUsers[1].id }) // Sarah Connor leads Sales
      .where(eq(teams.id, teamIds.sales));

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