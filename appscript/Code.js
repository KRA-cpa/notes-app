/**
 * Notes App - Google Apps Script Backend
 * 
 * Features:
 * - Multi-user authentication with Google accounts
 * - Client-side encryption support for sensitive data
 * - Due date functionality with overdue tracking
 * - User isolation (users only see their own notes)
 * - CRUD operations for notes management
 * 
 * Data Flow:
 * 1. Frontend sends requests with user context (userId, email, name)
 * 2. Backend validates user and performs operations
 * 3. Encrypted data is stored as JSON strings in sheets
 * 4. Plain text data (tags, system, dates) stored for filtering
 * 
 * Security:
 * - User context required for all operations
 * - Notes are isolated by userId
 * - Sensitive fields encrypted client-side
 * - No plain text passwords or tokens stored
 */

// Global variable to store current request context for user extraction
let currentRequest = null;

/**
 * Main GET handler - Load user-specific notes from Google Sheets
 * 
 * Expected Query Parameters:
 * - X-User-ID: Google user's unique identifier
 * - X-User-Email: User's email address
 * - X-User-Name: User's display name
 * 
 * Returns: JSON array of notes belonging to the authenticated user
 * Notes include both encrypted fields (title, description, comments) and
 * plain text fields (tags, system, dates) for filtering/sorting
 * 
 * @param {Object} e - Google Apps Script event object containing request data
 * @returns {ContentService.TextOutput} JSON response with user's notes
 */
function doGet(e) {
  // Store request globally for user context extraction
  currentRequest = e;
  currentRequest.method = 'GET';
  
  try {
    // Extract and validate user authentication context
    const user = getUserContext();
    console.log('🔍 GET request user context:', user);
    
    // Security check: Ensure user is properly authenticated
    if (!user.userId) {
      console.log('❌ No userId found in GET request');
      return createErrorResponse("Unauthorized - User authentication required", 401);
    }

    console.log(`📥 Loading notes for user: ${user.userEmail}`);
    
    // Fetch user-specific notes from Google Sheets
    // This function filters notes by userId to ensure data isolation
    const userNotes = getUserNotes(user.userId);
    
    console.log(`✅ Returning ${userNotes.length} notes for user: ${user.userEmail}`);
    
    // Return notes as JSON response
    return ContentService.createTextOutput(JSON.stringify(userNotes))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('❌ Error in doGet:', error);
    return createErrorResponse(`Internal Server Error: ${error.toString()}`, 500);
  }
}

/**
 * Main POST handler - Process note CRUD operations with user verification
 * 
 * Expected POST Body:
 * {
 *   "action": "add|update|delete|test",
 *   "note": { note object with encrypted/plain fields },
 *   "X-User-ID": "user's unique ID",
 *   "X-User-Email": "user's email",
 *   "X-User-Name": "user's display name"
 * }
 * 
 * Supported Actions:
 * - add: Create new note with user context and encryption support
 * - update: Modify existing note (with ownership verification)
 * - delete: Remove note (with ownership verification)
 * - test: Connectivity and authentication test
 * 
 * Security Features:
 * - User context validation on every request
 * - Ownership verification for update/delete operations
 * - Encrypted data handling (JSON stringification)
 * - Error logging with user context
 * 
 * @param {Object} e - Google Apps Script event object with POST data
 * @returns {ContentService.TextOutput} JSON response with operation result
 */
