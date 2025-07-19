// notes.js

import { requireAuth } from '../lib/middleware';

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      console.log('📥 Loading notes for user:', req.user.email);
      
      // Build URL with user context as query parameters
      const url = new URL(process.env.APPS_SCRIPT_URL);
      url.searchParams.append('X-User-ID', req.user.sub);
      url.searchParams.append('X-User-Email', req.user.email);
      url.searchParams.append('X-User-Name', req.user.name || '');

      console.log('🔗 Apps Script URL:', url.toString());

      const response = await fetch(url.toString(), {
        method: 'GET'
      });
      
      console.log('📊 Apps Script response status:', response.status);
      console.log('📊 Apps Script response headers:', [...response.headers.entries()]);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Apps Script error response:', errorText);
        throw new Error(`Apps Script returned ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('✅ Apps Script returned data:', Array.isArray(data) ? `${data.length} notes` : 'Unknown format');
      
      res.status(200).json(data);
    } catch (error) {
      console.error('❌ API Error details:', {
        message: error.message,
        stack: error.stack,
        userEmail: req.user?.email
      });
      
      res.status(500).json({ 
        error: 'Failed to fetch notes',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

export default requireAuth(handler);