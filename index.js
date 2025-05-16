/**
 * MLPCHAG Character Search Extension for SillyTavern
 * This extension allows users to search and import characters from the MLPCHAG database.
 * 
 * Features include:
 * - Character browsing with thumbnails
 * - Advanced filtering by tags and categories
 * - Character preview with detailed information
 * - Direct download and import to SillyTavern
 * - Responsive design for all device sizes
 * 
 * @author LovemakingWithAIMares
 * @version 1.1.0
 */

import {
    processDroppedFiles,
    callPopup
} from "../../../../script.js";
import { debounce } from "../../../utils.js";
import { extension_settings } from "../../../extensions.js";

// ==========================================================================
// Constants and Configuration
// ==========================================================================

const extensionName = "SillyTavern-MLPCHAG-Search";

// API Endpoints
const API_ENDPOINT = "https://mlpchag.neocities.org";
const MARES_ENDPOINT = `${API_ENDPOINT}/mares.json`;

/**
 * Category definitions with their display properties
 */
const CATEGORIES = [
    { id: 'nsfw', label: 'NSFW', color: '#ff6b6b' },
    { id: 'eqg', label: 'EQG', color: '#45b7d1' },
    { id: 'anthro', label: 'Anthro', color: '#4ecdc4' },
];

/**
 * Tag definitions with their display properties
 */
const TAGS = [
    { id: 'simulation', label: 'Simulation', color: '#ffd351' },
    { id: 'mare', label: 'Mare', color: '#ffb6c1' },
    { id: 'stallion', label: 'Stallion', color: '#7ba7ff' },
    { id: 'foal', label: 'Foal', color: '#a8e4ff' },
    { id: 'canon', label: 'Canon', color: '#e2b5ff' },
    { id: 'oc', label: 'OC', color: '#ffc182' },
    { id: 'mane6', label: 'Mane 6', color: '#ff9ecd' },
    { id: 'princess', label: 'Princess', color: '#ffe066' },
    { id: 'background', label: 'Background Pony', color: '#b3997a' },
    { id: 'villain', label: 'Villain', color: '#ff8080' },
    { id: 'earthpony', label: 'Earth Pony', color: '#d4a373' },
    { id: 'pegasus', label: 'Pegasus', color: '#9ed5ff' },
    { id: 'unicorn', label: 'Unicorn', color: '#c8a4ff' },
    { id: 'alicorn', label: 'Alicorn', color: '#dda5dd' },
    { id: 'creature', label: 'Creature', color: '#90b890' },
    { id: 'g5', label: 'G5', color: '#ffb3b3' },
    { id: 'alternate', label: 'Alternate', color: '#98e8e8' },
].map(tag => ({ ...tag, selected: false }));

/**
 * Default extension settings
 */
const defaultSettings = {
    findCount: 30, // Number of characters to display per page
    defaultSort: 'dateupdate', // Default sorting method
    showNSFW: false, // Whether to show NSFW content by default
    cacheEnabled: true, // Whether to cache character data
    autoLoadTags: true, // Whether to automatically load tag counts
    showTagCount: true, // Whether to show tag counts in the UI
};

// ==========================================================================
// Global State Variables
// ==========================================================================

let mlpcharacters = []; // Stores the full list of characters
let characterListContainer = null; // Reference to the character list DOM element
let selectedTags = []; // Currently selected tags for filtering
let tagCounts = {}; // Counts of characters per tag
let cachedData = null; // Cache for character data
let lastFetchTime = 0; // Timestamp of last data fetch
let batchMode = false; // Whether batch selection mode is active
let selectedPaths = []; // Paths selected for batch download
const CACHE_DURATION = 5 * 60 * 1000; // Cache duration in milliseconds (5 minutes)

/**
 * Sanitizes text to prevent XSS attacks
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeText(text) {
    if (!text) return '';
    return text
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==========================================================================
// Settings Management
// ==========================================================================

/**
 * Initializes extension settings with defaults if not present
 */
async function loadSettings() {
    if (!extension_settings.mlpchag) {
        console.log("Creating extension_settings.mlpchag");
        extension_settings.mlpchag = {};
    }

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (!extension_settings.mlpchag.hasOwnProperty(key)) {
            console.log(`Setting default for: ${key}`);
            extension_settings.mlpchag[key] = value;
        }
    }
}