function doPost(e) {
  // Store request globally for user context extraction
  currentRequest = e;
  currentRequest.method = 'POST';
  
  try {
    console.log('📨 POST request received');
    console.log('📄 POST data contents:', e.postData ? e.postData.contents : 'No postData');
    
    // Extract user authentication context from request body
    const user = getUserContext();
    console.log('🔍 POST request user context:', user);
    
    // Security check: Ensure user is properly authenticated
    if (!user.userId) {
      console.log('❌ No userId found in POST request');
      return createErrorResponse("Unauthorized - User authentication required", 401);
    }

    // Parse request body to extract action and note data
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    const note = data.note;
    
    console.log(`🔄 Processing ${action} action for user: ${user.userEmail}`);
    console.log('📝 Note data:', note);
    
    let result;
    
    // Route request to appropriate handler based on action
    switch (action) {
      case 'add':
        // Create new note with user context and encryption support
        result = addNote(note, user);
        break;
      case 'update':
        // Update existing note with ownership verification
        result = updateNote(note, user);
        break;
      case 'delete':
        // Delete note with ownership verification
        result = deleteNote(note, user);
        break;
      case 'test':
        // Test endpoint for connectivity and authentication
        result = { success: true, message: 'Test successful', user: user };
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    console.log(`✅ ${action} completed successfully for user: ${user.userEmail}`);
    
    // Return success response as JSON
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error(`❌ Error in doPost:`, error);
    return createErrorResponse(`Operation failed: ${error.toString()}`, 500);
  }
}

/**
 * Extract user authentication context from HTTP request
 * 
 * This function handles both GET and POST requests to extract user information
 * required for authentication and authorization. The user context is embedded
 * in different locations depending on the request method:
 * 
 * GET Requests: User context in query parameters
 * - X-User-ID, X-User-Email, X-User-Name as URL parameters
 * 
 * POST Requests: User context in JSON body
 * - X-User-ID, X-User-Email, X-User-Name as JSON properties
 * 
 * Security Note: This user context comes from the frontend JWT token
 * which has already been verified by the Node.js backend before reaching
 * this Apps Script endpoint.
 * 
 * @returns {Object} User context object with userEmail, userId, userName
 */
function getUserContext() {
  // Ensure we have a request to work with
  if (!currentRequest) {
    console.log('⚠️ No current request available');
    return { userEmail: '', userId: '', userName: '' };
  }
  
  let userEmail = '';
  let userId = '';
  let userName = '';
  
  // GET requests: Extract user context from query parameters
  if (currentRequest.method === 'GET' || !currentRequest.postData) {
    console.log('🔍 Reading user context from GET parameters');
    userEmail = currentRequest.parameter['X-User-Email'] || '';
    userId = currentRequest.parameter['X-User-ID'] || '';
    userName = currentRequest.parameter['X-User-Name'] || '';
  } 
  // POST requests: Extract user context from JSON request body
  else {
    console.log('🔍 Reading user context from POST body');
    try {
      const postData = JSON.parse(currentRequest.postData.contents || '{}');
      console.log('📄 Parsed POST data keys:', Object.keys(postData));
      
      // Extract user context fields from POST body
      userEmail = postData['X-User-Email'] || '';
      userId = postData['X-User-ID'] || '';
      userName = postData['X-User-Name'] || '';
      
      console.log('🔍 Extracted from POST:', { userEmail, userId, userName });
    } catch (error) {
      console.error('❌ Failed to parse POST data for user context:', error);
    }
  }
  
  console.log('👤 Final user context:', { userEmail, userId, userName });
  
  // Return standardized user context object
  return { 
    userEmail: userEmail, 
    userId: userId,
    userName: userName
  };
}

/**
 * Retrieve all notes belonging to a specific user from Google Sheets
 * 
 * This function implements user data isolation by filtering notes based on userId.
 * It also handles encrypted data parsing and provides backward compatibility
 * for legacy installations without user columns.
 * 
 * Data Processing:
 * 1. Reads all data from the Notes sheet
 * 2. Filters rows by userId to ensure data isolation
 * 3. Converts spreadsheet rows to note objects
 * 4. Parses encrypted fields (title, description, comments) from JSON strings
 * 5. Handles boolean and date field conversions
 * 
 * Security: Only returns notes that belong to the specified userId
 * 
 * @param {string} userId - Google user's unique identifier
 * @returns {Array<Object>} Array of note objects belonging to the user
 * @throws {Error} If Notes sheet is not found
 */
function getUserNotes(userId) {
  // Access the Notes sheet from the active spreadsheet
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notes');
  
  if (!sheet) {
    throw new Error('Notes sheet not found');
  }
  
  // Read all data from the sheet (including headers)
  const data = sheet.getDataRange().getValues();
  
  // Handle empty sheet case
  if (data.length <= 1) {
    console.log('📋 No notes found - empty sheet');
    return []; // No data or just headers
  }
  
  // Extract headers and find userId column for filtering
  const headers = data[0];
  const userIdIndex = headers.indexOf('userId');
  
  // Handle legacy data without userId column (backward compatibility)
  if (userIdIndex === -1) {
    console.warn('⚠️ userId column not found - this might be legacy data');
    console.warn('⚠️ Consider running migrateExistingNotes() to add user columns');
    
    // For backward compatibility, return all notes if no userId column exists
    // This should only happen during migration or in development
    const allNotes = [];
    for (let i = 1; i < data.length; i++) {
      const note = rowToNote(data[i], headers);
      allNotes.push(note);
    }
    return allNotes;
  }
  
  // Filter and process notes for the specific user
  const userNotes = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // Security check: Only include notes owned by this user
    if (row[userIdIndex] === userId) {
      // Convert spreadsheet row to note object (handles encryption parsing)
      const note = rowToNote(row, headers);
      userNotes.push(note);
    }
  }
  
  console.log(`📋 Found ${userNotes.length} notes for user: ${userId}`);
  return userNotes;
}

