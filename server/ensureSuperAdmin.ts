import { storage } from "./storage";
import bcrypt from "bcryptjs";

/**
 * Ensures the Whirkplace super admin account exists and is properly configured
 * This is the system super admin account for mpatrick@whirks.com
 */
export async function ensureWhirkplaceSuperAdmin() {
  try {
    console.log("🔧 Checking Whirkplace super admin account...");
    
    // Get the Whirkplace organization
    const whirkplaceOrg = await storage.getOrganizationBySlug('whirkplace');
    if (!whirkplaceOrg) {
      console.error("❌ Whirkplace organization not found!");
      return;
    }
    
    // Check if the super admin user exists
    let superAdmin = await storage.getUserByEmail(whirkplaceOrg.id, 'mpatrick@whirks.com');
    
    if (superAdmin) {
      // Update to ensure super admin status is set
      await storage.updateUser(whirkplaceOrg.id, superAdmin.id, {
        isSuperAdmin: true,
        role: 'admin',
        isActive: true,
        name: 'Matthew Patrick',
        username: 'mpatrickSA'
      });
      console.log("✅ Super admin account updated: mpatrick@whirks.com");
    } else {
      // Create the super admin account with a secure password
      // This password should be changed through proper channels
      const hashedPassword = await bcrypt.hash('SuperAdmin2025!', 10);
      
      superAdmin = await storage.createUser(whirkplaceOrg.id, {
        email: 'mpatrick@whirks.com',
        username: 'mpatrickSA',
        name: 'Matthew Patrick',
        password: hashedPassword,
        role: 'admin',
        organizationId: whirkplaceOrg.id,
        authProvider: 'local',
        isActive: true,
        isSuperAdmin: true,
        isAccountOwner: true
      });
      
      console.log("✅ Super admin account created: mpatrick@whirks.com");
      console.log("⚠️  IMPORTANT: Please change the default password immediately!");
    }
    
    return superAdmin;
  } catch (error) {
    console.error("❌ Error ensuring super admin account:", error);
  }
}