// ==========================================================================
// Character Download Functionality
// ==========================================================================

/**
 * Downloads a character card from MLPCHAG and processes it
 * @param {string} cardPath - Path to the character card
 */
async function downloadCharacter(cardPath) {
    try {
        const imageUrl = `${API_ENDPOINT}/cards/${cardPath}`;
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const blob = await response.blob();
        const file = new File([blob], cardPath, { type: 'image/png' });
        
        processDroppedFiles([file]);
        toastr.success('Character downloaded successfully', '', { timeOut: 2000 });
    } catch (error) {
        console.error('Failed to download character:', error);
        toastr.error('Failed to download character');
    }
}

/**
 * Selects a random character from the current filtered list
 * @returns {Object|null} A random character or null if no characters available
 */
function getRandomCharacter() {
    if (!mlpcharacters || mlpcharacters.length === 0) {
        return null;
    }
    
    const filteredCharacters = [...mlpcharacters]; // Create a copy to avoid modifying original
    
    if (filteredCharacters.length === 0) {
        return null;
    }
    
    const randomIndex = Math.floor(Math.random() * filteredCharacters.length);
    return filteredCharacters[randomIndex];
}

// ==========================================================================
// UI Components
// ==========================================================================

/**
 * Creates the preview modal HTML for a character
 * @param {Object} character - Character data object
 * @returns {string} HTML string for the preview modal
 */
function createPreviewModal(character) {
    return `
    <div class="character-preview-modal">
        <div class="preview-content">
            <div class="preview-image-section">
                <img src="${sanitizeText(character.url)}" alt="${sanitizeText(character.name)}" class="preview-image">
                <div class="preview-header">
                    <h2 class="preview-name">${sanitizeText(character.name)}</h2>
                    <p class="preview-author">by ${sanitizeText(character.author)}</p>
                </div>
                <a href="#" class="download-button" data-path="${sanitizeText(character.path)}">
                    <i class="fa-solid fa-download"></i> Download
                </a>
            </div>
            
            <div class="preview-sections">
                ${character.description ? `
                    <div class="preview-section">
                        <div class="section-header">
                            <h3>Description</h3>
                        </div>
                        <div class="section-content">
                            <p>${sanitizeText(character.description)}</p>
                        </div>
                    </div>
                ` : ''}
                
                ${character.personality ? `
                    <div class="preview-section">
                        <div class="section-header">
                            <h3>Personality</h3>
                        </div>
                        <div class="section-content">
                            <p>${sanitizeText(character.personality)}</p>
                        </div>
                    </div>
                ` : ''}
                
                ${character.scenario ? `
                    <div class="preview-section">
                        <div class="section-header">
                            <h3>Scenario</h3>
                        </div>
                        <div class="section-content">
                            <p>${sanitizeText(character.scenario)}</p>
                        </div>
                    </div>
                ` : ''}
                
                ${character.greetings ? `
                    <div class="preview-section">
                        <div class="section-header">
                            <h3>Greetings</h3>
                        </div>
                        <div class="section-content greetings-content">
                            ${Array.isArray(character.greetings) ?
                                character.greetings.map((greeting, index) => `
                                    <div class="greeting ${index === 0 ? 'active' : ''}">${sanitizeText(greeting)}</div>
                                `).join('') :
                                `<div class="greeting active">${sanitizeText(character.greetings)}</div>`
                            }
                            ${Array.isArray(character.greetings) && character.greetings.length > 1 ? `
                                <div class="greeting-nav">
                                    ${character.greetings.map((_, index) => `
                                        <button class="greeting-dot ${index === 0 ? 'active' : ''}"
                                                data-index="${index}">
                                            ${index + 1}
                                        </button>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>

            <!-- Return to List button -->
            <div class="return-section" style="margin-top: 15px;">
                <button class="return-button">
                    <i class="fa-solid fa-arrow-left"></i> Return to List
                </button>
            </div>
        </div>
    </div>`;
}

// ==========================================================================
// Character List View Management
// ==========================================================================

/**
 * Updates the character list display in the UI
 * @param {Array} characters - Array of character objects to display
 */
function updateCharacterListInView(characters) {
    if (!characterListContainer) return;

    const characterElements = characters.map(char => {
        try {
            // Validate required character data
            if (!char.name || !char.author) {
                console.warn('Skipping character with missing data:', char);
                return '';
            }

            // Create tag elements if character has tags
            const tagElements = char.tags ? `
                <div class="character-tags">
                    ${char.tags.map(tag => `
                        <span class="character-tag" data-tag="${sanitizeText(tag)}">
                            ${sanitizeText(tag)} ${tagCounts[tag] ? `(${tagCounts[tag]})` : ''}
                        </span>
                    `).join('')}
                </div>
            ` : '';

            // Return the character card HTML
            return `
                <div class="character-list-item">
                    ${batchMode ? `<input type="checkbox" class="char-select" data-path="${sanitizeText(char.path)}" ${selectedPaths.includes(char.path) ? 'checked' : ''}>` : ''}
                    <img class="thumbnail"
                        src="${sanitizeText(char.url)}"
                        onerror="this.src='img/ai4.png'"
                        alt="${sanitizeText(char.name)}">
                    <div class="info">
                        <div class="name">${sanitizeText(char.name)}</div>
                        <div class="author">by ${sanitizeText(char.author)}</div>
                        <div class="description">${sanitizeText(char.description || '')}</div>
                        ${tagElements}
                    </div>
                    <div class="download-btn fa-solid fa-download" 
                        data-path="${sanitizeText(char.path)}" 
                        title="Download ${sanitizeText(char.name)}">
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error creating character element:', error, char);
            return '';
        }
    }).filter(Boolean); // Remove empty entries

    // Display message if no characters found
    if (characterElements.length === 0) {
        characterListContainer.innerHTML = '<div class="no-characters-found">No valid characters found</div>';
        return;
    }

    // Update the container with character elements
    characterListContainer.innerHTML = characterElements.join('');

    // Update tag count displays
    updateTagCountDisplay();
}