/**
 * Create a new note with user context and encryption support
 * 
 * This function handles the creation of new notes with proper user attribution,
 * encryption support, and due date functionality. It automatically adds user
 * context fields and ensures all required fields have appropriate defaults.
 * 
 * Encryption Handling:
 * - Encrypted fields (title, description, comments) are stored as JSON strings
 * - Plain text fields (tags, system, dates) stored directly for filtering
 * - Automatic detection of encrypted vs plain text data
 * 
 * User Context:
 * - Associates note with authenticated user
 * - Adds creation and modification timestamps
 * - Registers user in Users sheet if first time
 * 
 * @param {Object} note - Note data from frontend (may contain encrypted fields)
 * @param {Object} user - Authenticated user context (userId, userEmail, userName)
 * @returns {Object} Success response with operation status
 * @throws {Error} If Notes sheet is not found
 */
function addNote(note, user) {
  // Access the Notes sheet for data storage
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notes');
  
  if (!sheet) {
    throw new Error('Notes sheet not found');
  }
  
  // Add user context and metadata to note
  const now = new Date().toISOString();
  note.userId = user.userId;           // Owner identification
  note.userEmail = user.userEmail;     // For debugging and user management
  note.createdBy = user.userId;        // Original creator (for sharing support)
  note.lastModified = now;             // Track last modification time
  note.isShared = false;               // Default to private note
  
  // Ensure all required fields have appropriate defaults
  note.id = note.id || generateId();               // Unique identifier
  note.timestamp = note.timestamp || now;          // Creation timestamp
  note.title = note.title || 'New Note';           // Default title (may be encrypted)
  note.done = note.done || false;                  // Completion status
  note.priority = note.priority || 0;              // Default priority for sorting
  
  // Ensure due date fields have defaults (new functionality)
  // Default due date: tomorrow in PH timezone with no time component
  if (!note.dueDate) {
    // Get current date in PH timezone
    const phNow = new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Manila'}));
    phNow.setDate(phNow.getDate() + 1);
    // Set to start of day (midnight) to avoid time component
    phNow.setHours(0, 0, 0, 0);
    note.dueDate = phNow.toISOString();
  }
  note.isOverdue = note.isOverdue || false;        // Overdue status flag
  note.overdueCheckedAt = note.overdueCheckedAt || ''; // Last overdue check timestamp
  
  // Convert note object to spreadsheet row (handles encryption serialization)
  const row = noteToRow(note);
  
  // Add the new note to the sheet
  sheet.appendRow(row);
  
  // Register user in Users sheet if this is their first note
  registerUser(user);
  
  // ADDED: Debug logging for encrypted data handling
  console.log('🔍 Note title type:', typeof note.title);
  console.log('🔍 Note title value:', note.title);
  if (typeof note.title === 'object') {
    console.log('🔍 Note title JSON:', JSON.stringify(note.title));
  }
  
  // ADDED: Debug logging for due date fields
  console.log('📅 Due date fields debug:');
  console.log('📅 note.dueDate:', note.dueDate);
  console.log('📅 note.isOverdue:', note.isOverdue);
  console.log('📅 note.overdueCheckedAt:', note.overdueCheckedAt);
  
  // Log the successful operation
  const titleForLog = typeof note.title === 'object' ? '[Encrypted]' : note.title;
  console.log(`➕ Added note: ${titleForLog} for user: ${user.userEmail}`);
  
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
      
      // ADDED: Debug logging for due date fields in update
      console.log('📅 UPDATE - Due date fields debug:');
      console.log('📅 note.dueDate:', note.dueDate);
      console.log('📅 note.isOverdue:', note.isOverdue);
      console.log('📅 note.overdueCheckedAt:', note.overdueCheckedAt);
      
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
 * UPDATED: Added support for encrypted data and due date fields
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
    'isShared': 'isShared',
    // ADDED: New due date fields
    'dueDate': 'dueDate',
    'isOverdue': 'isOverdue',
    'overdueCheckedAt': 'overdueCheckedAt'
  };
  
  // Convert each field
  for (const [sheetField, noteField] of Object.entries(fieldMapping)) {
    const index = headers.indexOf(sheetField);
    if (index !== -1 && index < row.length) {
      let value = row[index];
      
      // ADDED: Handle encrypted fields - parse JSON strings back to objects
      if (sheetField === 'title' || sheetField === 'description' || sheetField === 'comments') {
        value = tryParseEncrypted(value);
      }
      // Convert boolean fields
      else if (sheetField === 'done' || sheetField === 'isShared' || sheetField === 'isOverdue') {
        value = value === true || value === 'TRUE' || value === 'true' || value === 1;
      }
      // Convert numeric fields
      else if (sheetField === 'priority') {
        value = parseInt(value) || 0;
      }
      // Convert date fields to ISO strings
      else if ((sheetField === 'timestamp' || sheetField === 'dateDone' || 
                sheetField === 'dateUndone' || sheetField === 'lastModified' ||
                sheetField === 'dueDate' || sheetField === 'overdueCheckedAt') && value instanceof Date) {
        value = value.toISOString();
      }
      
      note[noteField] = value || '';
    }
  }
  
  return note;
}

