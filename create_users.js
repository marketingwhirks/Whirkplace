// Script to create users for Patrick Accounting
import bcrypt from 'bcryptjs';

async function createUsers() {
  const users = [
    {
      name: 'Mandy Patrick',
      email: 'mandy.patrick@patrickaccounting.com',
      role: 'admin',
      password: 'Welcome123!'
    },
    {
      name: 'Kim Pope',
      email: 'kimpope@patrickaccounting.com',
      role: 'manager',
      password: 'Welcome123!'
    },
    {
      name: 'Mike Shaeffer',
      email: 'mike@whirks.com',
      role: 'admin',
      password: 'Welcome123!'
    },
    {
      name: 'Shelby Betts',
      email: 'shelbyb@patrickaccounting.com',
      role: 'manager',
      password: 'Welcome123!'
    }
  ];

  console.log('Creating users for Patrick Accounting...\n');
  
  for (const user of users) {
    // Hash the password
    const hashedPassword = await bcrypt.hash(user.password, 10);
    
    console.log(`User: ${user.name}`);
    console.log(`Email: ${user.email}`);
    console.log(`Role: ${user.role}`);
    console.log(`Password: ${user.password}`);
    console.log(`Hashed: ${hashedPassword}`);
    console.log('---');
  }
  
  console.log('\n✅ User creation script complete!');
  console.log('Copy the hashed passwords above to use in SQL insert statements.');
}

createUsers().catch(console.error);