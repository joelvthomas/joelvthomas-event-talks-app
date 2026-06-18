// Global App State
let appState = {
    releases: [],
    selectedIds: new Set(),
    searchQuery: '',
    filterType: 'all',
    activeTone: 'default'
};

// DOM Elements
const DOM = {
    syncTimeLabel: document.getElementById('sync-time-label'),
    btnRefresh: document.getElementById('btn-refresh'),
    searchInput: document.getElementById('search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    typeFilters: document.getElementById('type-filters'),
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    errorMessage: document.getElementById('error-message'),
    btnRetry: document.getElementById('btn-retry'),
    emptyState: document.getElementById('empty-state'),
    btnClearFilters: document.getElementById('btn-clear-filters'),
    releaseNotesContainer: document.getElementById('release-notes-container'),
    
    // Floating selection bar
    floatingBar: document.getElementById('floating-bar'),
    selectionCount: document.getElementById('selection-count'),
    btnClearSelection: document.getElementById('btn-clear-selection'),
    btnTweetSelected: document.getElementById('btn-tweet-selected'),
    
    // Modal
    tweetModal: document.getElementById('tweet-modal'),
    modalTitle: document.getElementById('modal-title'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCounter: document.getElementById('char-counter'),
    btnCopyClipboard: document.getElementById('btn-copy-clipboard'),
    btnPostX: document.getElementById('btn-post-x'),
    templateOptions: document.querySelector('.template-options'),
    
    // Toast
    toastContainer: document.getElementById('toast-container')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    fetchReleaseNotes(false);
});

// Event Bindings
function bindEvents() {
    // Refresh feed
    DOM.btnRefresh.addEventListener('click', () => fetchReleaseNotes(true));
    DOM.btnRetry.addEventListener('click', () => fetchReleaseNotes(true));
    
    // Search filter
    DOM.searchInput.addEventListener('input', (e) => {
        appState.searchQuery = e.target.value.trim().toLowerCase();
        toggleSearchClearButton();
        renderTimeline();
    });
    
    DOM.searchClearBtn.addEventListener('click', () => {
        DOM.searchInput.value = '';
        appState.searchQuery = '';
        toggleSearchClearButton();
        renderTimeline();
    });
    
    DOM.btnClearFilters.addEventListener('click', () => {
        DOM.searchInput.value = '';
        appState.searchQuery = '';
        appState.filterType = 'all';
        toggleSearchClearButton();
        
        // Reset active pill
        document.querySelectorAll('#type-filters .filter-pill').forEach(pill => {
            pill.classList.toggle('active', pill.dataset.type === 'all');
        });
        
        renderTimeline();
    });
    
    // Category pill filters
    DOM.typeFilters.addEventListener('click', (e) => {
        const pill = e.target.closest('.filter-pill');
        if (!pill) return;
        
        document.querySelectorAll('#type-filters .filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        
        appState.filterType = pill.dataset.type;
        renderTimeline();
    });
    
    // Selection floating bar actions
    DOM.btnClearSelection.addEventListener('click', deselectAll);
    DOM.btnTweetSelected.addEventListener('click', openTweetComposerForSelection);
    
    // Modal Controls
    DOM.btnCloseModal.addEventListener('click', closeTweetModal);
    
    // Close modal clicking outside
    DOM.tweetModal.addEventListener('click', (e) => {
        if (e.target === DOM.tweetModal) closeTweetModal();
    });
    
    // Character counter during edits
    DOM.tweetTextarea.addEventListener('input', () => {
        updateCharCounter();
    });
    
    // Tone template selector
    DOM.templateOptions.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-outline');
        if (!btn) return;
        
        document.querySelectorAll('.template-options .btn-outline').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        appState.activeTone = btn.dataset.template;
        regenerateTweetText();
    });
    
    // Clipboard copy
    DOM.btnCopyClipboard.addEventListener('click', copyTweetToClipboard);
    
    // Post to X
    DOM.btnPostX.addEventListener('click', postTweetToX);
}