/**
 * ADDED: Parse encrypted data from JSON strings or malformed format
 */
function tryParseEncrypted(value) {
  console.log('🔍 tryParseEncrypted input:', typeof value, value);
  
  if (typeof value === 'string' && value.startsWith('{') && value.includes('encrypted')) {
    try {
      // First try normal JSON parsing
      const parsed = JSON.parse(value);
      console.log('✅ Standard JSON parsing succeeded:', parsed);
      return parsed;
    } catch (e) {
      console.warn('⚠️ Standard JSON parsing failed, trying to fix malformed format:', value);
      
      // Try to fix the malformed format {key=value} -> {"key":"value"}
      try {
        let fixedValue = value.trim();
        console.log('🔧 Starting fix process for:', fixedValue);
        
        // More comprehensive regex to handle the malformed format
        // Handle: {version=1.0, iv=abc123, encrypted=xyz789}
        fixedValue = fixedValue.replace(/\{([^}]+)\}/, function(match, content) {
          console.log('🔧 Processing content inside braces:', content);
          
          // Split by comma and process each key=value pair
          const pairs = content.split(',').map(function(pair) {
            const trimmedPair = pair.trim();
            const equalIndex = trimmedPair.indexOf('=');
            
            if (equalIndex === -1) {
              console.warn('⚠️ No equals sign in pair:', trimmedPair);
              return null;
            }
            
            const key = trimmedPair.substring(0, equalIndex).trim();
            const value = trimmedPair.substring(equalIndex + 1).trim();
            
            console.log('🔧 Processing key-value:', key, '=', value);
            
            // Check if value is a number
            if (key === 'version' && /^\d+(\.\d+)?$/.test(value)) {
              return `"${key}":${value}`;
            } else {
              return `"${key}":"${value}"`;
            }
          }).filter(function(pair) { return pair !== null; });
          
          const result = `{${pairs.join(',')}}`;
          console.log('🔧 Constructed JSON from content:', result);
          return result;
        });
        
        console.log('🔧 Final fixed format:', fixedValue);
        const parsed = JSON.parse(fixedValue);
        console.log('✅ Malformed parsing succeeded:', parsed);
        return parsed;
      } catch (e2) {
        console.error('❌ Failed to parse malformed encrypted data:', e2);
        console.error('❌ Original value:', value);
        console.error('❌ Attempted fixed value:', typeof fixedValue !== 'undefined' ? fixedValue : 'undefined');
        return value; // Return original if all parsing fails
      }
    }
  }
  
  console.log('📤 Returning value as-is:', value);
  return value;
}