/**
 * Handles click events within the character list container
 * @param {Event} event - Click event
 */
async function handleCharacterListClick(event) {
    if (event.target.classList.contains('char-select')) {
        const checkbox = event.target;
        const path = checkbox.dataset.path;
        if (checkbox.checked) {
            if (!selectedPaths.includes(path)) {
                selectedPaths.push(path);
            }
        } else {
            selectedPaths = selectedPaths.filter(p => p !== path);
        }
        return;
    } else if (event.target.classList.contains('download-btn')) {
        // Handle direct download click
        downloadCharacter(event.target.getAttribute('data-path'));
    } else {
        // Handle character preview click
        const listItem = event.target.closest('.character-list-item');
        if (listItem) {
            await handleCharacterPreview(listItem);
        }
    }
}

/**
 * Handles the character preview modal display and interaction
 * @param {HTMLElement} listItem - The clicked character list item
 */
async function handleCharacterPreview(listItem) {
    const path = listItem.querySelector('.download-btn').getAttribute('data-path');
    try {
        const response = await fetch(`${API_ENDPOINT}/cards/${path}`);
        if (!response.ok) throw new Error('Failed to fetch character data');
        
        const character = mlpcharacters.find(char => char.path === path);
        if (character) {
            // Create and display the preview modal
            const modal = createPreviewModal(character);
            callPopup(modal, 'html');
            
            // Set up modal interactions
            setupPreviewModalInteractions();
        }
    } catch (error) {
        console.error('Error loading character preview:', error);
    }
}

/**
 * Sets up interactive elements within the preview modal
 */
function setupPreviewModalInteractions() {
    const modalElement = document.querySelector('.character-preview-modal');
    if (!modalElement) return;

    // Setup greeting navigation
    modalElement.querySelectorAll('.greeting-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const index = parseInt(dot.dataset.index);
            const section = dot.closest('.greetings-content');
            
            // Update greeting visibility
            section.querySelectorAll('.greeting').forEach(greeting => {
                greeting.classList.remove('active');
            });
            section.querySelectorAll('.greeting')[index].classList.add('active');
            
            // Update navigation dots
            section.querySelectorAll('.greeting-dot').forEach(d => {
                d.classList.remove('active');
            });
            dot.classList.add('active');
        });
    });

    // Setup download button
    modalElement.querySelector('.download-button')?.addEventListener('click', (e) => {
        e.preventDefault();
        const path = e.target.closest('.download-button').dataset.path;
        downloadCharacter(path);
    });

    // Setup "Return to List" button
    const returnBtn = modalElement.querySelector('.return-button');
    if (returnBtn) {
        returnBtn.addEventListener('click', (e) => {
            e.preventDefault();
            displayCharactersInListViewPopup();
        });
    }
}

