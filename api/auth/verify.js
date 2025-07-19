import { verifyGoogleToken, generateJWT, checkUserAccess } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    // Verify Google token
    const user = await verifyGoogleToken(token);
    
    // Check if user is allowed (if gatekeeping enabled)
    if (!checkUserAccess(user.email)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Generate JWT for session management
    const jwtToken = generateJWT(user);

    res.status(200).json({ 
      user, 
      authenticated: true,
      token: jwtToken
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}