/**
 * Convert note object to spreadsheet row
 * UPDATED: Added support for encrypted data and due date fields
 */
function noteToRow(note) {
  // ADDED: Debug logging for due date fields
  console.log('🔍 noteToRow - Input note due date fields:');
  console.log('   - note.dueDate:', note.dueDate);
  console.log('   - note.isOverdue:', note.isOverdue);
  console.log('   - note.overdueCheckedAt:', note.overdueCheckedAt);
  
  const row = [
    note.id || '',
    note.timestamp || '',
    // UPDATED: Handle encrypted fields - convert objects to JSON strings properly
    typeof note.title === 'object' && note.title !== null ? JSON.stringify(note.title) : (note.title || ''),
    typeof note.description === 'object' && note.description !== null ? JSON.stringify(note.description) : (note.description || ''),
    note.tags || '',
    typeof note.comments === 'object' && note.comments !== null ? JSON.stringify(note.comments) : (note.comments || ''),
    note.system || '',
    note.done || false,
    note.dateDone || '',
    note.dateUndone || '',
    note.priority || 0,
    note.userId || '',
    note.userEmail || '',
    note.createdBy || '',
    note.lastModified || '',
    note.isShared || false,
    // ADDED: New due date fields
    note.dueDate || '',
    note.isOverdue || false,
    note.overdueCheckedAt || ''
  ];
  
  // ADDED: Debug logging for output row due date fields
  console.log('🔍 noteToRow - Output row due date fields:');
  console.log('   - row[15] (should be dueDate):', row[15]);
  console.log('   - row[16] (should be isOverdue):', row[16]);
  console.log('   - row[17] (should be overdueCheckedAt):', row[17]);
  
  return row;
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
  const newHeaders = ['userId', 'userEmail', 'createdBy', 'lastModified', 'isShared', 'dueDate', 'isOverdue', 'overdueCheckedAt'];
  
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
    // ADDED: Default values for new due date fields
    sheet.getRange(i, startCol + 5).setValue('');               // dueDate
    sheet.getRange(i, startCol + 6).setValue(false);            // isOverdue
    sheet.getRange(i, startCol + 7).setValue('');               // overdueCheckedAt
  }
  
  console.log(`✅ Migration completed - updated ${data.length - 1} existing notes`);
}

/**
 * Test function to diagnose due date column issues
 */