/**
 * Updates the display of tag counts in the filter buttons
 */
function updateTagCountDisplay() {
    if (!extension_settings.mlpchag.showTagCount) {
        // Hide all tag counts if the setting is disabled
        document.querySelectorAll('.tag-count').forEach(span => {
            span.style.display = 'none';
        });
        return;
    }
    
    // Update tag buttons
    document.querySelectorAll('.tag-button').forEach(button => {
        const tagId = button.dataset.tag;
        const count = tagCounts[tagId] || 0;
        const countSpan = button.querySelector('.tag-count');
        
        if (countSpan) {
            countSpan.textContent = `(${count})`;
            countSpan.style.display = 'inline';
        }
    });
    
    // Update category buttons
    document.querySelectorAll('.category-button').forEach(button => {
        const categoryId = button.dataset.tag;
        const count = tagCounts[categoryId] || 0;
        const countSpan = button.querySelector('.tag-count');
        
        if (countSpan) {
            countSpan.textContent = `(${count})`;
            countSpan.style.display = 'inline';
        }
    });
}

// ==========================================================================
// Character Search and Filtering
// ==========================================================================

/**
 * Fetches and filters characters based on search criteria
 * @param {Object} options - Search options (searchTerm, page)
 * @returns {Array} Filtered and paginated character list
 */
