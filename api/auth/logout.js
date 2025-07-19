export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // In a stateless JWT system, logout is handled client-side
  // Here we just confirm the logout
  res.status(200).json({ success: true, message: 'Logged out successfully' });
}