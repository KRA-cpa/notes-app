// notes.js

  import { requireAuth } from '../lib/middleware';

async function handler(req, res) {
  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  
  if (req.method === 'GET') {
    try {
      const response = await fetch(`${APPS_SCRIPT_URL}?X-User-ID=${req.user.sub}&X-User-Email=${req.user.email}&X-User-Name=${req.user.name}`, {
        method: 'GET'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      res.status(200).json(data);
    } catch (error) {
      console.error('Error fetching from Apps Script:', error);
      res.status(500).json({ error: 'Failed to fetch notes' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

export default requireAuth(handler);