// Fetch Release Notes
async function fetchReleaseNotes(forceRefresh = false) {
    showState('loading');
    DOM.btnRefresh.classList.add('loading');
    
    try {
        const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.status === 'success' || result.status === 'warning') {
            appState.releases = result.data || [];
            
            // Render sync timestamp
            if (result.last_updated) {
                const date = new Date(result.last_updated);
                DOM.syncTimeLabel.textContent = `Sync: ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
            } else {
                DOM.syncTimeLabel.textContent = 'Synced';
            }
            
            if (result.status === 'warning') {
                showToast(result.message || 'Serving offline cache', 'warning');
            } else if (forceRefresh) {
                showToast('Feed refreshed successfully', 'success');
            }
            
            // Preserve valid selections, discard others
            const validIds = new Set(appState.releases.map(r => r.id));
            appState.selectedIds = new Set([...appState.selectedIds].filter(id => validIds.has(id)));
            
            renderTimeline();
            updateFloatingSelectionBar();
        } else {
            throw new Error(result.message || 'Unknown server error');
        }
    } catch (error) {
        console.error('Error fetching release notes:', error);
        DOM.errorMessage.textContent = error.message || 'Could not connect to the BigQuery feeds API.';
        showState('error');
    } finally {
        DOM.btnRefresh.classList.remove('loading');
    }
}

// Show/Hide States
function showState(stateName) {
    DOM.loadingState.classList.toggle('hidden', stateName !== 'loading');
    DOM.errorState.classList.toggle('hidden', stateName !== 'error');
    DOM.emptyState.classList.toggle('hidden', stateName !== 'empty');
    DOM.releaseNotesContainer.classList.toggle('hidden', stateName !== 'data');
}

// Toggle Clear Search button
function toggleSearchClearButton() {
    if (appState.searchQuery.length > 0) {
        DOM.searchClearBtn.className = 'search-clear-visible';
    } else {
        DOM.searchClearBtn.className = 'search-clear-hidden';
    }
}

// Render the Timeline Release Notes
function renderTimeline() {
    // Filter the releases
    const filteredReleases = appState.releases.filter(item => {
        // Filter by update type
        const typeMatches = appState.filterType === 'all' || item.type.toLowerCase() === appState.filterType.toLowerCase();
        
        // Filter by keyword search query
        const textToSearch = `${item.type} ${item.date_display} ${item.content_text}`.toLowerCase();
        const searchMatches = !appState.searchQuery || textToSearch.includes(appState.searchQuery);
        
        return typeMatches && searchMatches;
    });
    
    if (filteredReleases.length === 0) {
        showState('empty');
        return;
    }
    
    showState('data');
    DOM.releaseNotesContainer.innerHTML = '';
    
    // Group notes by date
    const groups = {};
    filteredReleases.forEach(item => {
        const dateStr = item.date_display;
        if (!groups[dateStr]) {
            groups[dateStr] = [];
        }
        groups[dateStr].push(item);
    });
    
    // Render groups in feed chronological order (pre-sorted from feed)
    for (const [dateDisplay, items] of Object.entries(groups)) {
        const groupEl = document.createElement('div');
        groupEl.className = 'timeline-group';
        
        const headerEl = document.createElement('div');
        headerEl.className = 'timeline-date-header';
        headerEl.innerHTML = `<h2>${dateDisplay}</h2>`;
        groupEl.appendChild(headerEl);
        
        items.forEach(item => {
            const isSelected = appState.selectedIds.has(item.id);
            const cardEl = document.createElement('div');
            cardEl.className = `update-card ${isSelected ? 'selected' : ''}`;
            cardEl.dataset.id = item.id;
            
            // Format type badge class
            const badgeTypeClass = item.type.toLowerCase().replace(' ', '-');
            
            cardEl.innerHTML = `
                <div class="checkbox-column">
                    <div class="custom-checkbox" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                </div>
                <div class="card-content-column">
                    <div class="card-header-row">
                        <div class="tag-and-title">
                            <span class="type-badge ${badgeTypeClass}">${item.type}</span>
                        </div>
                        <span class="card-date">${item.date_display}</span>
                    </div>
                    <div class="card-body">
                        ${item.content_html}
                    </div>
                    <div class="card-footer">
                        <button class="btn-card-action tweet" title="Share this update on X/Twitter" data-id="${item.id}">
                            <svg class="x-logo-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2005/svg">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                            </svg>
                            <span>Share</span>
                        </button>
                    </div>
                </div>
            `;
            
            // Attach card selection listener
            cardEl.addEventListener('click', (e) => {
                // If user clicks a link or the share button inside the card, ignore selection toggle
                if (e.target.closest('a') || e.target.closest('.btn-card-action')) {
                    return;
                }
                toggleCardSelection(item.id, cardEl);
            });
            
            // Attach card single share action listener
            cardEl.querySelector('.btn-card-action.tweet').addEventListener('click', (e) => {
                e.stopPropagation();
                openTweetComposerForSingle(item);
            });
            
            groupEl.appendChild(cardEl);
        });
        
        DOM.releaseNotesContainer.appendChild(groupEl);
    }
}

// Selection Handlers
function toggleCardSelection(id, cardEl) {
    if (appState.selectedIds.has(id)) {
        appState.selectedIds.delete(id);
        cardEl.classList.remove('selected');
    } else {
        appState.selectedIds.add(id);
        cardEl.classList.add('selected');
    }
    updateFloatingSelectionBar();
}

function deselectAll() {
    appState.selectedIds.clear();
    document.querySelectorAll('.update-card').forEach(card => card.classList.remove('selected'));
    updateFloatingSelectionBar();
}

function updateFloatingSelectionBar() {
    const count = appState.selectedIds.size;
    DOM.selectionCount.textContent = count;
    
    if (count > 0) {
        DOM.floatingBar.classList.add('visible');
    } else {
        DOM.floatingBar.classList.remove('visible');
    }
}

// URL-Aware Character Counter Helper (Twitter/X count system)
function calculateTweetLength(text) {
    // X.com replaces all links with a t.co URL which is always 23 characters
    const urlRegex = /https?:\/\/[^\s]+/g;
    const replaced = text.replace(urlRegex, "12345678901234567890123");
    return replaced.length;
}

// Helper to truncate text at word boundaries
function truncateWords(text, maxLength) {
    if (text.length <= maxLength) return text;
    let truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
        truncated = truncated.substring(0, lastSpace);
    }
    return truncated + '...';
}

// Tweet Drafting Engine
let currentDraftConfig = {
    mode: 'single', // 'single' or 'multi'
    items: []       // parsed items
};

function openTweetComposerForSingle(item) {
    currentDraftConfig = {
        mode: 'single',
        items: [item]
    };
    
    // Force set modal UI tone button state to active default
    document.querySelectorAll('.template-options .btn-outline').forEach(b => {
        b.classList.toggle('active', b.dataset.template === 'default');
    });
    appState.activeTone = 'default';
    
    DOM.modalTitle.textContent = `Share BigQuery Update`;
    regenerateTweetText();
    openTweetModal();
}

function openTweetComposerForSelection() {
    if (appState.selectedIds.size === 0) return;
    
    const selectedItems = appState.releases.filter(item => appState.selectedIds.has(item.id));
    
    currentDraftConfig = {
        mode: selectedItems.length === 1 ? 'single' : 'multi',
        items: selectedItems
    };
    
    document.querySelectorAll('.template-options .btn-outline').forEach(b => {
        b.classList.toggle('active', b.dataset.template === 'default');
    });
    appState.activeTone = 'default';
    
    DOM.modalTitle.textContent = selectedItems.length === 1 ? 'Share BigQuery Update' : `Share ${selectedItems.length} BigQuery Updates`;
    regenerateTweetText();
    openTweetModal();
}

function regenerateTweetText() {
    const { mode, items } = currentDraftConfig;
    const tone = appState.activeTone;
    let text = '';
    
    if (mode === 'single') {
        const item = items[0];
        const date = item.date_display;
        const type = item.type.toUpperCase();
        
        // Clean summary for tweet
        let summary = item.content_text;
        // Strip trailing URLs parenthesized by the backend strip_html_tags, as we will attach the main direct link
        summary = summary.replace(/\s*\([^)]+https?:\/\/[^)]+\)/gi, '');
        summary = summary.replace(/\s+/g, ' ').trim();
        
        const link = item.link || "https://docs.cloud.google.com/bigquery/docs/release-notes";
        
        // Truncate summary to keep under Twitter limit depending on layout template
        switch (tone) {
            case 'concise':
                // Max length 160 characters for the summary
                const truncatedConcise = truncateWords(summary, 160);
                text = `BigQuery ${item.type} (${date}): ${truncatedConcise}\n\nRead more: ${link}`;
                break;
                
            case 'excited':
                const truncatedExcited = truncateWords(summary, 130);
                text = `Awesome BigQuery update! 🚀\n\n📅 Date: ${date}\n🛠️ Type: ${item.type}\n\n👉 ${truncatedExcited}\n\nDetails: ${link} #BigQuery #GoogleCloud #DataEngineering`;
                break;
                
            case 'formal':
                const truncatedFormal = truncateWords(summary, 140);
                text = `Google Cloud has published a BigQuery release note on ${date}.\n\nCategory: ${item.type}\n\nDetails: ${truncatedFormal}\n\nDocumentation: ${link}`;
                break;
                
            case 'default':
            default:
                const truncatedDefault = truncateWords(summary, 150);
                text = `BigQuery Release Note [${date}]:\n\n🚀 ${type}: ${truncatedDefault}\n\nLink: ${link} #BigQuery #GoogleCloud`;
                break;
        }
    } else {
        // Multi-select aggregator mode
        const count = items.length;
        const dateStr = items[0].date_display; // Use date of the first item as reference
        const link = "https://docs.cloud.google.com/bigquery/docs/release-notes";
        
        switch (tone) {
            case 'concise':
                text = `Latest BigQuery Updates (${dateStr}):\n`;
                items.forEach((item, index) => {
                    let summary = item.content_text.replace(/\s*\([^)]+https?:\/\/[^)]+\)/gi, '').replace(/\s+/g, ' ').trim();
                    const line = `- [${item.type}] ${truncateWords(summary, 45)}\n`;
                    if (calculateTweetLength(text + line + `\nDetails: ${link}`) < 280) {
                        text += line;
                    }
                });
                text += `\nDetails: ${link}`;
                break;
                
            case 'excited':
                text = `🔥 BigQuery drop! ${count} new updates today!\n\n`;
                items.forEach((item, index) => {
                    let summary = item.content_text.replace(/\s*\([^)]+https?:\/\/[^)]+\)/gi, '').replace(/\s+/g, ' ').trim();
                    const line = `⚡ ${item.type}: ${truncateWords(summary, 40)}\n`;
                    if (calculateTweetLength(text + line + `\n\nFull release notes here: ${link} #BigQuery #GCP`) < 280) {
                        text += line;
                    }
                });
                text += `\nRelease Notes: ${link} #BigQuery #GoogleCloud`;
                break;
                
            case 'formal':
                text = `Google Cloud BigQuery release updates summary for ${dateStr}.\n\n`;
                items.forEach((item, index) => {
                    let summary = item.content_text.replace(/\s*\([^)]+https?:\/\/[^)]+\)/gi, '').replace(/\s+/g, ' ').trim();
                    const line = `• ${item.type}: ${truncateWords(summary, 45)}\n`;
                    if (calculateTweetLength(text + line + `\nFull documentation: ${link}`) < 280) {
                        text += line;
                    }
                });
                text += `\nDocumentation: ${link}`;
                break;
                
            case 'default':
            default:
                text = `Summary of BigQuery Updates [${dateStr}]:\n\n`;
                items.forEach((item, index) => {
                    let summary = item.content_text.replace(/\s*\([^)]+https?:\/\/[^)]+\)/gi, '').replace(/\s+/g, ' ').trim();
                    const line = `🔹 ${item.type}: ${truncateWords(summary, 45)}\n`;
                    // Check if it fits
                    if (calculateTweetLength(text + line + `\nRelease notes: ${link} #BigQuery`) < 280) {
                        text += line;
                    }
                });
                text += `\nDetails: ${link} #BigQuery #GoogleCloud`;
                break;
        }
    }
    
    DOM.tweetTextarea.value = text;
    updateCharCounter();
}

