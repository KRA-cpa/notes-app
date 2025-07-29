/**
 * Notes App - Google Apps Script with User Authentication
 * Complete rewrite to support multi-user functionality
 * FIXED: User context reading for POST requests
 */

// Global variable to store current request context
let currentRequest = null;

/**
 * Main GET handler - Returns user-specific notes
 */
function doGet(e) {
  currentRequest = e; // Store request for header access
  currentRequest.method = 'GET'; // Add method for context
  
  try {
    const user = getUserContext();
    
    console.log('🔍 GET request user context:', user);
    
    // Verify user is authenticated
    if (!user.userId) {
      console.log('❌ No userId found in GET request');
      return createErrorResponse("Unauthorized - User authentication required", 401);
    }

    console.log(`📥 Loading notes for user: ${user.userEmail}`);
    
    // Get user-specific notes
    const userNotes = getUserNotes(user.userId);
    
    console.log(`✅ Returning ${userNotes.length} notes for user: ${user.userEmail}`);
    
    return ContentService.createTextOutput(JSON.stringify(userNotes))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('❌ Error in doGet:', error);
    return createErrorResponse(`Internal Server Error: ${error.toString()}`, 500);
  }
}

/**
 * Main POST handler - Handles note operations with user verification
 */
function doPost(e) {
  currentRequest = e; // Store request for header access
  currentRequest.method = 'POST'; // Add method for context
  
  try {
    console.log('📨 POST request received');
    console.log('📄 POST data contents:', e.postData ? e.postData.contents : 'No postData');
    
    const user = getUserContext();
    
    console.log('🔍 POST request user context:', user);
    
    // Verify user is authenticated
    if (!user.userId) {
      console.log('❌ No userId found in POST request');
      return createErrorResponse("Unauthorized - User authentication required", 401);
    }

    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    const note = data.note;
    
    console.log(`🔄 Processing ${action} action for user: ${user.userEmail}`);
    console.log('📝 Note data:', note);
    
    let result;
    
    switch (action) {
      case 'add':
        result = addNote(note, user);
        break;
      case 'update':
        result = updateNote(note, user);
        break;
      case 'delete':
        result = deleteNote(note, user);
        break;
      case 'test':
        // Handle test action
        result = { success: true, message: 'Test successful', user: user };
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    console.log(`✅ ${action} completed successfully for user: ${user.userEmail}`);
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error(`❌ Error in doPost:`, error);
    return createErrorResponse(`Operation failed: ${error.toString()}`, 500);
  }
}

/**
 * Extract user context from request - FIXED for POST requests
 */
function getUserContext() {
  if (!currentRequest) {
    console.log('⚠️ No current request available');
    return { userEmail: '', userId: '', userName: '' };
  }
  
  let userEmail = '';
  let userId = '';
  let userName = '';
  
  // For GET requests - check query parameters
  if (currentRequest.method === 'GET' || !currentRequest.postData) {
    console.log('🔍 Reading user context from GET parameters');
    userEmail = currentRequest.parameter['X-User-Email'] || '';
    userId = currentRequest.parameter['X-User-ID'] || '';
    userName = currentRequest.parameter['X-User-Name'] || '';
  } 
  // For POST requests - check JSON body
  else {
    console.log('🔍 Reading user context from POST body');
    try {
      const postData = JSON.parse(currentRequest.postData.contents || '{}');
      console.log('📄 Parsed POST data keys:', Object.keys(postData));
      
      userEmail = postData['X-User-Email'] || '';
      userId = postData['X-User-ID'] || '';
      userName = postData['X-User-Name'] || '';
      
      console.log('🔍 Extracted from POST:', { userEmail, userId, userName });
    } catch (error) {
      console.error('❌ Failed to parse POST data for user context:', error);
    }
  }
  
  console.log('👤 Final user context:', { userEmail, userId, userName });
  
  return { 
    userEmail: userEmail, 
    userId: userId,
    userName: userName
  };
}

/**
 * Get all notes for a specific user
 */
function getUserNotes(userId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notes');
  
  if (!sheet) {
    throw new Error('Notes sheet not found');
  }
  
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    console.log('📋 No notes found - empty sheet');
    return []; // No data or just headers
  }
  
  const headers = data[0];
  const userIdIndex = headers.indexOf('userId');
  
  // If userId column doesn't exist, this might be legacy data
  if (userIdIndex === -1) {
    console.warn('⚠️ userId column not found - this might be legacy data');
    // For backward compatibility, return all notes if no userId column exists
    // You might want to run migration first
    const allNotes = [];
    for (let i = 1; i < data.length; i++) {
      const note = rowToNote(data[i], headers);
      allNotes.push(note);
    }
    return allNotes;
  }
  
  const userNotes = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // Filter by user - only return notes owned by this user
    if (row[userIdIndex] === userId) {
      const note = rowToNote(row, headers);
      userNotes.push(note);
    }
  }
  
  return userNotes;
}