async function fetchCharactersBySearch({ searchTerm, page = 1 }) {
    try {
        // Check if we have valid cached data
        const now = Date.now();
        const shouldUseCache = extension_settings.mlpchag.cacheEnabled && 
                            cachedData &&
                            (now - lastFetchTime < CACHE_DURATION);
                            
        let maresData, filters;
        
        if (shouldUseCache) {
            console.log('Using cached character data');
            [maresData, filters] = cachedData;
        } else {
            console.log('Fetching fresh character data');
            // Show loading indicator
            if (characterListContainer) {
                characterListContainer.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading characters...</p></div>';
            }
            
            // Fetch both character data and filters simultaneously
            const [maresResponse, filtersResponse] = await Promise.all([
                fetch(MARES_ENDPOINT, { cache: "no-cache" }),
                fetch(`${API_ENDPOINT}/assets/filters.json`, { cache: "no-cache" })
            ]);

            if (!maresResponse.ok) {
                throw new Error(`Failed to fetch characters: ${maresResponse.status} ${maresResponse.statusText}`);
            }
            if (!filtersResponse.ok) {
                throw new Error(`Failed to fetch filters: ${filtersResponse.status} ${filtersResponse.statusText}`);
            }

            [maresData, filters] = await Promise.all([
                maresResponse.json(),
                filtersResponse.json()
            ]);
            
            // Update cache
            cachedData = [maresData, filters];
            lastFetchTime = now;
        }

        // Process and filter characters
        let characters = Object.entries(maresData)
            .filter(([key, value]) => {
                // Basic validation
                if (!value || typeof value !== 'object' || !value.name || !value.author || value.error) {
                    return false;
                }

                const normalizedKey = key.replace(/\\/g, '/');
                const backslashKey = key.replace(/\//g, '\\');
                
                // Handle NSFW settings
                if (!extension_settings.mlpchag.showNSFW) {
                    const nsfwPaths = filters['nsfw'] || [];
                    if (nsfwPaths.some(path => path.replace(/\\/g, '/') === normalizedKey)) {
                        return false;
                    }
                }

                // Handle category filtering
                const isInAnyCategory = ['nsfw', 'anthro', 'eqg'].some(category => {
                    const categoryPaths = filters[category] || [];
                    return categoryPaths.some(path => path.replace(/\\/g, '/') === normalizedKey);
                });

                const selectedCategories = selectedTags.filter(tag => 
                    ['nsfw', 'anthro', 'eqg'].includes(tag));
                const selectedRegularTags = selectedTags.filter(tag => 
                    !['nsfw', 'anthro', 'eqg'].includes(tag));

                // Category filtering logic
                if (selectedCategories.length > 0) {
                    const isInSelectedCategory = selectedCategories.some(category => {
                        const categoryPaths = filters[category] || [];
                        return categoryPaths.some(path => 
                            path.replace(/\\/g, '/') === normalizedKey);
                    });
                    if (!isInSelectedCategory) {
                        return false;
                    }
                }

                // Regular tag filtering
                if (selectedRegularTags.length > 0) {
                    const cardTags = filters.tags[normalizedKey] || 
                                   filters.tags[backslashKey] || [];
                    return selectedRegularTags.every(tag => 
                        cardTags.some(cardTag => 
                            cardTag.toLowerCase() === tag.toLowerCase()
                        )
                    );
                }

                return true;
            })
            .map(([key, value]) => {
                // Transform character data
                const normalizedKey = key.replace(/\\/g, '/');
                const backslashKey = key.replace(/\//g, '\\');
                
                return {
                    ...value,
                    path: key,
                    url: `${API_ENDPOINT}/cards/${key}`,
                    name: value.name || 'Unknown',
                    author: value.author || 'Unknown',
                    description: value.description || '',
                    dateupdate: value.dateupdate || new Date().toISOString(),
                    datecreate: value.datecreate || value.dateupdate || new Date().toISOString(),
                    tags: filters.tags[normalizedKey] || filters.tags[backslashKey] || []
                };
            });

        // Store for global access
        mlpcharacters = characters;

        // Calculate tag counts
        updateTagCounts(characters, filters);

        // Apply search term filter if present
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            characters = characters.filter(char => 
                char.name.toLowerCase().includes(term) || 
                char.author.toLowerCase().includes(term)
            );
        }

        // Apply sorting
        applySorting(characters);

        // Apply pagination
        return paginateResults(characters, page);

    } catch (error) {
        console.error('Error fetching characters:', error);
        if (characterListContainer) {
            characterListContainer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        }
        throw error;
    }
}

/**
 * Updates the tag count statistics
 * @param {Array} characters - List of characters
 * @param {Object} filters - Filter definitions
 */
function updateTagCounts(characters, filters) {
    tagCounts = {};
    characters.forEach(char => {
        // Count regular tags
        char.tags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
        
        // Count special categories
        ['nsfw', 'anthro', 'eqg'].forEach(category => {
            const normalizedKey = char.path.replace(/\\/g, '/');
            const categoryPaths = filters[category] || [];
            if (categoryPaths.some(path => path.replace(/\\/g, '/') === normalizedKey)) {
                tagCounts[category] = (tagCounts[category] || 0) + 1;
            }
        });
    });
}

/**
 * Applies sorting to the character list
 * @param {Array} characters - List of characters to sort
 */
function applySorting(characters) {
    const sortSelect = document.getElementById('sortSelect');
    if (!sortSelect) return;

    const sortType = sortSelect.value;
    characters.sort((a, b) => {
        switch (sortType) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'author':
                return a.author.localeCompare(b.author);
            case 'datecreate':
                return new Date(b.datecreate) - new Date(a.datecreate);
            default:
                return new Date(b.dateupdate) - new Date(a.dateupdate);
        }
    });
}

/**
 * Paginates the character results
 * @param {Array} characters - Full list of characters
 * @param {number} page - Current page number
 * @returns {Array} Paginated subset of characters
 */
function paginateResults(characters, page) {
    const start = (page - 1) * extension_settings.mlpchag.findCount;
    const end = start + extension_settings.mlpchag.findCount;
    return characters.slice(start, end);
}

// ==========================================================================
// Search Execution and UI Updates
// ==========================================================================

/**
 * Executes the character search and updates the UI
 * @param {Object} options - Search options (searchTerm, page)
 */
async function executeCharacterSearch(options) {
    try {
        const characters = await fetchCharactersBySearch(options);
        
        if (characters && characters.length > 0) {
            updateCharacterListInView(characters);
        } else {
            handleNoSearchResults(options);
        }
    } catch (error) {
        console.error('Search error:', error);
        characterListContainer.innerHTML = '<div class="error">Error loading characters</div>';
    }
}

