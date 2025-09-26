/**
 * Sanitizes user data to remove sensitive information before sending to client
 * This is a critical security function to prevent password hash exposure
 */
export function sanitizeUser(user: any) {
  if (!user) return null;
  
  // Create a safe copy without sensitive fields
  const {
    password, // Never expose password hash
    microsoftAccessToken, // Never expose tokens
    microsoftRefreshToken,
    slackAccessToken,
    slackRefreshToken,
    ...safeUser
  } = user;
  
  return safeUser;
}

/**
 * Sanitizes an array of users
 */
export function sanitizeUsers(users: any[]) {
  if (!users) return [];
  return users.map(sanitizeUser);
}