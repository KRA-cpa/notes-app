export default async function handler(req, res) {
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzofp1lc9V2Fw-HjmOKVUNMQMVcWqS1IyCxhp3ltL2lS3sJFRwBNZfL3mGVCZJHxXtFXA/exec';
  
  if (req.method === 'GET') {
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
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