/**
 * Add a new note with user context
 */
function addNote(note, user) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notes');
  
  if (!sheet) {
    throw new Error('Notes sheet not found');
  }
  
  // Add user context to note
  const now = new Date().toISOString();
  note.userId = user.userId;
  note.userEmail = user.userEmail;
  note.createdBy = user.userId;
  note.lastModified = now;
  note.isShared = false;
  
  // Ensure required fields have defaults
  note.id = note.id || generateId();
  note.timestamp = note.timestamp || now;
  note.title = note.title || 'New Note';
  note.done = note.done || false;
  note.priority = note.priority || 0;
  
  const row = noteToRow(note);
  sheet.appendRow(row);
  
  // Register user if first time
  registerUser(user);
  
  console.log(`➕ Added note: ${note.title} for user: ${user.userEmail}`);
  
  return { success: true, message: 'Note added successfully' };
}

/**
 * Update an existing note with user verification
 */
function updateNote(note, user) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notes');
  
  if (!sheet) {
    throw new Error('Notes sheet not found');
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const idIndex = headers.indexOf('id');
  const userIdIndex = headers.indexOf('userId');
  
  if (idIndex === -1) {
    throw new Error('id column not found in Notes sheet');
  }
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIndex] === note.id) {
      // Verify user owns this note (if userId column exists)
      if (userIdIndex !== -1 && data[i][userIdIndex] !== user.userId) {
        throw new Error('Access denied: You do not own this note');
      }
      
      // Update note with user context
      note.lastModified = new Date().toISOString();
      note.userId = user.userId; // Ensure user context is preserved
      note.userEmail = user.userEmail;
      
      const updatedRow = noteToRow(note);
      
      // Write updated row
      for (let j = 0; j < Math.min(headers.length, updatedRow.length); j++) {
        sheet.getRange(i + 1, j + 1).setValue(updatedRow[j]);
      }
      
      console.log(`📝 Updated note: ${note.title} for user: ${user.userEmail}`);
      
      return { success: true, message: 'Note updated successfully' };
    }
  }
  
  throw new Error('Note not found');
}

/**
 * Delete a note with user verification
 */
function deleteNote(noteData, user) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notes');
  
  if (!sheet) {
    throw new Error('Notes sheet not found');
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const idIndex = headers.indexOf('id');
  const userIdIndex = headers.indexOf('userId');
  
  if (idIndex === -1) {
    throw new Error('id column not found in Notes sheet');
  }
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIndex] === noteData.id) {
      // Verify user owns this note (if userId column exists)
      if (userIdIndex !== -1 && data[i][userIdIndex] !== user.userId) {
        throw new Error('Access denied: You do not own this note');
      }
      
      const noteTitle = data[i][headers.indexOf('title')] || 'Unknown';
      sheet.deleteRow(i + 1);
      
      console.log(`🗑️ Deleted note: ${noteTitle} for user: ${user.userEmail}`);
      
      return { success: true, message: 'Note deleted successfully' };
    }
  }
  
  throw new Error('Note not found');
}

/**
 * Register or update user information
 */
function registerUser(user) {
  if (!user.userId || !user.userEmail) {
    console.warn('⚠️ Cannot register user - missing userId or userEmail');
    return;
  }
  
  const sheet = getOrCreateUsersSheet();
  const data = sheet.getDataRange().getValues();
  
  // Create headers if sheet is empty
  if (data.length === 0) {
    sheet.appendRow(['userId', 'email', 'name', 'avatar', 'createdAt', 'lastLogin', 'isActive']);
    console.log('📋 Created Users sheet headers');
  }
  
  const headers = data.length > 0 ? data[0] : ['userId', 'email', 'name', 'avatar', 'createdAt', 'lastLogin', 'isActive'];
  const userIdIndex = headers.indexOf('userId');
  
  // Check if user already exists
  for (let i = 1; i < data.length; i++) {
    if (data[i][userIdIndex] === user.userId) {
      // Update last login
      const lastLoginIndex = headers.indexOf('lastLogin');
      if (lastLoginIndex !== -1) {
        sheet.getRange(i + 1, lastLoginIndex + 1).setValue(new Date().toISOString());
      }
      console.log(`🔄 Updated last login for user: ${user.userEmail}`);
      return;
    }
  }
  
  // Add new user
  const now = new Date().toISOString();
  sheet.appendRow([
    user.userId,
    user.userEmail,
    user.userName || '',
    '', // avatar
    now, // createdAt
    now, // lastLogin
    true // isActive
  ]);
  
  console.log(`👤 Registered new user: ${user.userEmail}`);
}

/**
 * Get or create the Users sheet
 */
function getOrCreateUsersSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName('Users');
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Users');
    console.log('📋 Created new Users sheet');
  }
  
  return sheet;
}

