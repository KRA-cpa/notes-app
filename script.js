// The main application object, encapsulating all logic and state.
const App = {
    // --- DOM Elements ---
    notesContainer: document.getElementById('notes-container'),
    doneNotesContainer: document.getElementById('done-notes-container'),
    completedSection: document.getElementById('completed-section'),
    noteTemplate: document.getElementById('note-template'),
    addNoteButton: document.getElementById('add-note-button'),
    fileInput: document.getElementById('file-input'),
    saveButton: document.getElementById('save-button'),
    statusMessage: document.getElementById('status-message'),
    tagSearchInput: document.getElementById('tag-search-input'),
    searchTagsButton: document.getElementById('search-tags-button'),
    clearSearchButton: document.getElementById('clear-search-button'),
    systemSuggestionsDatalist: document.getElementById('system-suggestions'),

    // --- Apps Script Web App URL ---
    APPS_SCRIPT_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbzofp1lc9V2Fw-HjmOKVUNMQMVcWqS1IyCxhp3ltL2lS3sJFRwBNZfL3mGVCZJHxXtFXA/exec', // <<< REPLACE THIS!

    // --- Data Store ---
    notes: [],
    uniqueSystems: new Set(),
    
    // Obsolete local XML variables
    fileSaveCounter: 0,
    hasUnsavedChanges: false,
    lastLoadedFileName: null,

    // --- Initialization ---
    init() {
        this.addEventListeners();
        this.updateStatus('Connecting to Google Sheet...', 'info'); // Initial connection attempt status
        this.loadNotesFromCloud();
    },

    // --- Event Listeners ---
    addEventListeners() {
        console.log("App event listeners initialized.");
        this.addNoteButton.addEventListener('click', () => this.addNewNote());
        
        // Remove listeners for XML operations
        // this.saveButton.addEventListener('click', () => this.saveToXML());
        // this.fileInput.addEventListener('change', (e) => { this.loadFromXML(e); });

        this.searchTagsButton.addEventListener('click', () => this.searchTags());
        this.clearSearchButton.addEventListener('click', () => this.clearSearch());
        this.tagSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchTagsButton.click();
            }
        });

        // Event delegation for actions within BOTH containers
        document.body.addEventListener('click', async (e) => {
            const noteCard = e.target.closest('.note-card');
            if (!noteCard) return;

            const noteId = noteCard.dataset.id;
            const noteIndex = this.notes.findIndex(n => n.id === noteId);
            const note = this.notes[noteIndex];
            if (!note) return;

            if (e.target.closest('.note-done-toggle')) {
                const newDoneStatus = !note.done;
                const now = new Date().toISOString();

                if (newDoneStatus) {
                    note.done = true;
                    note.dateDone = now;
                    note.dateUndone = '';
                } else {
                    note.done = false;
                    note.dateUndone = now;
                    note.dateDone = '';
                    
                    this.notes.splice(noteIndex, 1);
                    this.notes.unshift(note);
                    this.updateStatus(`Note "${note.title}" marked as active and moved to top.`, 'info');
                }

                await this.updateNoteInCloud(note);
                this.render();

                if (!newDoneStatus) {
                    await this.reassignAndSavePriorities();
                }
                return;
            }

            if (e.target.closest('.note-delete')) {
                this.deleteNote(note.id, note.title);
            }
            if (e.target.closest('.note-toggle')) this.toggleNoteBody(noteCard);
            
            if (e.target.closest('.note-up')) { await this.moveNote(noteIndex, -1); }
            if (e.target.closest('.note-down')) { await this.moveNote(noteIndex, 1); }
        });
        
        // Handle edits to contenteditable fields and textareas AND new system input
        document.body.addEventListener('input', async (e) => {
             const noteCard = e.target.closest('.note-card');
             if (!noteCard) return;
             
             const noteId = noteCard.dataset.id;
             const note = this.notes.find(n => n.id === noteId);

             if (!note) return;

             if (e.target.classList.contains('note-title')) note.title = e.target.textContent;
             if (e.target.classList.contains('note-description')) note.description = e.target.textContent;
             if (e.target.classList.contains('note-tags')) note.tags = e.target.textContent;
             if (e.target.classList.contains('note-comments')) note.comments = e.target.value;
             if (e.target.classList.contains('note-system')) {
                note.system = e.target.value;
                this.addUniqueSystem(note.system);
             }
             
             await this.updateNoteInCloud(note);
             this.updateStatus('Note updated in cloud.', 'info');
        });
    },

    // --- API Communication Functions ---