function testDueDateColumns() {
  console.log('🧪 Testing due date columns...');
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notes');
  if (!sheet) {
    console.error('❌ Notes sheet not found');
    return;
  }
  
  // Get headers to verify column structure
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  console.log('📋 Current headers:', headers);
  console.log('📋 Header count:', headers.length);
  
  // Find due date columns
  const dueDateIndex = headers.indexOf('dueDate');
  const isOverdueIndex = headers.indexOf('isOverdue');
  const overdueCheckedAtIndex = headers.indexOf('overdueCheckedAt');
  
  console.log('📅 dueDate column index:', dueDateIndex, '(should be', headers.length >= 17 ? 16 : 'missing', ')');
  console.log('📅 isOverdue column index:', isOverdueIndex, '(should be', headers.length >= 18 ? 17 : 'missing', ')');
  console.log('📅 overdueCheckedAt column index:', overdueCheckedAtIndex, '(should be', headers.length >= 19 ? 18 : 'missing', ')');
  
  // Test writing to due date columns
  try {
    const testRow = [
      'test-due-date-' + Date.now(), // A - id
      new Date().toISOString(), // B - timestamp
      'Test Due Date Note', // C - title
      'Testing due date functionality', // D - description
      'test,debugging', // E - tags
      'Test comments for due date', // F - comments
      'TestSystem', // G - system
      false, // H - done
      '', // I - dateDone
      '', // J - dateUndone
      999, // K - priority
      'test-user-id', // L - userId
      'test@email.com', // M - userEmail
      'test-user', // N - createdBy
      new Date().toISOString(), // O - lastModified
      false, // P - isShared
      '2025-07-30T00:00:00.000Z', // Q - dueDate
      true, // R - isOverdue  
      new Date().toISOString() // S - overdueCheckedAt
    ];
    
    console.log('📝 Test row data:', testRow);
    console.log('📝 Test row length:', testRow.length);
    console.log('📝 Expected due date values:');
    console.log('   - dueDate (Q/16):', testRow[16]);
    console.log('   - isOverdue (R/17):', testRow[17]);
    console.log('   - overdueCheckedAt (S/18):', testRow[18]);
    
    sheet.appendRow(testRow);
    console.log('✅ Test row added successfully');
    
    // Verify the data was written correctly
    const lastRow = sheet.getLastRow();
    const writtenData = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    console.log('📖 Data written to sheet:', writtenData);
    console.log('📖 Due date values written:');
    console.log('   - dueDate (Q):', writtenData[16]);
    console.log('   - isOverdue (R):', writtenData[17]);
    console.log('   - overdueCheckedAt (S):', writtenData[18]);
    
  } catch (error) {
    console.error('❌ Error writing test row:', error);
  }
}

/**
 * Test noteToRow function specifically
 */
