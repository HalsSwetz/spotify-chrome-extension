let accessToken = null;
let selectedTrack = null;

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Selection screen loaded');

    await getAccessToken();
    
    if (accessToken) {
        await checkCurrentlyPlaying();
        
        setupSearch();
    } else {
        window.location.href = 'popup.html';
    }
});

async function getAccessToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['spotify_access_token'], function(result) {
            accessToken = result.spotify_access_token;
            console.log('Access token retrieved:', accessToken ? 'Yes' : 'No');
            resolve();
        });
    });
}

async function checkCurrentlyPlaying() {
    const loadingElement = document.getElementById('loadingCurrent');
    const currentTrackElement = document.getElementById('currentTrack');
    const noCurrentTrackElement = document.getElementById('noCurrentTrack');
    
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        loadingElement.classList.add('hidden');
        
        if (response.status === 200) {
            const data = await response.json();
            
            if (data && data.item) {
                displayCurrentTrack(data.item);
                currentTrackElement.classList.remove('hidden');
            } else {
                noCurrentTrackElement.classList.remove('hidden');
            }
        } else if (response.status === 204) {
            noCurrentTrackElement.classList.remove('hidden');
        } else {
            console.error('Error fetching currently playing:', response.status);
            noCurrentTrackElement.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error checking currently playing:', error);
        loadingElement.classList.add('hidden');
        noCurrentTrackElement.classList.remove('hidden');
    }
}

function displayCurrentTrack(track) {
    document.getElementById('currentTrackName').textContent = track.name;
    document.getElementById('currentArtistName').textContent = track.artists.map(artist => artist.name).join(', ');
    document.getElementById('currentAlbumName').textContent = track.album.name;
    
    const albumArt = track.album.images && track.album.images.length > 0 
        ? track.album.images[track.album.images.length - 1].url 
        : '';
    document.getElementById('currentAlbumArt').src = albumArt;
    
    selectedTrack = track;
    
    document.getElementById('useCurrentTrack').addEventListener('click', function() {
        proceedWithSelectedTrack(track);
    });
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    let searchTimeout;
    
    searchInput.addEventListener('input', function() {
        const query = searchInput.value.trim();
        
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        if (query.length < 2) {
            searchResults.classList.add('hidden');
            return;
        }
        
        searchTimeout = setTimeout(() => {
            performSearch(query);
        }, 300);
    });
}

async function performSearch(query) {
    const searchResults = document.getElementById('searchResults');
    
    try {
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            displaySearchResults(data.tracks.items);
        } else {
            console.error('Search error:', response.status);
            searchResults.innerHTML = '<div style="padding: 10px; text-align: center; color: #666;">Search error. Please try again.</div>';
            searchResults.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Search error:', error);
        searchResults.innerHTML = '<div style="padding: 10px; text-align: center; color: #666;">Search error. Please try again.</div>';
        searchResults.classList.remove('hidden');
    }
}

function displaySearchResults(tracks) {
    const searchResults = document.getElementById('searchResults');
    
    if (tracks.length === 0) {
        searchResults.innerHTML = '<div style="padding: 10px; text-align: center; color: #666;">No results found.</div>';
        searchResults.classList.remove('hidden');
        return;
    }
    
    const resultsHTML = tracks.map(track => {
        const albumArt = track.album.images && track.album.images.length > 0 
            ? track.album.images[track.album.images.length - 1].url 
            : '';
        
        const artists = track.artists.map(artist => artist.name).join(', ');
        
        return `
            <div class="search-result-item" data-track-id="${track.id}">
                <img class="result-album-art" src="${albumArt}" alt="Album Art" onerror="this.style.display='none'">
                <div class="result-details">
                    <h4>${track.name}</h4>
                    <p>${artists}</p>
                    <p>${track.album.name}</p>
                </div>
            </div>
        `;
    }).join('');
    
    searchResults.innerHTML = resultsHTML;
    searchResults.classList.remove('hidden');

    searchResults.querySelectorAll('.search-result-item').forEach((item, index) => {
        item.addEventListener('click', function() {
            const selectedTrackData = tracks[index];
            proceedWithSelectedTrack(selectedTrackData);
        });
    });
}

function proceedWithSelectedTrack(track) {
    console.log('Selected track:', track.name, 'by', track.artists.map(a => a.name).join(', '));
    
    chrome.storage.local.set({
        'selected_seed_track': track
    }, function() {
        console.log('Seed track stored');
        
        // TODO: Navigate to Mix CD generation screen
        // For now, show an alert
        alert(`Selected "${track.name}" by ${track.artists.map(a => a.name).join(', ')} as your seed track!\n\nNext: Generate Mix CD (screen not yet created)`);
        
        // Later this will be:
        // window.location.href = 'mixcd-generation.html';
    });
}

async function refreshTokenIfNeeded() {
    // This function can be implemented later if I need to handle token refresh
    // For now, if API calls fail due to expired token, redirect to popup
    console.log('Token refresh needed - redirecting to login');
    window.location.href = 'popup.html';
}