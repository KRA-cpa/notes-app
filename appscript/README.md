# Notes App - Google Apps Script Backend

This Google Apps Script handles the backend functionality for the Notes App, including user authentication, note CRUD operations, and data encryption support.

## Features

- **Multi-user support** with Google authentication
- **Encrypted data handling** for sensitive note content
- **Due date functionality** with overdue tracking
- **User isolation** - users can only see their own notes
- **Automatic user registration**

## Setup Instructions

### 1. Create Google Apps Script Project
1. Go to [script.google.com](https://script.google.com)
2. Click "New project"
3. Replace the default code with the contents of `Code.js`
4. Save the project with a meaningful name (e.g., "Notes App Backend")

### 2. Create Google Sheets Database
1. Create a new Google Sheets spreadsheet
2. Create a sheet named "Notes" with these columns (in order):
   ```
   A: id
   B: timestamp
   C: title
   D: description
   E: tags
   F: comments
   G: system
   H: done
   I: dateDone
   J: dateUndone
   K: priority
   L: userId
   M: userEmail
   N: createdBy
   O: lastModified
   P: isShared
   Q: dueDate
   R: isOverdue
   S: overdueCheckedAt
   ```

### 3. Link Spreadsheet to Script
1. In the Apps Script editor, note the script ID from the URL
2. In your spreadsheet, go to Extensions > Apps Script
3. This should open the bound script - replace with your code
4. OR manually link: In script editor, add the spreadsheet ID in your code

### 4. Deploy as Web App
1. In Apps Script editor, click "Deploy" > "New deployment"
2. Choose type "Web app"
3. Set execute as "Me"
4. Set access to "Anyone" (for API access)
5. Click "Deploy"
6. Copy the web app URL - this is your `APPS_SCRIPT_URL`

### 5. Configure Environment Variables
Add the web app URL to your environment variables:
```
APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

### 6. Migration (If Updating Existing Installation)
If you have existing notes without the new columns, run the migration:
1. In Apps Script, open the script editor
2. Select the `migrateExistingNotes` function
3. Click the "Run" button
4. Grant necessary permissions

## Data Structure

### Encrypted Fields
The following fields are stored as encrypted JSON objects:
- `title`: `{"encrypted": "...", "iv": "...", "version": 1}`
- `description`: `{"encrypted": "...", "iv": "...", "version": 1}`
- `comments`: `{"encrypted": "...", "iv": "...", "version": 1}`

### Plain Text Fields
These remain unencrypted for filtering/searching:
- `tags`, `system`, `dueDate`, `priority`, `done`

### New Due Date Fields
- `dueDate`: ISO timestamp in UTC
- `isOverdue`: Boolean flag
- `overdueCheckedAt`: Last overdue check timestamp

## API Endpoints

### GET - Load Notes
```
GET https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
Query params: X-User-ID, X-User-Email, X-User-Name
Returns: Array of user's notes
```

### POST - Note Operations
```
POST https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
Body: {
  "action": "add|update|delete",
  "note": {...},
  "X-User-ID": "...",
  "X-User-Email": "...",
  "X-User-Name": "..."
}
```

## Security Notes

- Each user can only access their own notes
- Sensitive data is encrypted client-side before storage
- User authentication handled by frontend JWT tokens
- No plain text sensitive data stored in sheets

## Troubleshooting

1. **Permission Issues**: Ensure the script has access to Google Sheets
2. **CORS Errors**: Web app access must be set to "Anyone"
3. **Migration Issues**: Run `migrateExistingNotes()` manually if needed
4. **Encrypted Data Issues**: Check `tryParseEncrypted()` function logs

## Logging

Check Apps Script logs in the editor for debugging:
- User context extraction
- Note operations
- Encryption handling
- Error messages