/**
 * Handles the case when no search results are found
 * @param {Object} options - Search options
 */
function handleNoSearchResults(options) {
    if (options.page === 1) {
        characterListContainer.innerHTML = '<div class="no-characters-found">No characters found</div>';
    } else {
        const prevPage = options.page - 1;
        document.getElementById('pageNumber').textContent = prevPage;
        executeCharacterSearch({ ...options, page: prevPage });
    }
}

// ==========================================================================
// Tag System Management
// ==========================================================================

/**
 * Sets up event handlers for tag filtering system
 */
function setupTagHandlers() {
    // Setup handlers for both regular tags and categories
    const allFilterButtons = document.querySelectorAll('.tag-button, .category-button');
    allFilterButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tagId = button.dataset.tag;
            button.classList.toggle('selected');
            
            // Update selected tags array
            selectedTags = Array.from(document.querySelectorAll('.tag-button.selected, .category-button.selected'))
                .map(btn => btn.dataset.tag);

            // Reset to first page and execute search
            resetPageAndSearch();
        });
    });

    // Setup clear filters button
    document.querySelector('.clear-tags-button')?.addEventListener('click', () => {
        selectedTags = [];
        document.querySelectorAll('.tag-button, .category-button').forEach(btn => {
            btn.classList.remove('selected');
        });
        resetPageAndSearch();
    });
}

/**
 * Resets page number and executes new search
 */
function resetPageAndSearch() {
    const pageNumberSpan = document.getElementById('pageNumber');
    if (pageNumberSpan) {
        pageNumberSpan.textContent = '1';
    }
    
    executeCharacterSearch({
        searchTerm: document.getElementById('characterSearchInput')?.value || '',
        page: 1
    });
}

// ==========================================================================
// Popup Display Management
// ==========================================================================

/**
 * Displays the character list view in a popup
 */
async function displayCharactersInListViewPopup() {
    const listLayout = generateListLayout();
    callPopup(listLayout, 'text', '', { wide: true });
    
    // Initialize containers and handlers
    characterListContainer = document.querySelector('.character-list-popup');
    if (characterListContainer && !characterListContainer.dataset.listenerAttached) {
        characterListContainer.addEventListener('click', handleCharacterListClick);
        characterListContainer.dataset.listenerAttached = 'true';
    }
    setupTagHandlers();
    await initializeSearchAndNavigation();
}

/**
 * Generates the HTML layout for the character list view
 * @returns {string} HTML string for the list layout
 */