function updateCharCounter() {
    const text = DOM.tweetTextarea.value;
    const length = calculateTweetLength(text);
    
    DOM.charCounter.textContent = `${length} / 280`;
    
    if (length > 280) {
        DOM.charCounter.classList.add('exceeded');
        DOM.btnPostX.disabled = true;
    } else {
        DOM.charCounter.classList.remove('exceeded');
        DOM.btnPostX.disabled = false;
    }
}

// Modal Animation controls
function openTweetModal() {
    DOM.tweetModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Lock background scroll
}

function closeTweetModal() {
    DOM.tweetModal.classList.add('hidden');
    document.body.style.overflow = '';
}

// Action Actions
async function copyTweetToClipboard() {
    const text = DOM.tweetTextarea.value;
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
    } catch (err) {
        console.error('Failed to copy text: ', err);
        showToast('Failed to copy to clipboard', 'error');
    }
}

function postTweetToX() {
    const text = DOM.tweetTextarea.value;
    const length = calculateTweetLength(text);
    
    if (length > 280) {
        showToast('Tweet exceeds X character limit!', 'error');
        return;
    }
    
    const shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(shareUrl, '_blank');
}

// Toast Notifications System
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let svgIcon = '';
    if (type === 'success') {
        svgIcon = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
        svgIcon = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else if (type === 'warning') {
        svgIcon = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else {
        svgIcon = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }
    
    toast.innerHTML = `
        ${svgIcon}
        <span class="toast-message">${message}</span>
    `;
    
    DOM.toastContainer.appendChild(toast);
    
    // Trigger transition Reflow
    toast.offsetHeight;
    toast.classList.add('visible');
    
    // Auto remove toast
    setTimeout(() => {
        toast.classList.remove('visible');
        toast.addEventListener('transitionend', () => {
            toast.remove();
        });
    }, 3500);
}
