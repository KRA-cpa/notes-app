// Create: /api/test-appscript.js
export default async function handler(req, res) {
  try {
    console.log('🧪 Testing Apps Script connection...');
    
    const response = await fetch(process.env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'test',
        note: { id: 'test-123', title: 'Test Note' },
        'X-User-ID': 'test-user',
        'X-User-Email': 'test@example.com'
      })
    });
    
    const data = await response.json();
    
    res.json({
      status: response.status,
      appsScriptResponse: data,
      success: response.ok
    });
    
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
}