function generateListLayout() {
    return `
    <div class="mlpchag-popup">
        <div class="search-header">
            <div class="search-controls">
                <div class="search-bar">
                    <input type="text" id="characterSearchInput" placeholder="Search for characters...">
                    <select id="sortSelect" class="sort-select">
                        <option value="dateupdate">Latest Updated</option>
                        <option value="datecreate">Latest Created</option>
                        <option value="name">Name (A-Z)</option>
                        <option value="author">Author (A-Z)</option>
                    </select>
                </div>
                <div class="action-buttons">
                    <button id="randomCharacterBtn" class="action-button">
                        <i class="fa-solid fa-dice"></i> Random
                    </button>
                    <button id="settingsToggleBtn" class="action-button">
                        <i class="fa-solid fa-cog"></i> Settings
                    </button>
                    <button id="batchToggleBtn" class="action-button">
                        <i class="fa-solid fa-list-check"></i> Batch download
                    </button>
                    <button id="downloadSelectedBtn" class="action-button" style="display:none;">
                        <i class="fa-solid fa-download"></i> Download selected
                    </button>
                </div>
                <div id="settingsPanel" class="settings-panel" style="display: none;">
                    <h3>Settings</h3>
                    <div class="settings-options">
                        <div class="setting-item">
                            <label for="showNSFW">Show NSFW content</label>
                            <input type="checkbox" id="showNSFW" ${extension_settings.mlpchag.showNSFW ? 'checked' : ''}>
                        </div>
                        <div class="setting-item">
                            <label for="cacheEnabled">Enable caching</label>
                            <input type="checkbox" id="cacheEnabled" ${extension_settings.mlpchag.cacheEnabled ? 'checked' : ''}>
                        </div>
                        <div class="setting-item">
                            <label for="showTagCount">Show tag counts</label>
                            <input type="checkbox" id="showTagCount" ${extension_settings.mlpchag.showTagCount ? 'checked' : ''}>
                        </div>
                        <div class="setting-item">
                            <label for="findCountSelect">Characters per page</label>
                            <select id="findCountSelect">
                                <option value="10" ${extension_settings.mlpchag.findCount === 10 ? 'selected' : ''}>10</option>
                                <option value="20" ${extension_settings.mlpchag.findCount === 20 ? 'selected' : ''}>20</option>
                                <option value="30" ${extension_settings.mlpchag.findCount === 30 ? 'selected' : ''}>30</option>
                                <option value="50" ${extension_settings.mlpchag.findCount === 50 ? 'selected' : ''}>50</option>
                            </select>
                        </div>
                    </div>
                    <button id="clearCacheBtn" class="clear-cache-button">Clear Cache</button>
                </div>
                <div class="tags-container">
                    <div class="categories-row">
                        ${CATEGORIES.map(category => `
                            <button class="category-button" 
                                data-tag="${category.id}"
                                style="--category-color: ${category.color}">
                                ${category.label} ${extension_settings.mlpchag.showTagCount ? `<span class="tag-count">(0)</span>` : ''}
                            </button>
                        `).join('')}
                    </div>
                    <div class="tags-divider">Types</div>
                    <div class="tags-row">
                        ${TAGS.map(tag => `
                            <button class="tag-button" 
                                data-tag="${tag.id}"
                                style="--tag-color: ${tag.color}">
                                ${tag.label} ${extension_settings.mlpchag.showTagCount ? `<span class="tag-count">(0)</span>` : ''}
                            </button>
                        `).join('')}
                    </div>
                    <button class="clear-tags-button">Clear All Filters</button>
                </div>
            </div>
        </div>
        <div class="scrollable-content">
            <div class="character-list-popup">
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p>Loading characters...</p>
                </div>
            </div>
        </div>
        <div class="search-footer">
            <div class="page-buttons">
                <button id="prevPageButton">
                    <i class="fa-solid fa-chevron-left"></i> Previous
                </button>
                <span id="pageNumber">1</span>
                <button id="nextPageButton">
                    Next <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
            <div class="search-stats">
                <span id="resultCount">0</span> characters found
            </div>
        </div>
    </div>`;
}

/**
 * Initializes search and navigation functionality
 */
