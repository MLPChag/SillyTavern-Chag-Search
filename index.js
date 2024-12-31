// An extension that allows you to import characters from MLPCHAG.
import {
    getRequestHeaders,
    processDroppedFiles,
    callPopup
} from "../../../../script.js";
import { delay, debounce } from "../../../utils.js";
import { extension_settings } from "../../../extensions.js";

const extensionName = "SillyTavern-MLPCHAG-Search";
const extensionFolderPath = `scripts/extensions/${extensionName}/`;

// Endpoint for API call
const API_ENDPOINT = "https://mlpchag.neocities.org";
const MARES_ENDPOINT = `${API_ENDPOINT}/mares.json`;

const CATEGORIES = [
    { id: 'nsfw', label: 'NSFW', color: '#ff6b6b' },
    { id: 'eqg', label: 'EQG', color: '#45b7d1' },
    { id: 'anthro', label: 'Anthro', color: '#4ecdc4' },
];

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

const defaultSettings = {
    findCount: 30,
};

let mlpcharacters = [];
let characterListContainer = null;
let savedPopupContent = null;
let selectedTags = [];
let tagCounts = {};

/**
 * Asynchronously loads settings
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

/**
 * Downloads a character card from MLPCHAG
 */
async function downloadCharacter(cardPath) {
    try {
        const imageUrl = `${API_ENDPOINT}/cards/${cardPath}`;
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const blob = await response.blob();
        const file = new File([blob], cardPath, { type: 'image/png' });
        
        processDroppedFiles([file]);
    } catch (error) {
        console.error('Failed to download character:', error);
        toastr.error('Failed to download character');
    }
}
/**
 * Updates the character list view with provided characters
 */
