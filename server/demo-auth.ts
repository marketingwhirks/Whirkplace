import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'demo-jwt-secret-change-in-production';

// Demo users that work in all environments
export const DEMO_USERS = [
  {
    id: '41803eac-b385-4f1b-883c-bc66f26697db',
    name: 'John Delicious',
    email: 'john@delicious.com',
    role: 'admin' as const,
    teamId: 'kitchen',
    password: 'Demo1234!',
    isActive: true,
    isSuperAdmin: false,
    organizationId: 'b74d00fd-e1ce-41ae-afca-4a0d55cb1fe1' // fictitious-delicious
  },
  {
    id: '42803eac-b385-4f1b-883c-bc66f26697db',
    name: 'Sarah Delicious',
    email: 'sarah@delicious.com',
    role: 'manager' as const,
    teamId: 'kitchen',
    password: 'Demo1234!',
    isActive: true,
    isSuperAdmin: false,
    organizationId: 'b74d00fd-e1ce-41ae-afca-4a0d55cb1fe1'
  },
  {
    id: '43803eac-b385-4f1b-883c-bc66f26697db',
    name: 'Mike Delicious',
    email: 'mike@delicious.com',
    role: 'member' as const,
    teamId: 'front-of-house',
    password: 'Demo1234!',
    isActive: true,
    isSuperAdmin: false,
    organizationId: 'b74d00fd-e1ce-41ae-afca-4a0d55cb1fe1'
  },
  {
    id: '44803eac-b385-4f1b-883c-bc66f26697db',
    name: 'Alice Delicious',
    email: 'alice@delicious.com',
    role: 'member' as const,
    teamId: 'kitchen',
    password: 'Demo1234!',
    isActive: true,
    isSuperAdmin: false,
    organizationId: 'b74d00fd-e1ce-41ae-afca-4a0d55cb1fe1'
  },
  {
    id: '45803eac-b385-4f1b-883c-bc66f26697db',
    name: 'Bob Delicious',
    email: 'bob@delicious.com',
    role: 'member' as const,
    teamId: 'kitchen',
    password: 'Demo1234!',
    isActive: true,
    isSuperAdmin: false,
    organizationId: 'b74d00fd-e1ce-41ae-afca-4a0d55cb1fe1'
  }
];

export function generateDemoToken(email: string): string | null {
  const user = DEMO_USERS.find(u => u.email === email);
  if (!user) return null;
  
  // Generate JWT token for demo user
  const token = jwt.sign(
    { 
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      isDemo: true
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  return token;
}

export function verifyDemoToken(token: string): any {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    return null;
  }
}

export function getDemoUser(email: string) {
  return DEMO_USERS.find(u => u.email === email);
}

export function getDemoUserById(id: string) {
  return DEMO_USERS.find(u => u.id === id);
}