function testNoteToRowFunction() {
  console.log('🧪 Testing noteToRow function...');
  
  const testNote = {
    id: 'test-note-123',
    timestamp: '2025-07-29T15:00:00.000Z',
    title: 'Test Note Title',
    description: 'Test description',
    tags: 'test,debugging',
    comments: 'Test comments',
    system: 'TestSystem',
    done: false,
    dateDone: '',
    dateUndone: '',
    priority: 1,
    userId: 'test-user-123',
    userEmail: 'test@example.com',
    createdBy: 'test-user',
    lastModified: '2025-07-29T15:00:00.000Z',
    isShared: false,
    dueDate: '2025-07-30T00:00:00.000Z',
    isOverdue: true,
    overdueCheckedAt: '2025-07-29T15:00:00.000Z'
  };
  
  console.log('📝 Input note object:', testNote);
  
  const row = noteToRow(testNote);
  console.log('📝 noteToRow output:', row);
  console.log('📝 Row length:', row.length);
  console.log('📝 Due date values in row:');
  console.log('   - dueDate (index 15):', row[15]);
  console.log('   - isOverdue (index 16):', row[16]);
  console.log('   - overdueCheckedAt (index 17):', row[17]);
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

/**
 * Debug due date saving specifically
 */
function debugDueDateSaving() {
  console.log('🔍 DEBUGGING DUE DATE SAVING...');
  
  // Test user context
  const mockRequest = {
    method: 'POST',
    postData: {
      contents: JSON.stringify({
        'X-User-ID': 'test-user-123',
        'X-User-Email': 'test@example.com',
        'X-User-Name': 'Test User',
        action: 'add',
        note: { 
          id: 'debug-due-date-' + Date.now(),
          title: 'Debug Due Date Note',
          description: 'Testing due date functionality',
          tags: 'debug,due-date',
          comments: 'Debug comments',
          system: 'DebugSystem',
          done: false,
          priority: 1,
          dueDate: '2025-07-30T00:00:00.000Z',
          isOverdue: false,
          overdueCheckedAt: '2025-07-29T15:00:00.000Z'
        }
      })
    }
  };
  
  currentRequest = mockRequest;
  const user = getUserContext();
  console.log('👤 Debug User context:', user);
  
  // Parse the request data
  const data = JSON.parse(currentRequest.postData.contents);
  const note = data.note;
  
  console.log('📝 Debug note object:', note);
  console.log('📅 Due date fields before processing:');
  console.log('   - dueDate:', note.dueDate);
  console.log('   - isOverdue:', note.isOverdue);
  console.log('   - overdueCheckedAt:', note.overdueCheckedAt);
  
  // Test noteToRow conversion
  console.log('🔄 Testing noteToRow conversion...');
  const row = noteToRow(note);
  console.log('📊 Converted row:', row);
  console.log('📊 Row length:', row.length);
  console.log('📅 Due date fields in row:');
  console.log('   - dueDate (index 15):', row[15]);
  console.log('   - isOverdue (index 16):', row[16]);
  console.log('   - overdueCheckedAt (index 17):', row[17]);
  
  // Try adding the note
  try {
    console.log('➕ Attempting to add debug note...');
    const result = addNote(note, user);
    console.log('✅ addNote result:', result);
  } catch (error) {
    console.error('❌ addNote failed:', error);
  }
  
  console.log('🔍 Debug completed');
}

/**
 * Check current sheet structure and headers
 */
function checkSheetStructure() {
  console.log('📋 CHECKING SHEET STRUCTURE...');
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notes');
  
  if (!sheet) {
    console.error('❌ Notes sheet not found');
    return;
  }
  
  // Get current headers
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  
  console.log('📋 Current sheet headers:', headers);
  console.log('📋 Total columns:', headers.length);
  
  // Check for due date columns specifically
  const dueDateCols = ['dueDate', 'isOverdue', 'overdueCheckedAt'];
  dueDateCols.forEach((col, index) => {
    const colIndex = headers.indexOf(col);
    console.log(`📅 ${col} column: ${colIndex >= 0 ? `found at index ${colIndex}` : 'NOT FOUND'}`);
  });
  
  // Check if we have any data
  const lastRow = sheet.getLastRow();
  console.log('📊 Total rows (including header):', lastRow);
  
  if (lastRow > 1) {
    console.log('📄 Sample data from row 2:');
    const sampleRow = sheet.getRange(2, 1, 1, lastColumn).getValues()[0];
    console.log('   Data:', sampleRow);
    
    // Show due date fields specifically if they exist
    const dueDateIndex = headers.indexOf('dueDate');
    const isOverdueIndex = headers.indexOf('isOverdue');
    const overdueCheckedAtIndex = headers.indexOf('overdueCheckedAt');
    
    if (dueDateIndex >= 0) {
      console.log(`📅 Sample dueDate value: ${sampleRow[dueDateIndex]}`);
    }
    if (isOverdueIndex >= 0) {
      console.log(`📅 Sample isOverdue value: ${sampleRow[isOverdueIndex]}`);
    }
    if (overdueCheckedAtIndex >= 0) {
      console.log(`📅 Sample overdueCheckedAt value: ${sampleRow[overdueCheckedAtIndex]}`);
    }
  }
  
  console.log('📋 Sheet structure check completed');
}