// update-note.js

import { requireAuth } from '../lib/middleware';

async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      console.log('💾 Saving note for user:', req.user.email);
      console.log('📝 Request body:', req.body);
      
      // Add user context to the request body
      const requestBody = {
        ...req.body,
        'X-User-ID': req.user.sub,
        'X-User-Email': req.user.email,
        'X-User-Name': req.user.name || ''
      };

      console.log('🔗 Sending to Apps Script:', process.env.APPS_SCRIPT_URL);
      console.log('📤 Request payload:', requestBody);

      const response = await fetch(process.env.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log('📊 Apps Script response status:', response.status);
      console.log('📊 Apps Script response headers:', [...response.headers.entries()]);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Apps Script error response:', errorText);
        throw new Error(`Apps Script returned ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('✅ Apps Script response data:', data);
      
      // Check if Apps Script returned success
      if (data.error) {
        console.error('❌ Apps Script returned error:', data);
        throw new Error(`Apps Script error: ${data.error}`);
      }
      
      if (!data.success) {
        console.error('❌ Apps Script returned unsuccessful response:', data);
        throw new Error(`Apps Script operation failed: ${data.message || 'Unknown error'}`);
      }
      
      console.log('✅ Note operation successful');
      res.status(200).json(data);
      
    } catch (error) {
      console.error('❌ API Error details:', {
        message: error.message,
        stack: error.stack,
        userEmail: req.user?.email,
        requestBody: req.body
      });
      
      res.status(500).json({ 
        error: 'Failed to update note',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

export default requireAuth(handler);