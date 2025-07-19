// notes.js

import { requireAuth } from '../lib/middleware';

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      // Build URL with user context as query parameters
      const url = new URL(process.env.APPS_SCRIPT_URL);
      url.searchParams.append('X-User-ID', req.user.sub);
      url.searchParams.append('X-User-Email', req.user.email);
      url.searchParams.append('X-User-Name', req.user.name || '');

      const response = await fetch(url.toString(), {
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