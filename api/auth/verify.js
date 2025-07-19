// /api/auth/verify.js - Fixed version with JWT_SECRET validation

export default async function handler(req, res) {
  // Add CORS headers for Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Auth verify called');
    console.log('📝 Request body:', req.body);
    
    // Detailed environment check
    const envCheck = {
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      hasJwtSecret: !!process.env.JWT_SECRET,
      jwtSecretLength: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0,
      googleClientIdLength: process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.length : 0
    };
    
    console.log('🔑 Environment check:', envCheck);

    const { token } = req.body;
    
    if (!token) {
      console.log('❌ No token provided');
      return res.status(400).json({ error: 'Token required' });
    }

    // Check environment variables
    if (!process.env.GOOGLE_CLIENT_ID) {
      console.log('❌ GOOGLE_CLIENT_ID not set');
      return res.status(500).json({ error: 'Server configuration error: GOOGLE_CLIENT_ID not set' });
    }

    if (!process.env.JWT_SECRET) {
      console.log('❌ JWT_SECRET not set');
      return res.status(500).json({ error: 'Server configuration error: JWT_SECRET not set' });
    }

    if (process.env.JWT_SECRET.length < 32) {
      console.log('❌ JWT_SECRET too short:', process.env.JWT_SECRET.length);
      return res.status(500).json({ error: 'Server configuration error: JWT_SECRET must be at least 32 characters' });
    }

    // Try to import dependencies
    let OAuth2Client, jwt;
    try {
      const googleAuth = await import('google-auth-library');
      OAuth2Client = googleAuth.OAuth2Client;
      jwt = await import('jsonwebtoken');
      console.log('✅ Dependencies loaded successfully');
    } catch (importError) {
      console.log('❌ Failed to import dependencies:', importError);
      return res.status(500).json({ 
        error: 'Server configuration error: Missing dependencies',
        details: importError.message
      });
    }

    // Verify Google token
    console.log('🔍 Verifying Google token...');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
    let user;
    try {
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      
      const payload = ticket.getPayload();
      user = {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture
      };
      console.log('✅ Google token verified for user:', user.email);
    } catch (verifyError) {
      console.log('❌ Google token verification failed:', verifyError);
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    // Check user access (if ALLOWED_USERS is set)
    if (process.env.ALLOWED_USERS) {
      const allowedUsers = process.env.ALLOWED_USERS.split(',').map(u => u.trim());
      if (!allowedUsers.includes(user.email)) {
        console.log('❌ User not in allowed list:', user.email);
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Generate JWT with proper validation
    console.log('🔑 Generating JWT...');
    console.log('🔑 JWT_SECRET length:', process.env.JWT_SECRET.length);
    
    let jwtToken;
    try {
      jwtToken = jwt.default.sign(user, process.env.JWT_SECRET, { expiresIn: '24h' });
      console.log('✅ JWT generated successfully');
    } catch (jwtError) {
      console.log('❌ JWT generation failed:', jwtError);
      return res.status(500).json({ 
        error: 'Failed to generate authentication token',
        details: jwtError.message
      });
    }

    console.log('✅ Authentication successful for:', user.email);
    res.status(200).json({ 
      user, 
      authenticated: true,
      token: jwtToken
    });

  } catch (error) {
    console.error('❌ Authentication error:', error);
    res.status(500).json({ 
      error: 'Authentication failed', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 