async function initializeSearchAndNavigation() {
    let currentPage = 1;
    await executeCharacterSearch({ searchTerm: '', page: currentPage });

    const searchInput = document.getElementById('characterSearchInput');
    const sortSelect = document.getElementById('sortSelect');
    const prevButton = document.getElementById('prevPageButton');
    const nextButton = document.getElementById('nextPageButton');
    const pageNumberSpan = document.getElementById('pageNumber');
    const randomCharacterBtn = document.getElementById('randomCharacterBtn');
    const settingsToggleBtn = document.getElementById('settingsToggleBtn');
    const batchToggleBtn = document.getElementById('batchToggleBtn');
    const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const resultCountSpan = document.getElementById('resultCount');
    
    // Settings elements
    const showNSFWCheckbox = document.getElementById('showNSFW');
    const cacheEnabledCheckbox = document.getElementById('cacheEnabled');
    const showTagCountCheckbox = document.getElementById('showTagCount');
    const findCountSelect = document.getElementById('findCountSelect');
    const clearCacheBtn = document.getElementById('clearCacheBtn');

    // Update result count display
    if (resultCountSpan) {
        resultCountSpan.textContent = mlpcharacters.length;
    }

    // Setup search input handler
    if (searchInput) {
        const handleSearch = debounce(() => {
            currentPage = 1;
            pageNumberSpan.textContent = currentPage;
            executeCharacterSearch({ 
                searchTerm: searchInput.value,
                page: currentPage
            }).then(() => {
                if (resultCountSpan) {
                    resultCountSpan.textContent = mlpcharacters.length;
                }
            });
        }, 300);

        searchInput.addEventListener('input', handleSearch);
    }

    // Setup sort handler
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            executeCharacterSearch({
                searchTerm: searchInput.value,
                page: currentPage
            });
        });
    }

    // Setup random character button
    if (randomCharacterBtn) {
        randomCharacterBtn.addEventListener('click', () => {
            const randomChar = getRandomCharacter();
            if (randomChar) {
                // Show preview for the random character
                const modal = createPreviewModal(randomChar);
                callPopup(modal, 'html');
                setupPreviewModalInteractions();
            } else {
                toastr.error('No characters available for random selection');
            }
        });
    }

    // Batch mode toggle
    if (batchToggleBtn && downloadSelectedBtn) {
        batchToggleBtn.addEventListener('click', () => {
            batchMode = !batchMode;
            selectedPaths = [];
            downloadSelectedBtn.style.display = batchMode ? 'inline-flex' : 'none';
            updateCharacterListInView(mlpcharacters);
        });

        downloadSelectedBtn.addEventListener('click', async () => {
            for (const path of selectedPaths) {
                await downloadCharacter(path);
            }
        });
    }

    // Settings panel toggle
    if (settingsToggleBtn && settingsPanel) {
        settingsToggleBtn.addEventListener('click', () => {
            const isVisible = settingsPanel.style.display !== 'none';
            settingsPanel.style.display = isVisible ? 'none' : 'block';
        });
    }

    // Settings handlers
    if (showNSFWCheckbox) {
        showNSFWCheckbox.addEventListener('change', () => {
            extension_settings.mlpchag.showNSFW = showNSFWCheckbox.checked;
            resetPageAndSearch();
        });
    }

    if (cacheEnabledCheckbox) {
        cacheEnabledCheckbox.addEventListener('change', () => {
            extension_settings.mlpchag.cacheEnabled = cacheEnabledCheckbox.checked;
        });
    }

    if (showTagCountCheckbox) {
        showTagCountCheckbox.addEventListener('change', () => {
            extension_settings.mlpchag.showTagCount = showTagCountCheckbox.checked;
            
            // Toggle tag count display without reloading
            document.querySelectorAll('.tag-count').forEach(span => {
                span.style.display = showTagCountCheckbox.checked ? 'inline' : 'none';
            });
        });
    }

    if (findCountSelect) {
        findCountSelect.addEventListener('change', () => {
            extension_settings.mlpchag.findCount = parseInt(findCountSelect.value);
            resetPageAndSearch();
        });
    }

    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', () => {
            cachedData = null;
            lastFetchTime = 0;
            toastr.success('Cache cleared successfully');
            resetPageAndSearch();
        });
    }

    // Setup navigation handlers
    setupNavigationHandlers(prevButton, nextButton, pageNumberSpan, searchInput, currentPage, resultCountSpan);
}

/**
 * Sets up pagination navigation handlers
 */
function setupNavigationHandlers(prevButton, nextButton, pageNumberSpan, searchInput, currentPage, resultCountSpan) {
    if (prevButton) {
        prevButton.addEventListener('click', async () => {
            if (currentPage > 1) {
                currentPage--;
                pageNumberSpan.textContent = currentPage;
                await executeCharacterSearch({
                    searchTerm: searchInput.value,
                    page: currentPage
                });
            }
        });
    }

    if (nextButton) {
        nextButton.addEventListener('click', async () => {
            currentPage++;
            pageNumberSpan.textContent = currentPage;
            await executeCharacterSearch({
                searchTerm: searchInput.value,
                page: currentPage
            }).then(() => {
                if (resultCountSpan) {
                    resultCountSpan.textContent = mlpcharacters.length;
                }
            });
        });
    }
}

// ==========================================================================
// Initialization and Event Setup
// ==========================================================================

/**
 * Opens the character search popup
 */
function openSearchPopup() {
    displayCharactersInListViewPopup();
}

/**
 * Initialize the extension
 */
jQuery(async () => {
    // Add the search button to the UI
    $('#external_import_button').after(`
        <button id="search-mlpchag" class="menu_button" title="Search MLPCHAG">
            <i class="fas fa-horse"></i>
        </button>
    `);
    
    // Setup click handler
    $('#search-mlpchag').on('click', openSearchPopup);
    
    // Load extension settings
    await loadSettings();
});