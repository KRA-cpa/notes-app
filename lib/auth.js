import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function verifyGoogleToken(token) {
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture
    };
  } catch (error) {
    throw new Error('Invalid Google token');
  }
}

export function generateJWT(user) {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '24h' });
}

export function verifyJWT(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid JWT token');
  }
}

export function checkUserAccess(userEmail) {
  if (!process.env.ALLOWED_USERS) return true;
  
  const allowedUsers = process.env.ALLOWED_USERS.split(',').map(u => u.trim());
  return allowedUsers.includes(userEmail);
}