// script.js

/**
 * Notes App - Complete Rewrite with Authentication
 * A comprehensive notes management application with Google authentication and read-only completed notes
 */

/**
 * EncryptionManager - Handles client-side encryption/decryption of sensitive note data
 * Uses AES-256-GCM for authenticated encryption
 */
class EncryptionManager {
    constructor() {
        this.key = null;
        this.isInitialized = false;
    }

    /**
     * Initialize encryption with user-specific key
     */
    async initialize(userSub) {
        try {
            console.log('🔐 Initializing encryption for user:', userSub);
            
            // Derive user-specific key from Google ID + app secret
            const keyMaterial = await this.deriveKeyMaterial(userSub);
            this.key = await window.crypto.subtle.importKey(
                'raw',
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            
            this.isInitialized = true;
            console.log('✅ Encryption initialized successfully');
        } catch (error) {
            console.error('❌ Encryption initialization failed:', error);
            throw new Error('Failed to initialize encryption');
        }
    }

    /**
     * Derive encryption key material from user ID
     */
    async deriveKeyMaterial(userSub) {
        // Use a combination of user ID and app-specific secret
        const appSecret = 'NotesApp2025_EncryptionSecret_v1';
        const combined = userSub + '|' + appSecret;
        
        // Create key material using PBKDF2
        const encoder = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(combined),
            'PBKDF2',
            false,
            ['deriveBits']
        );
        
        // Derive 256-bit key using PBKDF2 with 100,000 iterations
        const salt = encoder.encode('NotesAppSalt2025');
        const derivedKey = await window.crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            256
        );
        
        return derivedKey;
    }

    /**
     * Encrypt a string value
     */
    async encrypt(plaintext) {
        if (!this.isInitialized) {
            throw new Error('Encryption not initialized');
        }
        
        if (!plaintext || typeof plaintext !== 'string') {
            return plaintext; // Return as-is for empty/invalid values
        }
        
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(plaintext);
            
            // Generate random IV for each encryption
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            
            const encrypted = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                this.key,
                data
            );
            
            // Return encrypted data with IV and authentication tag
            return {
                encrypted: this.arrayBufferToBase64(encrypted),
                iv: this.arrayBufferToBase64(iv),
                version: 1 // For future encryption version compatibility
            };
        } catch (error) {
            console.error('❌ Encryption failed:', error);
            throw new Error('Failed to encrypt data');
        }
    }

    /**
     * Decrypt an encrypted value (handles both proper objects and malformed strings)
     */
    async decrypt(encryptedData) {
        if (!this.isInitialized) {
            throw new Error('Encryption not initialized');
        }
        
        // If not encrypted, return as-is
        if (!this.isEncrypted(encryptedData)) {
            return encryptedData;
        }
        
        let parsedData = encryptedData;
        
        // If it's a malformed string, parse it first
        if (typeof encryptedData === 'string') {
            console.log('🔧 Input is string, attempting to parse:', encryptedData);
            try {
                parsedData = this.parseMalformedEncryptedString(encryptedData);
                console.log('✅ Successfully parsed to object:', parsedData);
            } catch (parseError) {
                console.error('❌ Failed to parse encrypted string:', parseError);
                throw parseError;
            }
        } else {
            console.log('🔍 Input is already an object:', parsedData);
        }
        
        try {
            const encrypted = this.base64ToArrayBuffer(parsedData.encrypted);
            const iv = this.base64ToArrayBuffer(parsedData.iv);
            
            const decrypted = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                this.key,
                encrypted
            );
            
            const decoder = new TextDecoder();
            const result = decoder.decode(decrypted);
            console.log('✅ Successfully decrypted data');
            return result;
        } catch (error) {
            console.error('❌ Decryption failed:', error);
            console.error('❌ Input data:', parsedData);
            throw new Error('Failed to decrypt data');
        }
    }

    /**
     * Parse malformed encrypted strings from AppScript
     * Converts {version=1.0, iv=abc123, encrypted=xyz789} to proper JSON object
     */
    parseMalformedEncryptedString(malformedString) {
        console.log('🔧 parseMalformedEncryptedString input:', malformedString);
        
        try {
            // First try normal JSON parsing
            const result = JSON.parse(malformedString);
            console.log('✅ Standard JSON parsing worked:', result);
            return result;
        } catch (e) {
            console.log('🔧 Standard JSON failed, attempting to fix malformed format');
            console.log('🔧 Original error:', e.message);
            
            try {
                let fixedString = malformedString.trim();
                
                // Handle: {version=1.0, iv=abc123, encrypted=xyz789}
                fixedString = fixedString.replace(/\{([^}]+)\}/, (match, content) => {
                    console.log('🔧 Processing content:', content);
                    
                    // Split by comma and process each key=value pair
                    const pairs = content.split(',').map(pair => {
                        const trimmedPair = pair.trim();
                        const equalIndex = trimmedPair.indexOf('=');
                        
                        if (equalIndex === -1) {
                            console.warn('⚠️ No equals sign found in pair:', trimmedPair);
                            return null;
                        }
                        
                        const key = trimmedPair.substring(0, equalIndex).trim();
                        const value = trimmedPair.substring(equalIndex + 1).trim();
                        
                        console.log('🔧 Processing pair:', { key, value });
                        
                        // Check if value is a number (for version)
                        if (key === 'version' && /^\d+(\.\d+)?$/.test(value)) {
                            return `"${key}":${value}`;
                        } else {
                            return `"${key}":"${value}"`;
                        }
                    }).filter(pair => pair !== null);
                    
                    const result = `{${pairs.join(',')}}`;
                    console.log('🔧 Constructed JSON:', result);
                    return result;
                });
                
                console.log('🔧 Final fixed string:', fixedString);
                const parsedResult = JSON.parse(fixedString);
                console.log('✅ Successfully parsed malformed string:', parsedResult);
                return parsedResult;
            } catch (e2) {
                console.error('❌ Failed to fix malformed encrypted string:', e2);
                console.error('❌ Attempted to parse:', typeof fixedString !== 'undefined' ? fixedString : 'undefined');
                throw new Error(`Cannot parse malformed encrypted data: ${e2.message}`);
            }
        }
    }

    /**
     * Test function to verify parsing logic (for debugging)
     */
    testMalformedParsing() {
        const testString = '{version=1.0, iv=qJ2hPzjcAHCSOYbG, encrypted=VOvYU4tYG9QHsj1OyMPNvZPISzzsmNf8t3CAU5aM}';
        console.log('🧪 Testing malformed string parsing...');
        try {
            const result = this.parseMalformedEncryptedString(testString);
            console.log('✅ Test parsing successful:', result);
            return result;
        } catch (error) {
            console.error('❌ Test parsing failed:', error);
            return null;
        }
    }

    /**
     * Check if data is encrypted (handles both proper objects and malformed strings)
     */
    isEncrypted(data) {
        // Handle properly parsed encrypted objects
        if (data && typeof data === 'object' && data.encrypted && data.iv) {
            return true;
        }
        
        // Handle malformed encrypted strings from AppScript
        if (typeof data === 'string' && data.startsWith('{') && data.includes('encrypted') && data.includes('iv')) {
            console.log('🔍 Detected malformed encrypted string:', data);
            return true;
        }
        
        return false;
    }

    /**
     * Convert ArrayBuffer to Base64
     */
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    /**
     * Convert Base64 to ArrayBuffer
     */
    base64ToArrayBuffer(base64) {
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Clear encryption key from memory
     */
    clear() {
        this.key = null;
        this.isInitialized = false;
        console.log('🔐 Encryption key cleared from memory');
    }
}

