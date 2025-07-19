// Create: /api/test-appscript.js

export default async function handler(req, res) {
  try {
    console.log('🧪 Testing Apps Script connection...');
    console.log('🔗 Apps Script URL:', process.env.APPS_SCRIPT_URL);
    
    if (!process.env.APPS_SCRIPT_URL) {
      return res.status(500).json({
        error: 'APPS_SCRIPT_URL not configured',
        hasUrl: false
      });
    }
    
    const testPayload = {
      action: 'test',
      note: { id: 'test-123', title: 'Test Note' },
      'X-User-ID': 'test-user',
      'X-User-Email': 'test@example.com'
    };
    
    console.log('📤 Sending test payload:', testPayload);
    
    const response = await fetch(process.env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log('📊 Apps Script response status:', response.status);
    console.log('📊 Apps Script response headers:', [...response.headers.entries()]);
    
    let data;
    const responseText = await response.text();
    console.log('📄 Raw response text:', responseText);
    
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ Failed to parse JSON:', parseError);
      data = { rawResponse: responseText, parseError: parseError.message };
    }
    
    res.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      appsScriptResponse: data,
      rawResponse: responseText,
      hasAppsScriptUrl: !!process.env.APPS_SCRIPT_URL,
      appsScriptUrl: process.env.APPS_SCRIPT_URL ? 
        `${process.env.APPS_SCRIPT_URL.substring(0, 50)}...` : 
        'Not set'
    });
    
  } catch (error) {
    console.error('❌ Test endpoint error:', error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      hasAppsScriptUrl: !!process.env.APPS_SCRIPT_URL
    });
  }
}