/**
 * Convert spreadsheet row to note object
 */
function rowToNote(row, headers) {
  const note = {};
  
  // Map of spreadsheet columns to note properties
  const fieldMapping = {
    'id': 'id',
    'timestamp': 'timestamp',
    'title': 'title',
    'description': 'description',
    'tags': 'tags',
    'comments': 'comments',
    'system': 'system',
    'done': 'done',
    'dateDone': 'dateDone',
    'dateUndone': 'dateUndone',
    'priority': 'priority',
    'userId': 'userId',
    'userEmail': 'userEmail',
    'createdBy': 'createdBy',
    'lastModified': 'lastModified',
    'isShared': 'isShared'
  };
  
  // Convert each field
  for (const [sheetField, noteField] of Object.entries(fieldMapping)) {
    const index = headers.indexOf(sheetField);
    if (index !== -1 && index < row.length) {
      let value = row[index];
      
      // Convert boolean fields
      if (sheetField === 'done' || sheetField === 'isShared') {
        value = value === true || value === 'TRUE' || value === 'true' || value === 1;
      }
      // Convert numeric fields
      else if (sheetField === 'priority') {
        value = parseInt(value) || 0;
      }
      // Convert date fields to ISO strings
      else if ((sheetField === 'timestamp' || sheetField === 'dateDone' || 
                sheetField === 'dateUndone' || sheetField === 'lastModified') && value instanceof Date) {
        value = value.toISOString();
      }
      
      note[noteField] = value || '';
    }
  }
  
  return note;
}

/**
 * Convert note object to spreadsheet row
 */
function noteToRow(note) {
  return [
    note.id || '',
    note.timestamp || '',
    note.title || '',
    note.description || '',
    note.tags || '',
    note.comments || '',
    note.system || '',
    note.done || false,
    note.dateDone || '',
    note.dateUndone || '',
    note.priority || 0,
    note.userId || '',
    note.userEmail || '',
    note.createdBy || '',
    note.lastModified || '',
    note.isShared || false
  ];
}

/**
 * Create standardized error response
 */
function createErrorResponse(message, statusCode = 500) {
  const errorResponse = {
    error: true,
    message: message,
    success: false,
    timestamp: new Date().toISOString()
  };
  
  return ContentService.createTextOutput(JSON.stringify(errorResponse))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Generate unique ID
 */
function generateId() {
  return Utilities.getUuid();
}

/**
 * One-time migration function for existing notes (run manually if needed)
 * This assigns all existing notes to a default user
 */
function migrateExistingNotes() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notes');
  
  if (!sheet) {
    console.error('❌ Notes sheet not found');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  // Check if userId column already exists
  if (headers.indexOf('userId') !== -1) {
    console.log('✅ Migration already completed - userId column exists');
    return;
  }
  
  // Add new headers (assuming current structure ends at priority column K)
  const newHeaders = ['userId', 'userEmail', 'createdBy', 'lastModified', 'isShared'];
  
  // Add headers to row 1
  for (let i = 0; i < newHeaders.length; i++) {
    sheet.getRange(1, headers.length + 1 + i).setValue(newHeaders[i]);
  }
  
  // Default values for existing notes (replace with actual admin user info)
  const defaultUserId = 'legacy-admin-user';
  const defaultUserEmail = 'admin@yourdomain.com';
  const now = new Date().toISOString();
  
  // Update existing data rows
  for (let i = 2; i <= data.length; i++) { // Start from row 2 (skip headers)
    const startCol = headers.length + 1;
    
    sheet.getRange(i, startCol).setValue(defaultUserId);        // userId
    sheet.getRange(i, startCol + 1).setValue(defaultUserEmail); // userEmail
    sheet.getRange(i, startCol + 2).setValue(defaultUserId);    // createdBy
    sheet.getRange(i, startCol + 3).setValue(now);              // lastModified
    sheet.getRange(i, startCol + 4).setValue(false);            // isShared
  }
  
  console.log(`✅ Migration completed - updated ${data.length - 1} existing notes`);
}

/**
 * Utility function to test the script (for debugging)
 */
function testScript() {
  console.log('🧪 Testing Apps Script...');
  
  // Test user context
  const mockRequest = {
    method: 'POST',
    postData: {
      contents: JSON.stringify({
        'X-User-ID': 'test-user-123',
        'X-User-Email': 'test@example.com',
        'X-User-Name': 'Test User',
        action: 'test',
        note: { id: 'test', title: 'Test Note' }
      })
    }
  };
  
  currentRequest = mockRequest;
  const user = getUserContext();
  console.log('👤 User context:', user);
  
  // Test getting notes
  try {
    const notes = getUserNotes(user.userId);
    console.log(`📋 Found ${notes.length} notes for test user`);
  } catch (error) {
    console.error('❌ Error testing getUserNotes:', error);
  }
  
  console.log('✅ Test completed');
}