/**
 * PH Timezone Utilities - Handles Philippine timezone operations
 */
class PHTimezoneUtils {
    static getPHTime() {
        return new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Manila',
            weekday: 'long',
            year: 'numeric',
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    }
    
    static getPHTimeShort() {
        return new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Manila',
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }
    
    static convertToPHTime(utcDate) {
        return new Date(utcDate).toLocaleString('en-US', {
            timeZone: 'Asia/Manila'
        });
    }
    
    static isPastDue(dueDateString) {
        if (!dueDateString) return false;
        
        const dueDate = new Date(dueDateString);
        const phNow = new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Manila'}));
        
        return dueDate < phNow;
    }
    
    static formatDueDateForInput(utcString) {
        if (!utcString) {
            // For existing notes without due date, return empty (don't default to tomorrow)
            return '';
        }
        
        // Convert UTC to PH date for date input field
        const date = new Date(utcString);
        const phDate = new Date(date.toLocaleString('en-US', {timeZone: 'Asia/Manila'}));
        return phDate.toISOString().slice(0, 10); // Format for date input (YYYY-MM-DD)
    }
}

class NotesApp {
    constructor() {
        // Data storage
        this.notes = [];
        this.systemSuggestions = new Set();
        this.pendingChanges = new Set();
        this.currentSearch = '';
        
        // Authentication state
        this.currentUser = null;
        this.authToken = null;
        this.isAuthenticated = false;
        
        // Encryption manager
        this.encryptionManager = new EncryptionManager();
        
        // ADDED: PH time update timer
        this.phTimeInterval = null;
        
        // ADDED: Overdue checking timer
        this.overdueInterval = null;
        
        // DOM elements
        this.elements = {};
        
        // Initialize app
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('🚀 Initializing Notes App...');
        
        this.initializeDOM();
        this.setupEventListeners();
        
        // ADDED: Start PH time display
        this.startPHTimeDisplay();
        
        // Check authentication status first
        await this.checkAuthStatus();
    }

    /**
     * Initialize DOM element references
     */
    initializeDOM() {
        this.elements = {
            // Auth elements
            authContainer: document.getElementById('auth-container'),
            authLoading: document.getElementById('auth-loading'),
            appContainer: document.getElementById('app-container'),
            userProfile: document.getElementById('user-profile'),
            userAvatar: document.getElementById('user-avatar'),
            userName: document.getElementById('user-name'),
            logoutBtn: document.getElementById('logout-btn'),
            
            // App elements
            addNoteBtn: document.getElementById('add-note-btn'),
            searchInput: document.getElementById('search-input'),
            searchBtn: document.getElementById('search-btn'),
            clearSearchBtn: document.getElementById('clear-search-btn'),
            statusMessage: document.getElementById('status-message'),
            activeNotesContainer: document.getElementById('active-notes-container'),
            completedNotesContainer: document.getElementById('completed-notes-container'),
            completedSection: document.getElementById('completed-section'),
            noteTemplate: document.getElementById('note-template'),
            systemDatalist: document.getElementById('system-datalist'),
            modalOverlay: document.getElementById('modal-overlay'),
            modalMessage: document.getElementById('modal-message'),
            modalConfirm: document.getElementById('modal-confirm'),
            modalCancel: document.getElementById('modal-cancel'),
            
            // ADDED: PH time display elements
            phTimeDisplay: document.getElementById('ph-time-display'),
            phTimeValue: document.getElementById('ph-time-value')
        };

        // Validate critical elements
        const critical = ['authContainer', 'appContainer', 'addNoteBtn', 'noteTemplate', 'activeNotesContainer'];
        critical.forEach(key => {
            if (!this.elements[key]) {
                console.error(`❌ Critical element missing: ${key}`);
            }
        });
    }

    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        console.log('📡 Setting up event listeners...');

        // Auth listeners
        this.elements.logoutBtn?.addEventListener('click', () => this.handleLogout());

        // Add note button
        this.elements.addNoteBtn?.addEventListener('click', () => this.addNote());

        // Search functionality
        this.elements.searchBtn?.addEventListener('click', () => this.performSearch());
        this.elements.clearSearchBtn?.addEventListener('click', () => this.clearSearch());
        this.elements.searchInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        // Modal events
        this.elements.modalCancel?.addEventListener('click', () => this.hideModal());
        this.elements.modalOverlay?.addEventListener('click', (e) => {
            if (e.target === this.elements.modalOverlay) this.hideModal();
        });