async fetchDataFromCloud() {
    try {
        const response = await fetch('/api/notes', {
            method: 'GET'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load: HTTP status ${response.status}`);
        }
        
        const data = await response.json();
        this.updateStatus('Connected to Google Sheet.', 'success');
        return data;
    } catch (error) {
        console.error('Error fetching data:', error);
        this.updateStatus(`Connection Error: ${error.message || 'Failed to connect/load notes.'} Check Apps Script URL and deployment permissions.`, 'error');
        return [];
    }
},

async sendDataToCloud(action, noteData) {
    try {
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
        
        this.updateStatus('Data synced to Google Sheet.', 'success');
        return result;
    } catch (error) {
        console.error(`Error performing ${action} action:`, error);
        this.updateStatus(`Sync Error: ${error.message || `Failed to ${action} note.`} Check server connection.`, 'error');
        return { success: false, message: error.message };
    }
}    



    // --- System Suggestions Logic (Unchanged) ---
    addUniqueSystem(systemValue) {
        systemValue = systemValue.trim();
        if (systemValue && !this.uniqueSystems.has(systemValue)) {
            this.uniqueSystems.add(systemValue);
            this.populateSystemDatalist();
        }
    },

    populateSystemDatalist() {
        this.systemSuggestionsDatalist.innerHTML = '';
        Array.from(this.uniqueSystems).sort().forEach(system => {
            const option = document.createElement('option');
            option.value = system;
            this.systemSuggestionsDatalist.appendChild(option);
        });
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
        doneNotes.sort((a, b) => {
            const dateA = a.dateDone ? new Date(a.dateDone) : new Date(0);
            const dateB = b.dateDone ? new Date(b.dateDone) : new Date(0);
            return dateB.getTime() - dateA.getTime();
        });
        
        activeNotes.forEach(note => this.notesContainer.appendChild(this.createNoteCard(note)));
        doneNotes.forEach(note => this.doneNotesContainer.appendChild(this.createNoteCard(note)));

        this.completedSection.classList.toggle('hidden', doneNotes.length === 0 && activeNotes.length === 0 && this.currentSearchQuery === '');

        if (this.notes.length === 0 && !this.currentSearchQuery) {
            this.updateStatus('No notes to display. Add one or open a file.');
        } else if (this.currentSearchQuery) {
            this.updateStatus(`Displaying ${activeNotes.length} active and ${doneNotes.length} completed notes matching tags: "${this.currentSearchQuery}".`);
        } else {
            this.updateStatus(`Displaying ${activeNotes.length} active and ${doneNotes.length} completed notes. Connected to Google Sheet.`, 'success');
        }
    },
    
    createNoteCard(note) {
        const card = this.noteTemplate.content.cloneNode(true).firstElementChild;
        card.dataset.id = note.id;
        
        card.querySelector('.note-title').textContent = note.title;
        card.querySelector('.note-description').textContent = note.description;
        card.querySelector('.note-tags').textContent = note.tags;
        card.querySelector('.note-comments').value = note.comments;
        
        const systemInput = card.querySelector('.note-system');
        if (systemInput) {
            systemInput.value = note.system || '';
        }

        const doneToggleButton = card.querySelector('.note-done-toggle');
        doneToggleButton.classList.remove('bg-green-500', 'hover:bg-green-600', 'focus:ring-green-500', 'bg-yellow-500', 'hover:bg-yellow-600', 'focus:ring-yellow-500', 'bg-red-500', 'hover:bg-red-600', 'focus:ring-red-500');

        if (note.done) {
            card.classList.add('is-done');
            doneToggleButton.classList.add('bg-green-500', 'hover:bg-green-600', 'focus:ring-green-500');
        } else {
            card.classList.remove('is-done');
            doneToggleButton.classList.add('bg-yellow-500', 'hover:bg-yellow-600', 'focus:ring-yellow-500');
        }
        
        return card;
    },
    
    async addNewNote() {
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
        this.notes.unshift(newNote); 
        this.render();

        await this.reassignAndSavePriorities();
        this.updateStatus('Added a new note to cloud and updated order.', 'success');
        this.addUniqueSystem(newNote.system);
    },

    async updateNoteInCloud(note) {
        const result = await this.sendDataToCloud('update', note);
        if (result.success) {
            // Show per-note "Saved!" indicator
            const noteCard = document.querySelector(`.note-card[data-id="${note.id}"]`);
            if (noteCard) {
                const indicator = noteCard.querySelector('.note-save-indicator');
                if (indicator) {
                    indicator.classList.remove('opacity-0'); // Make visible
                    indicator.classList.add('opacity-100'); // Ensure full opacity
                    setTimeout(() => {
                        indicator.classList.remove('opacity-100'); // Start fade out
                        indicator.classList.add('opacity-0');
                    }, 2000); // Hide after 2 seconds
                }
            }
        }
    },

    async deleteNote(noteId, noteTitle) {
        this.showConfirmationModal(`Are you sure you want to delete note "${noteTitle}"?`, async () => {
            const result = await this.sendDataToCloud('delete', { id: noteId });
            if (result.success) {
                this.notes = this.notes.filter(note => note.id !== noteId);
                this.updateStatus(`Note "${noteTitle}" deleted from cloud.`, 'warn');
                this.render();

                await this.reassignAndSavePriorities();
            }
        });
    },

    async moveNote(index, direction) {
        if (this.notes[index].done) {
            this.updateStatus('Cannot manually reorder completed notes; they are sorted by completion date.', 'info');
            return;
        }

        if (direction === -1 && index > 0) {
            const [movedNote] = this.notes.splice(index, 1);
            this.notes.splice(index - 1, 0, movedNote);
        } else if (direction === 1 && index < this.notes.length - 1) {
            const [movedNote] = this.notes.splice(index, 1);
            this.notes.splice(index + 1, 0, movedNote);
        } else {
            return;
        }

        this.render();
        this.updateStatus('Note moved visually. Saving new order...', 'info');

        await this.reassignAndSavePriorities();
        this.updateStatus('Note order saved to cloud.', 'success');
    },

    async reassignAndSavePriorities() {
        const updates = [];
        const PRIORITY_STEP = 1000;

        this.notes.sort((a, b) => {
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
            } else {
                // For done notes, their priority is not actively managed by reassignAndSavePriorities
            }
        }
        
        if (updates.length > 0) {
            await Promise.all(updates);
        }

        await this.loadNotesFromCloud();
    },

    toggleNoteBody(noteCard) {
        noteCard.querySelector('.note-body').classList.toggle('collapsed');
        const toggleButton = noteCard.querySelector('.note-toggle');
        toggleButton.textContent = toggleButton.textContent === '▾' ? '▸' : '▾';
    },

    // --- Tag Search Logic ---
    searchTags() {
        this.currentSearchQuery = this.tagSearchInput.value.trim();
        this.render();
    },

    clearSearch() {
        this.currentSearchQuery = '';
        this.tagSearchInput.value = '';
        this.render();
        this.updateStatus('Search cleared. Displaying all notes.');
    },

    // --- UI Feedback ---
    updateStatus(message, type = 'info') {
        this.statusMessage.textContent = message;
        this.statusMessage.className = 'text-sm';
        switch (type) {
            case 'success': this.statusMessage.classList.add('text-green-600', 'dark:text-green-400'); break;
            case 'error': this.statusMessage.classList.add('text-red-600', 'dark:text-red-400'); break;
            case 'warn': this.statusMessage.classList.add('text-yellow-600', 'dark:text-yellow-400'); break;
            default: this.statusMessage.classList.add('text-gray-500', 'dark:text-gray-400');
        }
    },

    // --- Custom Confirmation Modal ---
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

App.init();