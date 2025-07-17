// The main application object, encapsulating all logic and state.
const App = {
    // --- DOM Element References ---
    // Get references to key HTML elements by their IDs.
    notesContainer: document.getElementById('notes-container'), // Container for active notes.
    doneNotesContainer: document.getElementById('done-notes-container'), // Container for completed notes.
    completedSection: document.getElementById('completed-section'), // The entire section for completed notes.
    noteTemplate: document.getElementById('note-template'), // HTML template for a single note card.
    addNoteButton: document.getElementById('add-note-button'), // Button to add a new note.
    fileInput: document.getElementById('file-input'), // XML file input (functionally unused now).
    saveButton: document.getElementById('save-button'), // XML save button (functionally unused now).
    statusMessage: document.getElementById('status-message'), // Element to display status messages to the user.
    tagSearchInput: document.getElementById('tag-search-input'), // Input field for tag search.
    searchTagsButton: document.getElementById('search-tags-button'), // Button to initiate tag search.
    clearSearchButton: document.getElementById('clear-search-button'), // Button to clear search.
    systemSuggestionsDatalist: document.getElementById('system-suggestions'), // Datalist for system input suggestions.

    // --- Backend API Configuration ---
    // !!! IMPORTANT: Replace this with the Web App URL obtained after deploying your Google Apps Script.
    APPS_SCRIPT_WEB_APP_URL: 'https://script.google.com/a/macros/megaworldcorp.com/s/AKfycbwxkq9IJH2BvjXmNh6IpESlvCUcX0gTs4u-0FmDVgjPt5kCfnywtwWRq9nfVoboKzpIeg/exec', 

    // --- Application Data Store ---
    // 'notes' array holds all note objects fetched from the backend,
    // and its order directly dictates the persistent order stored in the backend.
    notes: [], 
    // 'uniqueSystems' set stores all unique system values encountered, used for datalist suggestions.
    uniqueSystems: new Set(), 
    
    // --- Obsolete Variables from Local XML Functionality ---
    fileSaveCounter: 0, // Not relevant for cloud saving.
    hasUnsavedChanges: false, // Less critical as changes are saved instantly to cloud.
    lastLoadedFileName: null, // Not relevant for cloud loading.

    // --- Initialization Method ---
    // Called when the application starts.
    init() {
        this.addEventListeners(); // Set up all event listeners.
        this.updateStatus('Loading notes from cloud...'); // Initial status message.
        this.loadNotesFromCloud(); // Load notes from the Google Sheet backend.
    },

    // --- Event Listener Setup ---
    // Attaches all necessary event listeners to DOM elements.
    addEventListeners() {
        console.log("App event listeners initialized.");
        // Add note button click handler.
        this.addNoteButton.addEventListener('click', () => this.addNewNote());
        
        // XML related listeners are commented out as they are no longer used.
        // this.saveButton.addEventListener('click', () => this.saveToXML());
        // this.fileInput.addEventListener('change', (e) => { this.loadFromXML(e); });

        // Tag search button and input event handlers.
        this.searchTagsButton.addEventListener('click', () => this.searchTags());
        this.clearSearchButton.addEventListener('click', () => this.clearSearch());
        this.tagSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchTagsButton.click(); // Trigger search when Enter is pressed in the search box.
            }
        });

        // Event delegation for actions within note cards (e.g., toggle, move, delete).
        // Uses 'document.body' to listen for events from dynamically created note cards.
        document.body.addEventListener('click', async (e) => {
            // Find the closest parent element that is a '.note-card'.
            const noteCard = e.target.closest('.note-card');
            if (!noteCard) return; // If click wasn't inside a note card, do nothing.

            const noteId = noteCard.dataset.id; // Get the unique ID of the note.
            // Find the note object in the local 'notes' array based on its ID.
            const noteIndex = this.notes.findIndex(n => n.id === noteId);
            const note = this.notes[noteIndex];
            if (!note) return; // If note not found, something is wrong, exit.

            // Handle 'Toggle Completion' button click.
            if (e.target.closest('.note-done-toggle')) {
                const newDoneStatus = !note.done; // Determine the new 'done' status.
                const now = new Date().toISOString(); // Get current timestamp in ISO format.

                if (newDoneStatus) {
                    // If marking as DONE:
                    note.done = true;
                    note.dateDone = now; // Record completion date.
                    note.dateUndone = ''; // Clear undone date.
                } else {
                    // If marking as UNDONE:
                    note.done = false;
                    note.dateUndone = now; // Record undone date.
                    note.dateDone = ''; // Clear done date.
                    
                    // NEW LOGIC: When a note is undone, move it to the top of the active notes in the UI.
                    this.notes.splice(noteIndex, 1); // Remove from its current position in local array.
                    this.notes.unshift(note);       // Add it to the very beginning of the local array.
                    this.updateStatus(`Note "${note.title}" marked as active and moved to top.`, 'info');
                }

                // Send the updated note (with new done status and dates) to the cloud.
                await this.updateNoteInCloud(note);
                
                // Re-render the UI immediately for visual feedback.
                this.render();

                // If the note was just undone, trigger a re-prioritization to persist its new top position.
                if (!newDoneStatus) {
                    await this.reassignAndSavePriorities();
                }
                return; // Exit function after handling toggle.
            }

            // Handle 'Delete Note' button click.
            if (e.target.closest('.note-delete')) {
                this.deleteNote(note.id, note.title); // Call delete function.
            }
            // Handle 'Expand/Collapse' button click.
            if (e.target.closest('.note-toggle')) this.toggleNoteBody(noteCard);
            
            // Handle 'Move Up' / 'Move Down' buttons.
            if (e.target.closest('.note-up')) { await this.moveNote(noteIndex, -1); } // -1 for up.
            if (e.target.closest('.note-down')) { await this.moveNote(noteIndex, 1); } // 1 for down.
        });
        
        // Handle input events for editable fields (title, description, tags, comments, system).
        document.body.addEventListener('input', async (e) => {
             const noteCard = e.target.closest('.note-card');
             if (!noteCard) return;
             
             const noteId = noteCard.dataset.id;
             // Find the note object that corresponds to the edited card.
             const note = this.notes.find(n => n.id === noteId);

             if (!note) return;

             // Update the local note object property based on which field was edited.
             if (e.target.classList.contains('note-title')) note.title = e.target.textContent;
             if (e.target.classList.contains('note-description')) note.description = e.target.textContent;
             if (e.target.classList.contains('note-tags')) note.tags = e.target.textContent;
             if (e.target.classList.contains('note-comments')) note.comments = e.target.value;
             if (e.target.classList.contains('note-system')) {
                note.system = e.target.value;
                this.addUniqueSystem(note.system); // Add new system values to the suggestions list.
             }
             
             // Send the updated note to the cloud.
             await this.updateNoteInCloud(note);
             this.updateStatus('Note updated in cloud.', 'info');
        });
    },

    // --- API Communication Functions ---

    /**
     * Fetches all notes from the Google Apps Script Web App (backend).
     * @returns {Array} An array of note objects.
     */
    async fetchDataFromCloud() {
        try {
            // Make a GET request to the Apps Script URL.
            const response = await fetch(this.APPS_SCRIPT_WEB_APP_URL, {
                method: 'GET',
                mode: 'cors' // 'cors' is essential for cross-origin requests from your GCS hosted app to Apps Script.
            });
            if (!response.ok) { // Check if the HTTP response was successful (status 200-299).
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json(); // Parse the JSON response.
            return data; // Return the array of notes.
        } catch (error) {
            console.error('Error fetching data:', error);
            this.updateStatus('Failed to load notes. Check console for details.', 'error');
            return []; // Return an empty array on error to prevent breaking the app.
        }
    },

    /**
     * Sends data to the Google Apps Script Web App (backend) to add, update, or delete a note.
     * @param {string} action - The action to perform ('add', 'update', 'delete').
     * @param {Object} noteData - The note object or partial object with data for the action.
     * @returns {Object} A success/failure object from the backend.
     */
    async sendDataToCloud(action, noteData) {
        try {
            // Make a POST request to the Apps Script URL.
            const response = await fetch(this.APPS_SCRIPT_WEB_APP_URL, {
                method: 'POST',
                mode: 'cors',
                // Apps Script often expects 'text/plain' for raw JSON in postData.contents.
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
                body: JSON.stringify({ action: action, note: noteData }) // Send action and note data as JSON string.
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json(); // Parse backend's JSON response.
            if (!result.success) { // Check if the backend reported success.
                throw new Error(`API Error: ${result.message}`);
            }
            return result; // Return the backend's result.
        } catch (error) {
            console.error(`Error performing ${action} action:`, error);
            this.updateStatus(`Failed to ${action} note. Check console for details.`, 'error');
            return { success: false, message: error.message }; // Return error result.
        }
    },

    // --- System Suggestions Logic ---

    /**
     * Adds a system value to the set of unique systems if it's new.
     * Triggers re-population of the system datalist.
     * @param {string} systemValue - The system string to add.
     */
    addUniqueSystem(systemValue) {
        systemValue = systemValue.trim(); // Trim whitespace from the system value.
        if (systemValue && !this.uniqueSystems.has(systemValue)) { // Check if not empty and not already in set.
            this.uniqueSystems.add(systemValue); // Add to the set.
            this.populateSystemDatalist(); // Update the datalist immediately.
        }
    },

    /**
     * Populates the HTML <datalist> with unique system suggestions.
     */
    populateSystemDatalist() {
        this.systemSuggestionsDatalist.innerHTML = ''; // Clear existing options.
        // Convert set to array, sort alphabetically, and create <option> elements.
        Array.from(this.uniqueSystems).sort().forEach(system => {
            const option = document.createElement('option');
            option.value = system; // The value that will appear in the input and datalist.
            this.systemSuggestionsDatalist.appendChild(option);
        });
    },

    // --- Core Application Logic ---

    /**
     * Loads all notes from the cloud backend, sorts them, and updates the UI.
     */
    async loadNotesFromCloud() {
        this.updateStatus('Loading notes from cloud...');
        const fetchedNotes = await this.fetchDataFromCloud(); // Fetch notes from Apps Script.
        
        // Sort the entire 'this.notes' array based on a complex sorting logic.
        // This array's order dictates the persistent order in the backend (via reassignAndSavePriorities).
        this.notes = fetchedNotes.sort((a, b) => {
            // Primary sort criterion: Active notes always appear before done notes.
            if (!a.done && b.done) return -1; // Active note 'a' comes before done note 'b'.
            if (a.done && !b.done) return 1;  // Done note 'a' comes after active note 'b'.

            // If both notes are active: Sort by 'priority' (lower number = higher priority).
            if (!a.done && !b.done) {
                // Handle cases where priority might be missing or empty (treat as very low priority).
                const priorityA = a.priority !== undefined && a.priority !== '' ? Number(a.priority) : Infinity;
                const priorityB = b.priority !== undefined && b.priority !== '' ? Number(b.priority) : Infinity;
                if (priorityA !== priorityB) {
                    return priorityA - priorityB; // Sort ascending by priority number.
                }
                // Tie-breaker for active notes: Sort by 'timestamp' (oldest notes first).
                return new Date(a.timestamp) - new Date(b.timestamp); 
            }

            // If both notes are done: Sort by 'dateDone' (most recent done date first).
            if (a.done && b.done) {
                 // Use epoch (Jan 1, 1970) for notes without a dateDone to push them to bottom if they exist.
                 const dateA = a.dateDone ? new Date(a.dateDone) : new Date(0);
                 const dateB = b.dateDone ? new Date(b.dateDone) : new Date(0);
                 return dateB.getTime() - dateA.getTime(); // Sort descending by dateDone.
            }
            return 0; // Default return if no specific sort logic applies (should not be reached).
        });
        
        // After notes are loaded and sorted, update the unique systems for suggestions.
        this.uniqueSystems.clear(); // Clear previous systems before re-populating.
        this.notes.forEach(note => {
            if (note.system) {
                this.addUniqueSystem(note.system);
            }
        });
        this.populateSystemDatalist(); // Re-populate the datalist.

        this.render(); // Render the notes to the UI.
        this.updateStatus(`Successfully loaded ${this.notes.length} notes from cloud.`, 'success');
    },

    /**
     * Renders the notes from the 'this.notes' array to the DOM.
     * It separates active and done notes and applies specific sorting to done notes.
     */
    render() {
        // 'notesToDisplay' initially holds the 'this.notes' array, which is already sorted by loadNotesFromCloud.
        let notesToDisplay = this.notes; 

        // Apply tag search filter if a search query is active.
        if (this.currentSearchQuery) {
            const searchTags = this.currentSearchQuery.toLowerCase().split(',').map(tag => tag.trim()).filter(tag => tag);
            notesToDisplay = this.notes.filter(note => {
                const noteTags = (note.tags || '').toLowerCase().split(',').map(tag => tag.trim());
                return searchTags.some(searchTag => noteTags.includes(searchTag));
            });
        }

        // Clear existing notes in both containers before re-rendering.
        this.notesContainer.innerHTML = '';
        this.doneNotesContainer.innerHTML = '';

        // Filter out active notes. They are already sorted correctly within 'notesToDisplay' from loadNotesFromCloud.
        const activeNotes = notesToDisplay.filter(n => !n.done);

        // Filter out done notes. These will be re-sorted specifically for the done section.
        const doneNotes = notesToDisplay.filter(n => n.done);
        // Sort done notes by 'dateDone' in descending order (most recent completed at the top).
        doneNotes.sort((a, b) => {
            const dateA = a.dateDone ? new Date(a.dateDone) : new Date(0);
            const dateB = b.dateDone ? new Date(b.dateDone) : new Date(0);
            return dateB.getTime() - dateA.getTime(); 
        });
        
        // Append notes to their respective containers.
        activeNotes.forEach(note => this.notesContainer.appendChild(this.createNoteCard(note)));
        doneNotes.forEach(note => this.doneNotesContainer.appendChild(this.createNoteCard(note)));

        // Toggle visibility of the 'Completed Notes' section.
        this.completedSection.classList.toggle('hidden', doneNotes.length === 0 && activeNotes.length === 0 && this.currentSearchQuery === '');

        // Update the status message based on the displayed notes.
        if (this.notes.length === 0 && !this.currentSearchQuery) {
            this.updateStatus('No notes to display. Add one or open a file.');
        } else if (this.currentSearchQuery) {
            this.updateStatus(`Displaying ${activeNotes.length} active and ${doneNotes.length} completed notes matching tags: "${this.currentSearchQuery}".`);
        } else {
            this.updateStatus(`Displaying ${activeNotes.length} active and ${doneNotes.length} completed notes.`);
        }
    },
    
    /**
     * Creates a new HTML note card element from the template for a given note object.
     * @param {Object} note - The note object to display.
     * @returns {HTMLElement} The created note card div element.
     */
    createNoteCard(note) {
        const card = this.noteTemplate.content.cloneNode(true).firstElementChild;
        card.dataset.id = note.id; // Store the note's ID on the card for easy lookup.
        
        // Populate contenteditable fields and textarea with note data.
        card.querySelector('.note-title').textContent = note.title;
        card.querySelector('.note-description').textContent = note.description;
        card.querySelector('.note-tags').textContent = note.tags;
        card.querySelector('.note-comments').value = note.comments;
        
        // Set the value for the 'System' input field.
        const systemInput = card.querySelector('.note-system');
        if (systemInput) {
            systemInput.value = note.system || ''; // Use empty string if system is null/undefined.
        }

        // Adjust the 'done' toggle button's color and add 'is-done' class to card if note is done.
        const doneToggleButton = card.querySelector('.note-done-toggle');
        // Remove all status-related classes first to ensure correct state.
        doneToggleButton.classList.remove('bg-green-500', 'hover:bg-green-600', 'focus:ring-green-500', 'bg-yellow-500', 'hover:bg-yellow-600', 'focus:ring-yellow-500', 'bg-red-500', 'hover:bg-red-600', 'focus:ring-red-500');

        if (note.done) {
            card.classList.add('is-done'); // Apply strikethrough/gray-out styles.
            doneToggleButton.classList.add('bg-green-500', 'hover:bg-green-600', 'focus:ring-green-500'); // Green for done.
        } else {
            card.classList.remove('is-done');
            doneToggleButton.classList.add('bg-yellow-500', 'hover:bg-yellow-600', 'focus:ring-yellow-500'); // Yellow for active.
        }
        
        return card;
    },
    
    /**
     * Creates and adds a new note to the application and backend.
     */
    async addNewNote() {
        const newNote = {
            id: crypto.randomUUID(), // Generate a unique ID for the new note.
            timestamp: new Date().toISOString(), // Record creation timestamp.
            title: 'New Note',
            description: 'Add your description here.',
            tags: 'new',
            comments: '',
            system: '',
            dateDone: '',   // Initialize dateDone.
            dateUndone: '', // Initialize dateUndone.
            priority: 0,    // Initial priority (will be re-indexed by reassignAndSavePriorities).
            done: false
        };
        // Add the new note to the beginning of the local 'this.notes' array for immediate visual feedback.
        this.notes.unshift(newNote); 
        this.render(); // Render the UI instantly with the new note.

        // Then, reassign all priorities based on the new local order and save to the cloud.
        await this.reassignAndSavePriorities();
        this.updateStatus('Added a new note to cloud and updated order.', 'success');
        // Add the new note's system to suggestions if it's unique.
        this.addUniqueSystem(newNote.system); 
    },

    /**
     * Updates a given note in the cloud backend.
     * @param {Object} note - The note object with updated properties.
     */
    async updateNoteInCloud(note) {
        const result = await this.sendDataToCloud('update', note);
        // Optional: Add error handling here if result.success is false, for granular feedback.
    },

    /**
     * Deletes a note from the application and backend after user confirmation.
     * @param {string} noteId - The ID of the note to delete.
     * @param {string} noteTitle - The title of the note for confirmation message.
     */
    async deleteNote(noteId, noteTitle) {
        this.showConfirmationModal(`Are you sure you want to delete note "${noteTitle}"?`, async () => {
            const result = await this.sendDataToCloud('delete', { id: noteId });
            if (result.success) {
                // Remove the note from the local 'this.notes' array.
                this.notes = this.notes.filter(note => note.id !== noteId);
                this.updateStatus(`Note "${noteTitle}" deleted from cloud.`, 'warn');
                this.render(); // Re-render the UI immediately.

                // Re-index remaining notes to maintain a clean priority sequence in the backend.
                await this.reassignAndSavePriorities();
            }
        });
    },

    /**
     * Moves a note up or down in the local 'this.notes' array and then triggers a re-prioritization to persist the new order.
     * @param {number} index - The current index of the note in the 'this.notes' array.
     * @param {number} direction - -1 to move up, 1 to move down.
     */
    async moveNote(index, direction) {
        // Prevent manual reordering of completed notes, as they are sorted by completion date.
        if (this.notes[index].done) {
            this.updateStatus('Cannot manually reorder completed notes; they are sorted by completion date.', 'info');
            return;
        }

        // Perform the move operation within the local 'this.notes' array.
        if (direction === -1 && index > 0) { // Move Up
            const [movedNote] = this.notes.splice(index, 1); // Remove note from current position.
            this.notes.splice(index - 1, 0, movedNote); // Insert it one position up.
        } else if (direction === 1 && index < this.notes.length - 1) { // Move Down
            const [movedNote] = this.notes.splice(index, 1); // Remove note from current position.
            this.notes.splice(index + 1, 0, movedNote); // Insert it one position down.
        } else {
            // If no actual move occurred (e.g., trying to move top note up), return.
            return; 
        }

        // Re-render the UI immediately to show the visual change.
        this.render();
        this.updateStatus('Note moved visually. Saving new order...', 'info');

        // Reassign and save all priorities based on the new local order to persist the change.
        await this.reassignAndSavePriorities();
        this.updateStatus('Note order saved to cloud.', 'success');
    },

    /**
     * Reassigns unique, sequential priority numbers to all active notes based on their current order in 'this.notes'.
     * Sends updates to the backend for any notes whose priority has changed.
     * This function ensures that the UI's order is the source of truth for backend priority.
     */
    async reassignAndSavePriorities() {
        const updates = []; // Array to collect promises of update operations.
        const PRIORITY_STEP = 1000; // Step size for sequential priorities (e.g., 0, 1000, 2000...).

        // Step 1: Ensure 'this.notes' is sorted in the desired canonical order before re-assigning priorities.
        // This is crucial because 'moveNote' and 'addNewNote' make local array changes.
        // The overall sorting for 'this.notes' array prioritizes active notes by priority, then done notes by dateDone.
        this.notes.sort((a, b) => {
            // Primary sort: Active notes before done notes.
            if (!a.done && b.done) return -1;
            if (a.done && !b.done) return 1;

            // If both notes are active: Sort by priority (lowest number first).
            if (!a.done && !b.done) {
                // Handle cases where priority might be missing or empty.
                const priorityA = a.priority !== undefined && a.priority !== '' ? Number(a.priority) : Infinity;
                const priorityB = b.priority !== undefined && b.priority !== '' ? Number(b.priority) : Infinity;
                if (priorityA !== priorityB) {
                    return priorityA - priorityB; // Sort ascending by priority.
                }
                // Tie-breaker for active notes (if priorities are equal): oldest timestamp first.
                return new Date(a.timestamp) - new Date(b.timestamp);
            }

            // If both notes are done: Sort by dateDone (most recent first).
            if (a.done && b.done) {
                 const dateA = a.dateDone ? new Date(a.dateDone) : new Date(0);
                 const dateB = b.dateDone ? new Date(b.dateDone) : new Date(0);
                 return dateB.getTime() - dateA.getTime(); // Sort descending by dateDone.
            }
            return 0; // Should not be reached under normal conditions.
        });

        // Step 2: Assign new priorities ONLY to active notes based on their sorted order.
        // 'Done' notes retain their existing priority value (it's not used for their display sort).
        let activeNoteCounter = 0; // Counter to generate sequential priorities for active notes.
        for (let i = 0; i < this.notes.length; i++) {
            const note = this.notes[i];
            if (!note.done) { // Only assign priority for notes that are currently active.
                const newPriority = activeNoteCounter * PRIORITY_STEP;
                // Only send an update if the note's priority has actually changed to avoid unnecessary writes.
                if (Number(note.priority) !== newPriority) {
                    note.priority = newPriority; // Update the priority in the local note object.
                    updates.push(this.updateNoteInCloud(note)); // Add the update promise to the collection.
                }
                activeNoteCounter++; // Increment counter for the next active note.
            } else {
                // For done notes, their priority value doesn't influence their display order (dateDone does).
                // They will retain whatever priority value they had when they were last active.
                // No action needed here for 'priority' field.
            }
        }
        
        // Step 3: Wait for all collected update operations to complete.
        if (updates.length > 0) {
            await Promise.all(updates); // Execute all updates concurrently.
        }

        // Step 4: After all priorities are updated in the backend, perform a full reload of notes.
        // This ensures the local 'this.notes' array and the UI are perfectly consistent with the
        // backend data, reflecting all reordering, additions, and deletions.
        await this.loadNotesFromCloud();
    },

    /**
     * Toggles the collapsed state of a note's body.
     * @param {HTMLElement} noteCard - The HTML element of the note card.
     */
    toggleNoteBody(noteCard) {
        noteCard.querySelector('.note-body').classList.toggle('collapsed');
        const toggleButton = noteCard.querySelector('.note-toggle');
        // Change the toggle icon based on the collapsed state.
        toggleButton.textContent = toggleButton.textContent === '▾' ? '▸' : '▾';
    },

    // --- Tag Search Logic ---

    /**
     * Filters notes based on the text entered in the tag search input.
     * Rerenders the UI to display only matching notes.
     */
    searchTags() { // Renamed from searchNotesByTag to avoid potential naming conflicts.
        this.currentSearchQuery = this.tagSearchInput.value.trim(); // Get search query and trim whitespace.
        this.render(); // Re-render to apply the filter.
    },

    /**
     * Clears the current tag search query and displays all notes.
     */
    clearSearch() {
        this.currentSearchQuery = ''; // Clear the search query.
        this.tagSearchInput.value = ''; // Clear the input field.
        this.render(); // Re-render to show all notes.
        this.updateStatus('Search cleared. Displaying all notes.');
    },

    // --- UI Feedback Mechanism ---

    /**
     * Updates the status message displayed to the user.
     * @param {string} message - The message to display.
     * @param {string} type - The type of message ('info', 'success', 'error', 'warn') to apply appropriate styling.
     */
    updateStatus(message, type = 'info') {
        this.statusMessage.textContent = message; // Set message text.
        this.statusMessage.className = 'text-sm'; // Reset base styling.
        // Apply type-specific Tailwind CSS classes for color.
        switch (type) {
            case 'success': this.statusMessage.classList.add('text-green-600', 'dark:text-green-400'); break;
            case 'error': this.statusMessage.classList.add('text-red-600', 'dark:text-red-400'); break;
            case 'warn': this.statusMessage.classList.add('text-yellow-600', 'dark:text-yellow-400'); break;
            default: this.statusMessage.classList.add('text-gray-500', 'dark:text-gray-400'); // Default info color.
        }
    },

    // --- Custom Confirmation Modal ---

    /**
     * Displays a custom confirmation modal to the user.
     * @param {string} message - The message to display in the modal.
     * @param {Function} onConfirm - Callback function to execute if the user confirms.
     */
    showConfirmationModal(message, onConfirm) {
        // Create the modal overlay (dark background).
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        
        // Create the modal content box.
        const modalContent = document.createElement('div');
        modalContent.className = 'bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full text-center';
        
        // Add the message paragraph.
        const messagePara = document.createElement('p');
        messagePara.className = 'text-lg font-semibold mb-6 text-gray-900 dark:text-gray-100';
        messagePara.textContent = message;
        
        // Create button container.
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'flex justify-center gap-4';
        
        // Create 'Confirm' button.
        const confirmButton = document.createElement('button');
        confirmButton.className = 'bg-red-600 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-300';
        confirmButton.textContent = 'Delete'; // Text specifically for deletion confirmation.
        
        // Create 'Cancel' button.
        const cancelButton = document.createElement('button');
        cancelButton.className = 'bg-gray-400 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-300';
        cancelButton.textContent = 'Cancel';

        // Assemble the modal structure.
        buttonContainer.appendChild(confirmButton);
        buttonContainer.appendChild(cancelButton);
        modalContent.appendChild(messagePara);
        modalContent.appendChild(buttonContainer);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay); // Add modal to the document body.

        // Add event listeners for modal buttons.
        confirmButton.addEventListener('click', () => {
            onConfirm(); // Execute the callback if confirmed.
            document.body.removeChild(modalOverlay); // Remove modal from DOM.
        });

        cancelButton.addEventListener('click', () => {
            document.body.removeChild(modalOverlay); // Remove modal from DOM.
        });
    }
};

// Initialize the application when the script loads.
App.init();