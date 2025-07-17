// The main application object, encapsulating all logic and state.
const App = {
    // --- Data Store ---
    notes: [],
    uniqueSystems: new Set(),
    currentSearchQuery: '',

    // --- Initialization ---
    init() {
        console.log('App initializing...');
        this.initializeDOM();
        this.addEventListeners();
        this.updateStatus('Connecting to Google Sheet...', 'info');
        this.loadNotesFromCloud();
    },

    // --- DOM Initialization ---
    initializeDOM() {
        this.notesContainer = document.getElementById('notes-container');
        this.doneNotesContainer = document.getElementById('done-notes-container');
        this.completedSection = document.getElementById('completed-section');
        this.noteTemplate = document.getElementById('note-template');
        this.addNoteButton = document.getElementById('add-note-button');
        this.statusMessage = document.getElementById('status-message');
        this.tagSearchInput = document.getElementById('tag-search-input');
        this.searchTagsButton = document.getElementById('search-tags-button');
        this.clearSearchButton = document.getElementById('clear-search-button');
        this.systemSuggestionsDatalist = document.getElementById('system-suggestions');

        // Debug: Check if elements are found
        console.log('DOM elements found:', {
            notesContainer: !!this.notesContainer,
            addNoteButton: !!this.addNoteButton,
            noteTemplate: !!this.noteTemplate,
            statusMessage: !!this.statusMessage
        });
    },

    // --- Event Listeners ---
    addEventListeners() {
        console.log("Adding event listeners...");
        
        // Add Note Button
        if (this.addNoteButton) {
            this.addNoteButton.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Add note button clicked');
                this.addNewNote();
            });
            console.log('Add note button listener attached');
        } else {
            console.error('Add note button not found');
        }

        // Search functionality
        if (this.searchTagsButton) {
            this.searchTagsButton.addEventListener('click', () => this.searchTags());
        }
        if (this.clearSearchButton) {
            this.clearSearchButton.addEventListener('click', () => this.clearSearch());
        }
        if (this.tagSearchInput) {
            this.tagSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchTags();
                }
            });
        }

        // Event delegation for note actions
        document.body.addEventListener('click', async (e) => {
            const noteCard = e.target.closest('.note-card');
            if (!noteCard) return;

            const noteId = noteCard.dataset.id;
            const noteIndex = this.notes.findIndex(n => n.id === noteId);
            const note = this.notes[noteIndex];
            
            if (!note) {
                console.error('Note not found for ID:', noteId);
                return;
            }

            // Toggle completion status
            if (e.target.closest('.note-done-toggle')) {
                console.log('Toggle completion clicked for note:', note.title);
                await this.toggleNoteCompletion(note, noteIndex);
                return;
            }

            // Delete note
            if (e.target.closest('.note-delete')) {
                console.log('Delete clicked for note:', note.title);
                this.deleteNote(note.id, note.title);
                return;
            }

            // Toggle note body
            if (e.target.closest('.note-toggle')) {
                console.log('Toggle body clicked for note:', note.title);
                this.toggleNoteBody(noteCard);
                return;
            }
            
            // Move note up/down
            if (e.target.closest('.note-up')) {
                console.log('Move up clicked for note:', note.title);
                await this.moveNote(noteIndex, -1);
                return;
            }
            if (e.target.closest('.note-down')) {
                console.log('Move down clicked for note:', note.title);
                await this.moveNote(noteIndex, 1);
                return;
            }
        });
        
        // Handle edits to contenteditable fields and inputs
        document.body.addEventListener('input', async (e) => {
            const noteCard = e.target.closest('.note-card');
            if (!noteCard) return;
             
            const noteId = noteCard.dataset.id;
            const note = this.notes.find(n => n.id === noteId);
            if (!note) return;

            let fieldChanged = false;
            
            if (e.target.classList.contains('note-title')) {
                note.title = e.target.textContent.trim() || 'Untitled';
                fieldChanged = true;
            }
            if (e.target.classList.contains('note-description')) {
                note.description = e.target.textContent.trim();
                fieldChanged = true;
            }
            if (e.target.classList.contains('note-tags')) {
                note.tags = e.target.textContent.trim();
                fieldChanged = true;
            }
            if (e.target.classList.contains('note-comments')) {
                note.comments = e.target.value;
                fieldChanged = true;
            }
            if (e.target.classList.contains('note-system')) {
                note.system = e.target.value;
                this.addUniqueSystem(note.system);
                fieldChanged = true;
            }
            
            if (fieldChanged) {
                console.log('Field changed for note:', note.title);
                await this.updateNoteInCloud(note);
            }
        });

        console.log('All event listeners attached');
    },

    // --- API Communication Functions ---
    async fetchDataFromCloud() {
        try {
            console.log('Fetching data from cloud...');
            const response = await fetch('/api/notes', {
                method: 'GET'
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load: HTTP status ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Data fetched from cloud:', data.length, 'notes');
            this.updateStatus('Connected to Google Sheet.', 'success');
            return data;
        } catch (error) {
            console.error('Error fetching data:', error);
            this.updateStatus(`Connection Error: ${error.message}`, 'error');
            return [];
        }
    },

    async sendDataToCloud(action, noteData) {
        try {
            console.log(`Sending ${action} to cloud for note:`, noteData.title || noteData.id);
            const response = await fetch('/api/update-note', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action: action, note: noteData })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to save: HTTP status ${response.status}`);
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(`API Error: ${result.message}`);
            }
            
            console.log(`${action} successful for note:`, noteData.title || noteData.id);
            return result;
        } catch (error) {
            console.error(`Error performing ${action} action:`, error);
            this.updateStatus(`Sync Error: ${error.message}`, 'error');
            return { success: false, message: error.message };
        }
    },

    // --- System Suggestions Logic ---
    addUniqueSystem(systemValue) {
        if (!systemValue) return;
        systemValue = systemValue.trim();
        if (systemValue && !this.uniqueSystems.has(systemValue)) {
            this.uniqueSystems.add(systemValue);
            this.populateSystemDatalist();
        }
    },

    populateSystemDatalist() {
        if (this.systemSuggestionsDatalist) {
            this.systemSuggestionsDatalist.innerHTML = '';
            Array.from(this.uniqueSystems).sort().forEach(system => {
                const option = document.createElement('option');
                option.value = system;
                this.systemSuggestionsDatalist.appendChild(option);
            });
        }
    },

    // --- Core Logic ---
    async loadNotesFromCloud() {
        this.updateStatus('Loading notes from cloud...', 'info');
        const fetchedNotes = await this.fetchDataFromCloud();
        
        this.notes = fetchedNotes.sort((a, b) => {
            if (!a.done && b.done) return -1;
            if (a.done && !b.done) return 1;

            if (!a.done && !b.done) {
                const priorityA = a.priority !== undefined && a.priority !== '' ? Number(a.priority) : Infinity;
                const priorityB = b.priority !== undefined && b.priority !== '' ? Number(b.priority) : Infinity;
                if (priorityA !== priorityB) {
                    return priorityA - priorityB;
                }
                return new Date(a.timestamp) - new Date(b.timestamp);
            }

            if (a.done && b.done) {
                 const dateA = a.dateDone ? new Date(a.dateDone) : new Date(0);
                 const dateB = b.dateDone ? new Date(b.dateDone) : new Date(0);
                 return dateB.getTime() - dateA.getTime();
            }
            return 0;
        });
        
        this.uniqueSystems.clear();
        this.notes.forEach(note => {
            if (note.system) {
                this.addUniqueSystem(note.system);
            }
        });
        this.populateSystemDatalist();

        this.render();
        this.updateStatus(`Successfully loaded ${this.notes.length} notes from cloud.`, 'success');
    },

    render() {
        if (!this.notesContainer || !this.doneNotesContainer) {
            console.error('Containers not found for rendering');
            return;
        }

        let notesToDisplay = this.notes;

        if (this.currentSearchQuery) {
            const searchTags = this.currentSearchQuery.toLowerCase().split(',').map(tag => tag.trim()).filter(tag => tag);
            notesToDisplay = this.notes.filter(note => {
                const noteTags = (note.tags || '').toLowerCase().split(',').map(tag => tag.trim());
                return searchTags.some(searchTag => noteTags.includes(searchTag));
            });
        }

        this.notesContainer.innerHTML = '';
        this.doneNotesContainer.innerHTML = '';

        const activeNotes = notesToDisplay.filter(n => !n.done);
        const doneNotes = notesToDisplay.filter(n => n.done);
        
        activeNotes.forEach(note => {
            const noteCard = this.createNoteCard(note);
            this.notesContainer.appendChild(noteCard);
        });
        
        doneNotes.forEach(note => {
            const noteCard = this.createNoteCard(note);
            this.doneNotesContainer.appendChild(noteCard);
        });

        if (this.completedSection) {
            this.completedSection.classList.toggle('hidden', doneNotes.length === 0);
        }

        // Update status message
        if (this.notes.length === 0 && !this.currentSearchQuery) {
            this.updateStatus('No notes to display. Click "Add Note" to create your first note.');
        } else if (this.currentSearchQuery) {
            this.updateStatus(`Showing ${activeNotes.length} active and ${doneNotes.length} completed notes for: "${this.currentSearchQuery}"`);
        } else {
            this.updateStatus(`Showing ${activeNotes.length} active and ${doneNotes.length} completed notes.`, 'success');
        }
    },
    
    createNoteCard(note) {
        if (!this.noteTemplate) {
            console.error('Note template not found');
            return document.createElement('div');
        }

        const card = this.noteTemplate.content.cloneNode(true).firstElementChild;
        card.dataset.id = note.id;
        
        // Set content
        const titleElement = card.querySelector('.note-title');
        const descriptionElement = card.querySelector('.note-description');
        const tagsElement = card.querySelector('.note-tags');
        const commentsElement = card.querySelector('.note-comments');
        const systemElement = card.querySelector('.note-system');
        
        if (titleElement) titleElement.textContent = note.title || 'Untitled';
        if (descriptionElement) descriptionElement.textContent = note.description || 'Add your description here.';
        if (tagsElement) tagsElement.textContent = note.tags || 'new';
        if (commentsElement) commentsElement.value = note.comments || '';
        if (systemElement) systemElement.value = note.system || '';

        // Set up toggle button styling
        const doneToggleButton = card.querySelector('.note-done-toggle');
        if (doneToggleButton) {
            // Remove all existing color classes
            doneToggleButton.classList.remove(
                'bg-green-500', 'hover:bg-green-600', 'focus:ring-green-500',
                'bg-yellow-500', 'hover:bg-yellow-600', 'focus:ring-yellow-500',
                'bg-red-500', 'hover:bg-red-600', 'focus:ring-red-500'
            );

            if (note.done) {
                card.classList.add('is-done');
                doneToggleButton.classList.add('bg-green-500', 'hover:bg-green-600', 'focus:ring-green-500');
                doneToggleButton.title = 'Mark as Active';
            } else {
                card.classList.remove('is-done');
                doneToggleButton.classList.add('bg-yellow-500', 'hover:bg-yellow-600', 'focus:ring-yellow-500');
                doneToggleButton.title = 'Mark as Done';
            }
        }
        
        return card;
    },

    async toggleNoteCompletion(note, noteIndex) {
        const newDoneStatus = !note.done;
        const now = new Date().toISOString();

        if (newDoneStatus) {
            note.done = true;
            note.dateDone = now;
            note.dateUndone = '';
            this.updateStatus(`Note "${note.title}" marked as completed.`, 'success');
        } else {
            note.done = false;
            note.dateUndone = now;
            note.dateDone = '';
            
            // Move to top of active notes
            this.notes.splice(noteIndex, 1);
            this.notes.unshift(note);
            this.updateStatus(`Note "${note.title}" marked as active and moved to top.`, 'info');
        }

        await this.updateNoteInCloud(note);
        this.render();

        if (!newDoneStatus) {
            await this.reassignAndSavePriorities();
        }
    },
    
    async addNewNote() {
        console.log('Adding new note...');
        
        const newNote = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            title: 'New Note',
            description: 'Add your description here.',
            tags: 'new',
            comments: '',
            system: '',
            dateDone: '',
            dateUndone: '',
            priority: 0,
            done: false
        };
        
        // Add to local array first
        this.notes.unshift(newNote);
        this.render();
        
        // Show temporary status
        this.updateStatus('Adding new note...', 'info');
        
        // Save to cloud
        const result = await this.sendDataToCloud('add', newNote);
        if (result.success) {
            await this.reassignAndSavePriorities();
            this.updateStatus('New note added successfully!', 'success');
        } else {
            // If save failed, remove from local array
            this.notes = this.notes.filter(note => note.id !== newNote.id);
            this.render();
            this.updateStatus('Failed to add note. Please try again.', 'error');
        }
    },

    async updateNoteInCloud(note) {
        const result = await this.sendDataToCloud('update', note);
        if (result.success) {
            // Show per-note "Saved!" indicator
            const noteCard = document.querySelector(`.note-card[data-id="${note.id}"]`);
            if (noteCard) {
                const indicator = noteCard.querySelector('.note-save-indicator');
                if (indicator) {
                    indicator.style.opacity = '1';
                    setTimeout(() => {
                        indicator.style.opacity = '0';
                    }, 2000);
                }
            }
            this.updateStatus('Note updated successfully.', 'success');
        }
    },

    async deleteNote(noteId, noteTitle) {
        this.showConfirmationModal(`Are you sure you want to delete "${noteTitle}"?`, async () => {
            this.updateStatus('Deleting note...', 'info');
            const result = await this.sendDataToCloud('delete', { id: noteId });
            if (result.success) {
                this.notes = this.notes.filter(note => note.id !== noteId);
                this.render();
                await this.reassignAndSavePriorities();
                this.updateStatus(`Note "${noteTitle}" deleted successfully.`, 'success');
            }
        });
    },

    async moveNote(index, direction) {
        const note = this.notes[index];
        if (note.done) {
            this.updateStatus('Cannot reorder completed notes.', 'info');
            return;
        }

        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.notes.length) {
            return;
        }

        // Move in array
        this.notes.splice(index, 1);
        this.notes.splice(newIndex, 0, note);

        this.render();
        this.updateStatus('Updating note order...', 'info');
        await this.reassignAndSavePriorities();
        this.updateStatus('Note order updated.', 'success');
    },

    async reassignAndSavePriorities() {
        const updates = [];
        const PRIORITY_STEP = 1000;

        let activeNoteCounter = 0;
        for (let i = 0; i < this.notes.length; i++) {
            const note = this.notes[i];
            if (!note.done) {
                const newPriority = activeNoteCounter * PRIORITY_STEP;
                if (Number(note.priority) !== newPriority) {
                    note.priority = newPriority;
                    updates.push(this.updateNoteInCloud(note));
                }
                activeNoteCounter++;
            }
        }
        
        if (updates.length > 0) {
            await Promise.all(updates);
        }
    },

    toggleNoteBody(noteCard) {
        const noteBody = noteCard.querySelector('.note-body');
        const toggleButton = noteCard.querySelector('.note-toggle');
        
        if (noteBody && toggleButton) {
            noteBody.classList.toggle('collapsed');
            toggleButton.textContent = noteBody.classList.contains('collapsed') ? '▸' : '▾';
        }
    },

    // --- Search Logic ---
    searchTags() {
        this.currentSearchQuery = this.tagSearchInput.value.trim();
        this.render();
    },

    clearSearch() {
        this.currentSearchQuery = '';
        this.tagSearchInput.value = '';
        this.render();
    },

    // --- UI Feedback ---
    updateStatus(message, type = 'info') {
        if (!this.statusMessage) return;
        
        this.statusMessage.textContent = message;
        this.statusMessage.className = 'text-sm';
        
        switch (type) {
            case 'success': 
                this.statusMessage.classList.add('text-green-600', 'dark:text-green-400'); 
                break;
            case 'error': 
                this.statusMessage.classList.add('text-red-600', 'dark:text-red-400'); 
                break;
            case 'warn': 
                this.statusMessage.classList.add('text-yellow-600', 'dark:text-yellow-400'); 
                break;
            default: 
                this.statusMessage.classList.add('text-gray-500', 'dark:text-gray-400');
        }
        
        console.log(`Status: ${message} (${type})`);
    },

    // --- Confirmation Modal ---
    showConfirmationModal(message, onConfirm) {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full text-center';
        
        const messagePara = document.createElement('p');
        messagePara.className = 'text-lg font-semibold mb-6 text-gray-900 dark:text-gray-100';
        messagePara.textContent = message;
        
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'flex justify-center gap-4';
        
        const confirmButton = document.createElement('button');
        confirmButton.className = 'bg-red-600 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-300';
        confirmButton.textContent = 'Delete';
        
        const cancelButton = document.createElement('button');
        cancelButton.className = 'bg-gray-400 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-300';
        cancelButton.textContent = 'Cancel';

        buttonContainer.appendChild(confirmButton);
        buttonContainer.appendChild(cancelButton);
        modalContent.appendChild(messagePara);
        modalContent.appendChild(buttonContainer);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        confirmButton.addEventListener('click', () => {
            onConfirm();
            document.body.removeChild(modalOverlay);
        });

        cancelButton.addEventListener('click', () => {
            document.body.removeChild(modalOverlay);
        });
    }
};

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    App.init();
});

// Fallback initialization in case DOMContentLoaded already fired
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}