        // Global event delegation
        document.addEventListener('click', (e) => this.handleGlobalClick(e));
        document.addEventListener('input', (e) => this.handleGlobalInput(e));
        document.addEventListener('focusin', (e) => this.handleFocusIn(e));
        document.addEventListener('focusout', (e) => this.handleFocusOut(e));
    }

    /**
     * Check authentication status on app load
     */
    async checkAuthStatus() {
        console.log('🔐 Checking authentication status...');
        
        const token = localStorage.getItem('authToken');
        const user = localStorage.getItem('currentUser');
        
        if (token && user) {
            try {
                this.authToken = token;
                this.currentUser = JSON.parse(user);
                
                // Verify token is still valid by making a test API call
                await this.verifyAuthToken();
                
                this.isAuthenticated = true;
                
                // Initialize encryption with user's Google ID
                await this.encryptionManager.initialize(this.currentUser.sub);
                
                this.showApp();
                await this.loadNotesFromCloud();
                
                // ADDED: Start overdue checking after notes are loaded
                this.startOverdueChecking();
                
                console.log('✅ Authentication verified');
            } catch (error) {
                console.log('⚠️ Stored token is invalid, showing login');
                this.clearAuthData();
                this.showAuthPage();
            }
        } else {
            console.log('🔓 No stored authentication, showing login');
            this.showAuthPage();
        }
    }

    /**
     * Verify stored auth token is still valid
     */
    async verifyAuthToken() {
        const response = await fetch('/api/notes', {
            headers: {
                'Authorization': `Bearer ${this.authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Token verification failed');
        }
    }

    /**
     * Show authentication page
     */
    showAuthPage() {
        if (this.elements.authContainer) {
            this.elements.authContainer.classList.remove('hidden');
        }
        if (this.elements.appContainer) {
            this.elements.appContainer.classList.add('hidden');
        }
        this.updateStatus('Please sign in to access your notes', 'info');
    }

    /**
     * Show main app
     */
    showApp() {
        if (this.elements.authContainer) {
            this.elements.authContainer.classList.add('hidden');
        }
        if (this.elements.appContainer) {
            this.elements.appContainer.classList.remove('hidden');
        }
        this.updateUserProfile();
    }

    /**
     * Show authentication loading
     */
    showAuthLoading() {
        if (this.elements.authLoading) {
            this.elements.authLoading.classList.remove('hidden');
        }
    }

    /**
     * Hide authentication loading
     */
    hideAuthLoading() {
        if (this.elements.authLoading) {
            this.elements.authLoading.classList.add('hidden');
        }
    }

    /**
     * Update user profile display
     */
    updateUserProfile() {
        if (!this.currentUser || !this.elements.userProfile) return;
        
        if (this.elements.userAvatar) {
            this.elements.userAvatar.src = this.currentUser.picture || '';
            this.elements.userAvatar.alt = this.currentUser.name || 'User';
        }
        
        if (this.elements.userName) {
            this.elements.userName.textContent = this.currentUser.name || this.currentUser.email || 'User';
        }
        
        this.elements.userProfile.classList.remove('hidden');
    }

    /**
     * Handle logout
     */
    async handleLogout() {
        console.log('🔓 Logging out...');
        
        try {
            // Call logout API
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
        } catch (error) {
            console.warn('⚠️ Logout API call failed:', error);
        }
        
        this.clearAuthData();
        this.showAuthPage();
        this.updateStatus('You have been logged out', 'info');
    }

    /**
     * Clear authentication data
     */
    clearAuthData() {
        this.currentUser = null;
        this.authToken = null;
        this.isAuthenticated = false;
        this.notes = [];
        
        // ADDED: Clear encryption key from memory on logout
        this.encryptionManager.clear();
        
        // ADDED: Clear PH time display timer
        if (this.phTimeInterval) {
            clearInterval(this.phTimeInterval);
            this.phTimeInterval = null;
        }
        
        // ADDED: Clear overdue checking timer
        if (this.overdueInterval) {
            clearInterval(this.overdueInterval);
            this.overdueInterval = null;
        }
        
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        
        if (this.elements.userProfile) {
            this.elements.userProfile.classList.add('hidden');
        }
        
        this.renderNotes();
    }

    /**
     * ADDED: Start PH time display with real-time updates
     */
    startPHTimeDisplay() {
        // Update time immediately
        this.updatePHTimeDisplay();
        
        // Update every second
        this.phTimeInterval = setInterval(() => {
            this.updatePHTimeDisplay();
        }, 1000);
        
        console.log('🕒 PH time display started');
    }

    /**
     * ADDED: Update PH time display
     */
    updatePHTimeDisplay() {
        if (this.elements.phTimeValue) {
            this.elements.phTimeValue.textContent = PHTimezoneUtils.getPHTime();
        }
    }

    /**
     * ADDED: Update overdue indicator for a note card
     */
    updateOverdueIndicator(noteCard, isOverdue) {
        const indicator = noteCard.querySelector('.note-overdue-indicator');
        if (indicator) {
            if (isOverdue) {
                indicator.classList.remove('hidden');
            } else {
                indicator.classList.add('hidden');
            }
        }
    }

    /**
     * ADDED: Check all notes for overdue status and update automatically
     */
    async checkOverdueNotes() {
        if (!this.isAuthenticated || this.notes.length === 0) return;
        
        let hasChanges = false;
        const now = new Date().toISOString();
        
        for (const note of this.notes) {
            if (!note.done && note.dueDate) {
                const wasOverdue = note.isOverdue;
                const isNowOverdue = PHTimezoneUtils.isPastDue(note.dueDate);
                
                if (wasOverdue !== isNowOverdue) {
                    note.isOverdue = isNowOverdue;
                    note.overdueCheckedAt = now;
                    hasChanges = true;
                    
                    // Update UI immediately
                    const noteCard = document.querySelector(`[data-note-id="${note.id}"]`);
                    if (noteCard) {
                        this.updateOverdueIndicator(noteCard, isNowOverdue);
                    }
                    
                    // Save to cloud
                    try {
                        await this.sendToCloud('update', note);
                        console.log(`📅 Note "${note.title}" overdue status updated: ${isNowOverdue}`);
                    } catch (error) {
                        console.error('❌ Failed to update overdue status:', error);
                    }
                }
            }
        }
        
        if (hasChanges) {
            console.log('📅 Overdue check completed with changes');
        }
    }

    /**
     * ADDED: Start automatic overdue checking
     */
    startOverdueChecking() {
        // Check immediately
        this.checkOverdueNotes();
        
        // Check every 5 minutes
        this.overdueInterval = setInterval(() => {
            this.checkOverdueNotes();
        }, 5 * 60 * 1000);
        
        console.log('📅 Automatic overdue checking started');
    }

    /**
     * Handle global click events
     */
    async handleGlobalClick(e) {
        if (!this.isAuthenticated) return;
        
        const noteCard = e.target.closest('.note-card');
        if (!noteCard) return;

        const noteId = noteCard.dataset.noteId;
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        // Traffic light toggle
        if (e.target.closest('.traffic-light')) {
            e.preventDefault();
            await this.toggleNoteStatus(note);
            return;
        }

        // Save button
        if (e.target.closest('.save-btn')) {
            e.preventDefault();
            await this.saveNote(note);
            return;
        }

        // Move buttons
        if (e.target.closest('.move-up-btn')) {
            e.preventDefault();
            await this.moveNote(note, -1);
            return;
        }

        if (e.target.closest('.move-down-btn')) {
            e.preventDefault();
            await this.moveNote(note, 1);
            return;
        }

        // Expand/collapse
        if (e.target.closest('.expand-btn')) {
            e.preventDefault();
            this.toggleNoteExpansion(noteCard);
            return;
        }

        // Delete button
        if (e.target.closest('.delete-btn')) {
            e.preventDefault();
            this.confirmDeleteNote(note);
            return;
        }
    }

    /**
     * Handle global input events
     */
    handleGlobalInput(e) {
        if (!this.isAuthenticated) return;
        
        const noteCard = e.target.closest('.note-card');
        if (!noteCard) return;

        // Ignore input from completed (readonly) notes
        if (noteCard.classList.contains('completed')) {
            e.preventDefault();
            return;
        }

        const noteId = noteCard.dataset.noteId;
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        let changed = false;

        // Update note data based on field type
        if (e.target.classList.contains('note-title')) {
            note.title = e.target.textContent.trim() || 'Untitled';
            changed = true;
        } else if (e.target.classList.contains('note-description')) {
            const text = e.target.textContent.trim();
            if (text !== 'Add your description here.') {
                note.description = text;
                e.target.classList.remove('placeholder-text');
                changed = true;
            }
        } else if (e.target.classList.contains('note-tags')) {
            const text = e.target.textContent.trim();
            if (text !== 'Add tags here (comma-separated)') {
                note.tags = text;
                e.target.classList.remove('placeholder-text');
                changed = true;
            }
        } else if (e.target.classList.contains('note-comments')) {
            note.comments = e.target.value;
            changed = true;
        } else if (e.target.classList.contains('note-system')) {
            note.system = e.target.value;
            this.addSystemSuggestion(e.target.value);
            changed = true;
        } else if (e.target.classList.contains('note-due-date')) {
            // ADDED: Handle due date input (date only, no time)
            if (e.target.value) {
                // Convert date input to UTC timestamp at start of day
                const localDate = new Date(e.target.value + 'T00:00:00');
                note.dueDate = localDate.toISOString();
                
                // Check if overdue immediately
                note.isOverdue = PHTimezoneUtils.isPastDue(note.dueDate);
                note.overdueCheckedAt = new Date().toISOString();
                
                this.updateOverdueIndicator(noteCard, note.isOverdue);
            } else {
                note.dueDate = '';
                note.isOverdue = false;
                note.overdueCheckedAt = '';
                this.updateOverdueIndicator(noteCard, false);
            }
            changed = true;
        }

        if (changed) {
            this.markNoteAsChanged(note);
        }
    }

    /**
     * Handle focus events for placeholder text
     */
    handleFocusIn(e) {
        if (e.target.classList.contains('note-description')) {
            const text = e.target.textContent.trim();
            if (text === 'Add your description here.') {
                e.target.textContent = '';
                e.target.classList.remove('placeholder-text');
            }
        } else if (e.target.classList.contains('note-tags')) {
            const text = e.target.textContent.trim();
            if (text === 'Add tags here (comma-separated)') {
                e.target.textContent = '';
                e.target.classList.remove('placeholder-text');
            }
        }
    }

    /**
     * Handle focus out events for placeholder text
     */
    handleFocusOut(e) {
        if (e.target.classList.contains('note-description')) {
            const text = e.target.textContent.trim();
            if (text === '') {
                e.target.textContent = 'Add your description here.';
                e.target.classList.add('placeholder-text');
            }
        } else if (e.target.classList.contains('note-tags')) {
            const text = e.target.textContent.trim();
            if (text === '') {
                e.target.textContent = 'Add tags here (comma-separated)';
                e.target.classList.add('placeholder-text');
            }
        }
    }

    /**
     * Load notes from cloud storage
     */
    async loadNotesFromCloud() {
        if (!this.isAuthenticated) return;
        
        try {
            console.log('📥 Loading notes from cloud...');
            this.updateStatus('Loading notes...', 'info');
            
            const response = await fetch('/api/notes', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.clearAuthData();
                    this.showAuthPage();
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const notes = await response.json();
            
            // ADDED: Decrypt notes data after loading from cloud
            console.log('🔓 Decrypting loaded notes...');
            const decryptedNotes = await Promise.all(
                notes.map(note => this.decryptNoteData(note))
            );
            
            this.notes = this.sortNotes(decryptedNotes);
            
            // Extract system suggestions
            this.systemSuggestions.clear();
            this.notes.forEach(note => {
                if (note.system) {
                    this.addSystemSuggestion(note.system);
                }
            });

            this.renderNotes();
            this.updateStatus(`Loaded ${this.notes.length} notes successfully`, 'success');
            
            console.log(`✅ Loaded ${this.notes.length} notes from cloud`);
        } catch (error) {
            console.error('❌ Error loading notes:', error);
            this.updateStatus(`Error loading notes: ${error.message}`, 'error');
            this.notes = [];
            this.renderNotes();
        }
    }

    /**
     * Sort notes by priority and completion status
     */
    sortNotes(notes) {
        return notes.sort((a, b) => {
            // Active notes first
            if (!a.done && b.done) return -1;
            if (a.done && !b.done) return 1;

            if (!a.done && !b.done) {
                // Sort active notes by priority, then by timestamp
                const priorityA = a.priority || 0;
                const priorityB = b.priority || 0;
                if (priorityA !== priorityB) {
                    return priorityA - priorityB;
                }
                return new Date(a.timestamp) - new Date(b.timestamp);
            }

            if (a.done && b.done) {
                // Sort completed notes by completion date (newest first)
                const dateA = new Date(a.dateDone || 0);
                const dateB = new Date(b.dateDone || 0);
                return dateB - dateA;
            }

            return 0;
        });
    }

    /**
     * Add a new note
     */
    async addNote() {
        if (!this.isAuthenticated) return;
        
        console.log('➕ Adding new note...');
        
        const newNote = {
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            title: 'New Note',
            description: '',
            tags: '',
            comments: '',
            system: '',
            done: false,
            dateDone: '',
            dateUndone: '',
            priority: 0,
            // Existing fields from your sheets
            userId: this.currentUser?.sub || '',
            userEmail: this.currentUser?.email || '',
            createdBy: this.currentUser?.name || this.currentUser?.email || '',
            lastModified: new Date().toISOString(),
            isShared: false,
            // ADDED: New due date fields with default tomorrow in PH time
            dueDate: (() => {
                // Get current PH time and add 1 day
                const phNow = new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Manila'}));
                phNow.setDate(phNow.getDate() + 1);
                phNow.setHours(0, 0, 0, 0);
                return phNow.toISOString();
            })(),
            isOverdue: false,
            overdueCheckedAt: ''
        };

        // Add to local array
        this.notes.unshift(newNote);
        this.renderNotes();
        
        this.updateStatus('Adding note...', 'info');

        try {
            // Save to cloud
            await this.sendToCloud('add', newNote);
            await this.reassignPriorities();
            this.updateStatus('Note added successfully!', 'success');
        } catch (error) {
            console.error('❌ Error adding note:', error);
            // Remove from local array on failure
            this.notes = this.notes.filter(n => n.id !== newNote.id);
            this.renderNotes();
            this.updateStatus('Failed to add note', 'error');
        }
    }

    /**
     * Toggle note completion status with read-only functionality
     */
    async toggleNoteStatus(note) {
        console.log(`🔄 Toggling status for note: ${note.title}`);
        
        const wasCompleted = note.done;
        const now = new Date().toISOString();
        
        // Update note status
        note.done = !note.done;
        
        if (note.done) {
            note.dateDone = now;
            note.dateUndone = '';
        } else {
            note.dateUndone = now;
            note.dateDone = '';
            
            // Move to top of active notes
            const noteIndex = this.notes.findIndex(n => n.id === note.id);
            if (noteIndex > -1) {
                this.notes.splice(noteIndex, 1);
                this.notes.unshift(note);
            }
        }

        // Update readonly state immediately
        const noteCard = document.querySelector(`[data-note-id="${note.id}"]`);
        if (noteCard) {
            if (note.done) {
                noteCard.classList.add('completed');
                this.setNoteReadonly(noteCard, true);
            } else {
                noteCard.classList.remove('completed');
                this.setNoteReadonly(noteCard, false);
            }
        }

        // Update UI immediately
        this.renderNotes();
        
        try {
            // Save to cloud
            await this.sendToCloud('update', note);
            
            if (!note.done) {
                await this.reassignPriorities();
            }
            
            const statusText = note.done ? 'completed (now read-only)' : 'reactivated (now editable)';
            this.updateStatus(`Note ${statusText}`, 'success');
        } catch (error) {
            console.error('❌ Error toggling note status:', error);
            // Revert on failure
            note.done = wasCompleted;
            if (wasCompleted) {
                note.dateDone = note.dateDone || now;
                note.dateUndone = '';
            } else {
                note.dateUndone = note.dateUndone || now;
                note.dateDone = '';
            }
            
            // Revert readonly state
            if (noteCard) {
                if (note.done) {
                    noteCard.classList.add('completed');
                    this.setNoteReadonly(noteCard, true);
                } else {
                    noteCard.classList.remove('completed');
                    this.setNoteReadonly(noteCard, false);
                }
            }
            
            this.renderNotes();
            this.updateStatus('Failed to update note status', 'error');
        }
    }

    /**
     * Set note fields to readonly or editable based on completion status
     */
    setNoteReadonly(noteCard, isReadonly) {
        const editableElements = noteCard.querySelectorAll('[contenteditable], input, textarea');
        const actionButtons = noteCard.querySelectorAll('.save-btn, .move-up-btn, .move-down-btn, .delete-btn');
        const readonlyIndicator = noteCard.querySelector('.readonly-indicator');
        
        editableElements.forEach(element => {
            if (isReadonly) {
                // Make readonly
                if (element.hasAttribute('contenteditable')) {
                    element.setAttribute('contenteditable', 'false');
                } else {
                    element.setAttribute('readonly', true);
                    element.setAttribute('disabled', true);
                }
                element.style.pointerEvents = 'none';
                element.style.cursor = 'not-allowed';
            } else {
                // Make editable
                if (element.hasAttribute('contenteditable')) {
                    element.setAttribute('contenteditable', 'true');
                } else {
                    element.removeAttribute('readonly');
                    element.removeAttribute('disabled');
                }
                element.style.pointerEvents = 'auto';
                element.style.cursor = 'text';
            }
        });
        
        // Hide/show action buttons
        actionButtons.forEach(button => {
            button.style.display = isReadonly ? 'none' : 'flex';
        });
        
        // Show/hide readonly indicator
        if (readonlyIndicator) {
            readonlyIndicator.classList.toggle('hidden', !isReadonly);
        }
    }

    /**
     * Move note up or down in priority
     */
    async moveNote(note, direction) {
        if (note.done) {
            this.updateStatus('Cannot reorder completed notes', 'warning');
            return;
        }

        console.log(`📊 Moving note: ${note.title} (direction: ${direction})`);
        
        const activeNotes = this.notes.filter(n => !n.done);
        const currentIndex = activeNotes.findIndex(n => n.id === note.id);
        const newIndex = currentIndex + direction;

        // Check bounds
        if (newIndex < 0 || newIndex >= activeNotes.length) {
            console.log('📊 Move blocked - out of bounds');
            return;
        }

        // Swap notes
        const targetNote = activeNotes[newIndex];
        const noteIndex = this.notes.findIndex(n => n.id === note.id);
        const targetIndex = this.notes.findIndex(n => n.id === targetNote.id);

        // Swap in main array
        [this.notes[noteIndex], this.notes[targetIndex]] = [this.notes[targetIndex], this.notes[noteIndex]];

        this.renderNotes();
        
        try {
            await this.reassignPriorities();
            this.updateStatus('Note moved successfully', 'success');
        } catch (error) {
            console.error('❌ Error moving note:', error);
            this.updateStatus('Failed to update note order', 'error');
        }
    }

    /**
     * Save a specific note
     */
    async saveNote(note) {
        console.log(`💾 Saving note: ${note.title}`);
        
        try {
            await this.sendToCloud('update', note);
            this.pendingChanges.delete(note.id);
            this.updateSaveButtons();
            this.showSaveIndicator(note.id);
            this.updateStatus('Note saved successfully', 'success');
        } catch (error) {
            console.error('❌ Error saving note:', error);
            this.updateStatus('Failed to save note', 'error');
        }
    }

    /**
     * Confirm and delete a note
     */
    confirmDeleteNote(note) {
        this.showModal(
            `Are you sure you want to delete "${note.title}"?`,
            async () => {
                await this.deleteNote(note);
            }
        );
    }

    /**
     * Delete a note
     */
    async deleteNote(note) {
        console.log(`🗑️ Deleting note: ${note.title}`);
        
        try {
            await this.sendToCloud('delete', { id: note.id });
            this.notes = this.notes.filter(n => n.id !== note.id);
            this.pendingChanges.delete(note.id);
            this.renderNotes();
            this.updateStatus('Note deleted successfully', 'success');
        } catch (error) {
            console.error('❌ Error deleting note:', error);
            this.updateStatus('Failed to delete note', 'error');
        }
    }

    /**
     * Toggle note expansion
     */
    toggleNoteExpansion(noteCard) {
        const noteBody = noteCard.querySelector('.note-body');
        const expandBtn = noteCard.querySelector('.expand-btn');
        
        if (!noteBody || !expandBtn) return;

        const isExpanded = noteBody.classList.contains('expanded');
        
        if (isExpanded) {
            noteBody.classList.remove('expanded');
            expandBtn.textContent = '▸';
            expandBtn.title = 'Expand';
        } else {
            noteBody.classList.add('expanded');
            expandBtn.textContent = '▾';
            expandBtn.title = 'Collapse';
        }
        
        console.log(`📖 Note ${isExpanded ? 'collapsed' : 'expanded'}`);
    }

    /**
     * Perform search
     */
    performSearch() {
        this.currentSearch = this.elements.searchInput?.value.trim() || '';
        console.log(`🔍 Searching for: ${this.currentSearch}`);
        this.renderNotes();
        
        if (this.currentSearch) {
            this.updateStatus(`Searching for: ${this.currentSearch}`, 'info');
        } else {
            this.updateStatus('Showing all notes', 'info');
        }
    }

    /**
     * Clear search
     */
    clearSearch() {
        this.currentSearch = '';
        if (this.elements.searchInput) {
            this.elements.searchInput.value = '';
        }
        this.renderNotes();
        this.updateStatus('Search cleared', 'info');
    }

    /**
     * Mark note as changed
     */
    markNoteAsChanged(note) {
        this.pendingChanges.add(note.id);
        this.updateSaveButtons();
    }

    /**
     * Update save button states
     */
    updateSaveButtons() {
        document.querySelectorAll('.save-btn').forEach(btn => {
            const noteCard = btn.closest('.note-card');
            const noteId = noteCard?.dataset.noteId;
            
            if (this.pendingChanges.has(noteId)) {
                btn.classList.remove('hidden');
                btn.disabled = false;
            } else {
                btn.classList.add('hidden');
                btn.disabled = true;
            }
        });
    }

    /**
     * Show save indicator
     */
    showSaveIndicator(noteId) {
        const noteCard = document.querySelector(`[data-note-id="${noteId}"]`);
        const indicator = noteCard?.querySelector('.save-indicator');
        
        if (indicator) {
            indicator.classList.add('show');
            setTimeout(() => {
                indicator.classList.remove('show');
            }, 2000);
        }
    }

    /**
     * Add system suggestion
     */
    addSystemSuggestion(system) {
        if (!system || !system.trim()) return;
        
        const trimmed = system.trim();
        if (!this.systemSuggestions.has(trimmed)) {
            this.systemSuggestions.add(trimmed);
            this.updateSystemDatalist();
        }
    }

    /**
     * Update system datalist
     */
    updateSystemDatalist() {
        if (!this.elements.systemDatalist) return;
        
        this.elements.systemDatalist.innerHTML = '';
        Array.from(this.systemSuggestions).sort().forEach(system => {
            const option = document.createElement('option');
            option.value = system;
            this.elements.systemDatalist.appendChild(option);
        });
    }

    /**
     * Reassign priorities to all active notes
     */
    async reassignPriorities() {
        console.log('📊 Reassigning priorities...');
        
        const activeNotes = this.notes.filter(n => !n.done);
        const updates = [];
        
        activeNotes.forEach((note, index) => {
            const newPriority = index * 1000;
            if (note.priority !== newPriority) {
                note.priority = newPriority;
                updates.push(this.sendToCloud('update', note));
            }
        });
        
        if (updates.length > 0) {
            await Promise.all(updates);
        }
    }

    /**
     * Filter notes for display
     */
    filterNotes() {
        if (!this.currentSearch) return this.notes;
        
        const searchTags = this.currentSearch.toLowerCase()
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0);
        
        return this.notes.filter(note => {
            const noteTags = (note.tags || '').toLowerCase()
                .split(',')
                .map(tag => tag.trim());
            
            return searchTags.some(searchTag => 
                noteTags.some(noteTag => noteTag.includes(searchTag))
            );
        });
    }

    /**
     * Render all notes
     */
    renderNotes() {
        console.log('🎨 Rendering notes...');
        
        const filteredNotes = this.filterNotes();
        const activeNotes = filteredNotes.filter(n => !n.done);
        const completedNotes = filteredNotes.filter(n => n.done);
        
        // Render active notes with order numbers
        this.renderNotesList(activeNotes, this.elements.activeNotesContainer, true);
        
        // Render completed notes without order numbers
        this.renderNotesList(completedNotes, this.elements.completedNotesContainer, false);
        
        // Show/hide completed section
        if (this.elements.completedSection) {
            this.elements.completedSection.classList.toggle('hidden', completedNotes.length === 0);
        }
        
        // Update save buttons
        this.updateSaveButtons();
        
        // Update status if not searching
        if (!this.currentSearch && this.isAuthenticated) {
            this.updateStatus(`${activeNotes.length} active, ${completedNotes.length} completed`, 'info');
        }
    }

    /**
     * Render notes list to container
     */
    renderNotesList(notes, container, showOrderNumbers = false) {
        if (!container) return;
        
        container.innerHTML = '';
        notes.forEach((note, index) => {
            const orderNumber = showOrderNumbers ? index + 1 : null;
            const noteElement = this.createNoteElement(note, orderNumber);
            container.appendChild(noteElement);
        });
    }

    /**
     * Create a note element with read-only support
     */
    createNoteElement(note, orderNumber = null) {
        const template = this.elements.noteTemplate;
        if (!template) return document.createElement('div');
        
        const noteElement = template.content.cloneNode(true);
        const noteCard = noteElement.querySelector('.note-card');
        
        // Set note ID
        noteCard.dataset.noteId = note.id;
        
        // Set completed state and readonly
        if (note.done) {
            noteCard.classList.add('completed');
            // Set readonly after DOM insertion
            setTimeout(() => this.setNoteReadonly(noteCard, true), 0);
        } else {
            noteCard.classList.remove('completed');
            setTimeout(() => this.setNoteReadonly(noteCard, false), 0);
        }
        
        // Set traffic light
        const trafficLight = noteCard.querySelector('.traffic-light');
        if (trafficLight) {
            trafficLight.classList.add(note.done ? 'completed' : 'active');
            trafficLight.title = note.done ? 'Mark as Active' : 'Mark as Completed';
        }
        
        // Set title
        const titleElement = noteCard.querySelector('.note-title');
        if (titleElement) {
            titleElement.textContent = note.title || 'Untitled';
        }
        
        // Set metadata (order number and timestamp)
        const orderElement = noteCard.querySelector('.note-order');
        const timestampElement = noteCard.querySelector('.note-timestamp');
        
        if (note.done) {
            // For completed notes, show completion timestamp
            if (orderElement) {
                orderElement.classList.add('hidden');
            }
            if (timestampElement) {
                timestampElement.textContent = `Completed: ${this.formatTimestamp(note.dateDone)}`;
            }
        } else {
            // For active notes, show order number and creation timestamp
            if (orderElement && orderNumber !== null) {
                orderElement.textContent = `#${orderNumber} • `;
                orderElement.classList.remove('hidden');
            }
            if (timestampElement) {
                timestampElement.textContent = `Created: ${this.formatTimestamp(note.timestamp)}`;
            }
        }
        
        // Set description
        const descriptionElement = noteCard.querySelector('.note-description');
        if (descriptionElement) {
            if (note.description && note.description.trim()) {
                descriptionElement.textContent = note.description;
                descriptionElement.classList.remove('placeholder-text');
            } else {
                descriptionElement.textContent = 'Add your description here.';
                descriptionElement.classList.add('placeholder-text');
            }
        }
        
        // Set tags
        const tagsElement = noteCard.querySelector('.note-tags');
        if (tagsElement) {
            if (note.tags && note.tags.trim()) {
                tagsElement.textContent = note.tags;
                tagsElement.classList.remove('placeholder-text');
            } else {
                tagsElement.textContent = 'Add tags here (comma-separated)';
                tagsElement.classList.add('placeholder-text');
            }
        }
        
        // Set comments
        const commentsElement = noteCard.querySelector('.note-comments');
        if (commentsElement) {
            commentsElement.value = note.comments || '';
        }
        
        // Set system
        const systemElement = noteCard.querySelector('.note-system');
        if (systemElement) {
            systemElement.value = note.system || '';
        }
        
        // ADDED: Set due date
        const dueDateElement = noteCard.querySelector('.note-due-date');
        if (dueDateElement) {
            dueDateElement.value = PHTimezoneUtils.formatDueDateForInput(note.dueDate);
        }
        
        // ADDED: Set overdue indicator
        this.updateOverdueIndicator(noteCard, note.isOverdue || false);
        
        return noteElement;
    }

    /**
     * Send data to cloud with authentication
     */

    /**
 * Send data to cloud with detailed error handling
 */
async sendToCloud(action, data) {
    console.log(`☁️ Sending ${action} to cloud...`);
    // UPDATED: Modified log message to indicate encryption will happen
    console.log('📤 Data being sent (before encryption):', data);
    
    try {
        // ADDED: Encrypt sensitive note data before sending to cloud
        const encryptedData = await this.encryptNoteData(data);
        console.log('🔐 Data encrypted for cloud storage');
        
        const response = await fetch('/api/update-note', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`
            },
            // UPDATED: Send encrypted data instead of raw data
            body: JSON.stringify({ action, note: encryptedData })
        });
        
        console.log('📊 Response status:', response.status);
        console.log('📊 Response headers:', [...response.headers.entries()]);
        
        if (response.status === 401) {
            this.clearAuthData();
            this.showAuthPage();
            throw new Error('Authentication expired - please sign in again');
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('❌ Backend error:', errorData);
            
            const errorMessage = errorData.details || errorData.error || `HTTP ${response.status}: ${response.statusText}`;
            throw new Error(`Backend error: ${errorMessage}`);
        }
        
        const result = await response.json();
        console.log('✅ Backend response:', result);
        
        if (!result.success) {
            const errorMessage = result.message || result.error || 'Operation failed';
            console.error('❌ Operation unsuccessful:', result);
            throw new Error(`Apps Script error: ${errorMessage}`);
        }
        
        console.log('✅ Cloud operation successful');
        return result;
        
    } catch (error) {
        console.error('❌ sendToCloud error:', {
            action,
            data,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

  /**
     * END Send data to cloud with authentication
     */

    // ADDED: Encrypt note data before sending to cloud
    async encryptNoteData(note) {
        if (!this.encryptionManager.isInitialized) {
            console.warn('⚠️ Encryption not initialized, sending data unencrypted');
            return note;
        }

        try {
            const encryptedNote = { ...note };
            
            // Encrypt sensitive fields only
            if (note.title) {
                encryptedNote.title = await this.encryptionManager.encrypt(note.title);
            }
            if (note.description) {
                encryptedNote.description = await this.encryptionManager.encrypt(note.description);
            }
            if (note.comments) {
                encryptedNote.comments = await this.encryptionManager.encrypt(note.comments);
            }
            
            return encryptedNote;
        } catch (error) {
            console.error('❌ Failed to encrypt note data:', error);
            throw new Error('Encryption failed');
        }
    }

    // ADDED: Decrypt note data after loading from cloud
    async decryptNoteData(note) {
        console.log('🔓 decryptNoteData called for note:', note.id);
        console.log('🔍 Note title type/value:', typeof note.title, note.title);
        console.log('🔍 Note description type/value:', typeof note.description, note.description);
        console.log('🔍 Note comments type/value:', typeof note.comments, note.comments);
        console.log('🔍 Encryption manager initialized:', this.encryptionManager.isInitialized);
        
        if (!this.encryptionManager.isInitialized) {
            console.warn('⚠️ Encryption not initialized, returning data as-is');
            return note;
        }

        try {
            const decryptedNote = { ...note };
            
            // Decrypt sensitive fields if they are encrypted
            console.log('🔍 Checking if title is encrypted:', this.encryptionManager.isEncrypted(note.title));
            if (this.encryptionManager.isEncrypted(note.title)) {
                console.log('🔓 Decrypting title...');
                decryptedNote.title = await this.encryptionManager.decrypt(note.title);
                console.log('✅ Title decrypted:', decryptedNote.title);
            }
            
            console.log('🔍 Checking if description is encrypted:', this.encryptionManager.isEncrypted(note.description));
            if (this.encryptionManager.isEncrypted(note.description)) {
                console.log('🔓 Decrypting description...');
                decryptedNote.description = await this.encryptionManager.decrypt(note.description);
                console.log('✅ Description decrypted:', decryptedNote.description);
            }
            
            console.log('🔍 Checking if comments is encrypted:', this.encryptionManager.isEncrypted(note.comments));
            if (this.encryptionManager.isEncrypted(note.comments)) {
                console.log('🔓 Decrypting comments...');
                decryptedNote.comments = await this.encryptionManager.decrypt(note.comments);
                console.log('✅ Comments decrypted:', decryptedNote.comments);
            }
            
            console.log('✅ Decryption process completed');
            return decryptedNote;
        } catch (error) {
            console.error('❌ Failed to decrypt note data:', error);
            // Return original data if decryption fails (backward compatibility)
            return note;
        }
    }


    /**
     * Show modal
     */
    showModal(message, onConfirm) {
        if (!this.elements.modalOverlay) return;
        
        this.elements.modalMessage.textContent = message;
        this.elements.modalOverlay.classList.add('show');
        
        // Set up confirm handler
        const confirmHandler = () => {
            this.hideModal();
            onConfirm();
        };
        
        this.elements.modalConfirm.onclick = confirmHandler;
    }

    /**
     * Hide modal
     */
    hideModal() {
        if (this.elements.modalOverlay) {
            this.elements.modalOverlay.classList.remove('show');
        }
    }

    /**
     * Update status message
     */
    updateStatus(message, type = 'info') {
        if (!this.elements.statusMessage) return;
        
        this.elements.statusMessage.textContent = message;
        this.elements.statusMessage.className = `mb-4 text-center text-sm ${type}`;
        
        console.log(`📢 Status: ${message} (${type})`);
    }

    /**
     * Format timestamp to MM/DD/YYYY HH:MM:SS AM/PM
     */
    formatTimestamp(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '';
        
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be 12
        hours = String(hours).padStart(2, '0');
        
        return `${month}/${day}/${year} ${hours}:${minutes}:${seconds} ${ampm}`;
    }

    /**
     * Generate unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

/**
 * Global function for Google Sign-In callback
 */
window.handleGoogleSignIn = async function(response) {
    console.log('🔐 Google Sign-In response received');
    
    if (!window.notesApp) {
        console.error('❌ Notes app not initialized');
        return;
    }
    
    window.notesApp.showAuthLoading();
    
    try {
        // Send token to backend for verification
        const authResponse = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token: response.credential })
        });
        
        if (!authResponse.ok) {
            const error = await authResponse.json();
            throw new Error(error.error || 'Authentication failed');
        }
        
        const authData = await authResponse.json();
        
        // Store authentication data
        window.notesApp.currentUser = authData.user;
        window.notesApp.authToken = authData.token;
        window.notesApp.isAuthenticated = true;
        
        localStorage.setItem('authToken', authData.token);
        localStorage.setItem('currentUser', JSON.stringify(authData.user));
        
        console.log('✅ Authentication successful');
        
        // Initialize encryption with user's Google ID
        await window.notesApp.encryptionManager.initialize(authData.user.sub);
        
        // Show app and load notes
        window.notesApp.hideAuthLoading();
        window.notesApp.showApp();
        await window.notesApp.loadNotesFromCloud();
        
        // ADDED: Start overdue checking after notes are loaded
        window.notesApp.startOverdueChecking();
        
    } catch (error) {
        console.error('❌ Authentication error:', error);
        window.notesApp.hideAuthLoading();
        window.notesApp.updateStatus(`Authentication failed: ${error.message}`, 'error');
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.notesApp = new NotesApp();
    
    // Test malformed parsing functionality (v2)
    console.log('🧪 Testing encryption parsing at startup v2...');
    if (window.notesApp.encryptionManager) {
        window.notesApp.encryptionManager.testMalformedParsing();
    }
});

// Handle page unload
window.addEventListener('beforeunload', (e) => {
    if (window.notesApp?.pendingChanges.size > 0) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
    }
    
    // ADDED: Clear encryption key from memory on page unload for security
    if (window.notesApp?.encryptionManager) {
        window.notesApp.encryptionManager.clear();
    }
});