function updateCharacterListInView(characters) {
    if (!characterListContainer) return;

    const sanitizeText = (text) => {
        if (!text) return '';
        return text
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    const characterElements = characters.map(char => {
        try {
            if (!char.name || !char.author) {
                console.warn('Skipping character with missing data:', char);
                return '';
            }

            const tagElements = char.tags ? `
                <div class="character-tags">
                    ${char.tags.map(tag => `
                        <span class="character-tag" data-tag="${sanitizeText(tag)}">
                            ${sanitizeText(tag)} ${tagCounts[tag] ? `(${tagCounts[tag]})` : ''}
                        </span>
                    `).join('')}
                </div>
            ` : '';

            return `
                <div class="character-list-item">
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
    }).filter(Boolean);

    if (characterElements.length === 0) {
        characterListContainer.innerHTML = '<div class="no-characters-found">No valid characters found</div>';
        return;
    }

    characterListContainer.innerHTML = characterElements.join('');

    // Update tag counts in buttons
    document.querySelectorAll('.tag-button').forEach(button => {
        const tagId = button.dataset.tag;
        const count = tagCounts[tagId] || 0;
        button.innerHTML = `${TAGS.find(t => t.id === tagId)?.label || tagId} (${count})`;
    });
}

/**
 * Fetches characters based on search term
 */
async function fetchCharactersBySearch({ searchTerm, page = 1 }) {
    try {
        const [maresResponse, filtersResponse] = await Promise.all([
            fetch(MARES_ENDPOINT),
            fetch(`${API_ENDPOINT}/assets/filters.json`)
        ]);

        if (!maresResponse.ok || !filtersResponse.ok) {
            throw new Error('Failed to fetch data');
        }

        const [maresData, filters] = await Promise.all([
            maresResponse.json(),
            filtersResponse.json()
        ]);

        let characters = Object.entries(maresData)
            .filter(([key, value]) => {
                if (!value || typeof value !== 'object' || !value.name || !value.author || value.error) {
                    return false;
                }

                const normalizedKey = key.replace(/\\/g, '/');
                const backslashKey = key.replace(/\//g, '\\');

                // Handle categories (nsfw, anthro, eqg)
                const isInAnyCategory = ['nsfw', 'anthro', 'eqg'].some(category => {
                    const categoryPaths = filters[category] || [];
                    return categoryPaths.some(path => path.replace(/\\/g, '/') === normalizedKey);
                });

                const selectedCategories = selectedTags.filter(tag => ['nsfw', 'anthro', 'eqg'].includes(tag));
                const selectedRegularTags = selectedTags.filter(tag => !['nsfw', 'anthro', 'eqg'].includes(tag));

                // If no categories selected, only show non-categorized cards
                if (selectedCategories.length === 0 && isInAnyCategory) {
                    return false;
                }

                // If categories are selected, show both non-categorized cards and cards from selected categories
                if (isInAnyCategory) {
                    const isInSelectedCategory = selectedCategories.some(category => {
                        const categoryPaths = filters[category] || [];
                        return categoryPaths.some(path => path.replace(/\\/g, '/') === normalizedKey);
                    });
                    if (!isInSelectedCategory) {
                        return false;
                    }
                }

                // Handle regular tags
                if (selectedRegularTags.length > 0) {
                    const cardTags = filters.tags[normalizedKey] || filters.tags[backslashKey] || [];
                    return selectedRegularTags.every(tag => 
                        cardTags.some(cardTag => 
                            cardTag.toLowerCase() === tag.toLowerCase()
                        )
                    );
                }

                return true;
            })
            .map(([key, value]) => {
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
                    tags: filters.tags[normalizedKey] || filters.tags[backslashKey] || []
                };
            });

        // Calculate tag counts
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

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            characters = characters.filter(char => 
                char.name.toLowerCase().includes(term) || 
                char.author.toLowerCase().includes(term)
            );
        }

        // Apply sorting
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
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

        const start = (page - 1) * extension_settings.mlpchag.findCount;
        const end = start + extension_settings.mlpchag.findCount;
        const paginatedCharacters = characters.slice(start, end);

        if (paginatedCharacters.length === 0 && page > 1) {
            return [];
        }

        return paginatedCharacters;

    } catch (error) {
        console.error('Error fetching characters:', error);
        throw error;
    }
}

async function executeCharacterSearch(options) {
    try {
        const characters = await fetchCharactersBySearch(options);
        
        if (characters && characters.length > 0) {
            updateCharacterListInView(characters);
        } else {
            if (options.page === 1) {
                characterListContainer.innerHTML = '<div class="no-characters-found">No characters found</div>';
            } else {
                const prevPage = options.page - 1;
                document.getElementById('pageNumber').textContent = prevPage;
                await executeCharacterSearch({ ...options, page: prevPage });
            }
        }
    } catch (error) {
        console.error('Search error:', error);
        characterListContainer.innerHTML = '<div class="error">Error loading characters</div>';
    }
}

function setupTagHandlers() {
    // Handle both regular tags and categories
    const allFilterButtons = document.querySelectorAll('.tag-button, .category-button');
    allFilterButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tagId = button.dataset.tag;
            button.classList.toggle('selected');
            
            selectedTags = Array.from(document.querySelectorAll('.tag-button.selected, .category-button.selected'))
                .map(btn => btn.dataset.tag);

            const pageNumberSpan = document.getElementById('pageNumber');
            if (pageNumberSpan) {
                pageNumberSpan.textContent = '1';
            }
            
            executeCharacterSearch({
                searchTerm: document.getElementById('characterSearchInput')?.value || '',
                page: 1
            });
        });
    });

    // Update clear tags button to handle categories too
    document.querySelector('.clear-tags-button')?.addEventListener('click', () => {
        selectedTags = [];
        document.querySelectorAll('.tag-button, .category-button').forEach(btn => {
            btn.classList.remove('selected');
        });
        executeCharacterSearch({
            searchTerm: document.getElementById('characterSearchInput')?.value || '',
            page: 1
        });
    });
}

async function displayCharactersInListViewPopup() {
    const listLayout = `
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
                <div class="tags-container">
                    <div class="categories-row">
                        ${CATEGORIES.map(category => `
                            <button class="category-button" 
                                data-tag="${category.id}"
                                style="--category-color: ${category.color}">
                                ${category.label}
                            </button>
                        `).join('')}
                    </div>
                    <div class="tags-divider">Types</div>
                    <div class="tags-row">
                        ${TAGS.map(tag => `
                            <button class="tag-button" 
                                data-tag="${tag.id}"
                                style="--tag-color: ${tag.color}">
                                ${tag.label}
                            </button>
                        `).join('')}
                    </div>
                    <button class="clear-tags-button">Clear All Filters</button>
                </div>
            </div>
        </div>
        <div class="scrollable-content">
            <div class="character-list-popup">
                <div class="loading-characters">Loading characters...</div>
            </div>
        </div>
        <div class="search-footer">
            <div class="page-buttons">
                <button id="prevPageButton">Previous</button>
                <span id="pageNumber">1</span>
                <button id="nextPageButton">Next</button>
            </div>
        </div>
    </div>
`;

    callPopup(listLayout, 'text', '', { wide: true });
    
    characterListContainer = document.querySelector('.character-list-popup');
    setupTagHandlers();
    let currentPage = 1;

    await executeCharacterSearch({ searchTerm: '', page: currentPage });

    const searchInput = document.getElementById('characterSearchInput');
    const sortSelect = document.getElementById('sortSelect');
    const prevButton = document.getElementById('prevPageButton');
    const nextButton = document.getElementById('nextPageButton');
    const pageNumberSpan = document.getElementById('pageNumber');

    if (searchInput) {
        const handleSearch = debounce(() => {
            currentPage = 1;
            pageNumberSpan.textContent = currentPage;
            executeCharacterSearch({ 
                searchTerm: searchInput.value,
                page: currentPage
            });
        }, 300);

        searchInput.addEventListener('input', handleSearch);
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            executeCharacterSearch({
                searchTerm: searchInput.value,
                page: currentPage
            });
        });
    }

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
            });
        });
    }

    characterListContainer.addEventListener('click', async function(event) {
        if (event.target.classList.contains('download-btn')) {
            downloadCharacter(event.target.getAttribute('data-path'));
        }
    });
}

function openSearchPopup() {
    displayCharactersInListViewPopup();
}

jQuery(async () => {
    $('#external_import_button').after(`
        <button id="search-mlpchag" class="menu_button" title="Search MLPCHAG">
            <i class="fas fa-horse"></i>
        </button>
    `);
    
    $('#search-mlpchag').on('click', openSearchPopup);
    await loadSettings();
});