// update-note.js

import { requireAuth } from '../lib/middleware';

async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // Add user context to the request body
      const requestBody = {
        ...req.body,
        'X-User-ID': req.user.sub,
        'X-User-Email': req.user.email,
        'X-User-Name': req.user.name || ''
      };

      const response = await fetch(process.env.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      res.status(200).json(data);
    } catch (error) {
      console.error('Error updating note:', error);
      res.status(500).json({ error: 'Failed to update note' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

export default requireAuth(handler);