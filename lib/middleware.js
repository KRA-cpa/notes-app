import { verifyJWT } from './auth';

export function requireAuth(handler) {
  return async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      const user = verifyJWT(token);
      
      // Add user to request object
      req.user = user;
      
      return handler(req, res);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
  };
}