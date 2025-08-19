document.addEventListener('DOMContentLoaded', async () => {
    const statusEl = document.getElementById('loadingStatus');
    const albumContainerEl = document.getElementById('tracklistContent');

    if (!statusEl || !albumContainerEl) {
        console.error("DOM elements missing. Make sure 'loadingStatus' and 'tracklistContent' exist.");
        return;
    }

    statusEl.textContent = "Generating your personalized Mix CD...";

    try {
        const { spotify_access_token: accessToken, selected_seed_track: seedTrack } = await new Promise(resolve =>
            chrome.storage.local.get(['spotify_access_token', 'selected_seed_track'], resolve)
        );

        if (!accessToken || !seedTrack) {
            statusEl.textContent = 'Missing access token or seed track. Please select a track first.';
            return;
        }

        console.log("Using seed track ID:", seedTrack.id);
        const tracks = await generateAlbumFromTrack(seedTrack.id, accessToken);

        if (!tracks || tracks.length === 0) {
            statusEl.textContent = 'No tracks could be generated.';
            return;
        }

        const mixCDName = generateMixCDName();
        document.getElementById('cdTitle').textContent = mixCDName;
        
        statusEl.textContent = `Your 12-track "${mixCDName}" Mix CD:`;
        albumContainerEl.innerHTML = tracks.map((t, idx) => `
            <div class="track-item" style="margin-bottom: 15px;">
                <span class="track-number">${idx + 1}.</span>
                <img src="${t.album_art || ''}" alt="Album Art" width="64" height="64" style="vertical-align: middle; margin-right: 10px;">
                <span class="track-name">${t.name}</span> — <span class="track-artist">${t.artist}</span>
                ${t.preview_url ? `<audio controls src="${t.preview_url}"></audio>` : ''}
                <a href="${t.spotify_url}" target="_blank">Listen on Spotify</a>
            </div>
        `).join('');

        document.getElementById('loadingScreen').classList.add('hidden');
        document.getElementById('cdContent').classList.remove('hidden');

        setTimeout(initializeCanvas, 100);

    } catch (err) {
        console.error('Error generating album:', err);
        statusEl.textContent = 'Error generating Mix CD. See console for details.';
    }
});


const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const TRACKS_PER_ALBUM = 12;

const DESCRIPTIVE_WORDS = [
    'Awesome', 'Epic', 'Chill', 'Crazy', 'Ultimate', 'Perfect', 'Legendary', 'Amazing', 
    'Wild', 'Cool', 'Rad', 'Sweet', 'Groovy', 'Funky', 'Classic', 'Retro', 'Modern',
    'Electric', 'Acoustic', 'Midnight', 'Sunset', 'Neon', 'Golden', 'Silver', 'Diamond',
    'Fire', 'Ice', 'Thunder', 'Lightning', 'Starlight', 'Moonbeam', 'Sunshine', 'Rainbow',
    'Girls', 'Guys', 'Friends', 'Solo', 'Duo', 'Crew', 'Squad', 'Gang', 'Club', 'VIP',
    'Secret', 'Hidden', 'Lost', 'Found', 'Broken', 'Fixed', 'New', 'Old', 'Fresh', 'Vintage'
];

const EVENT_WORDS = [
    'Road Trip', 'Party', 'Hangout', 'Sleepover', 'Study Session', 'Workout', 'Dance',
    'Chill Session', 'Beach Day', 'Mountain Trip', 'City Walk', 'Night Out', 'Date Night',
    'Game Night', 'Movie Night', 'Cook Out', 'Barbecue', 'Picnic', 'Festival', 'Concert',
    'Wedding', 'Birthday', 'Celebration', 'Graduation', 'Vacation', 'Weekend', 'Holiday',
    'Summer Vibes', 'Winter Nights', 'Spring Break', 'Fall Feels', 'Memories', 'Adventures',
    'Journey', 'Escape', 'Getaway', 'Retreat', 'Experience', 'Moments', 'Times', 'Days',
    'Nights', 'Hours', 'Minutes', 'Seconds', 'Playlist', 'Mix', 'Collection', 'Anthology',
    'Chronicles', 'Stories', 'Tales', 'Dreams', 'Wishes', 'Hopes', 'Love', 'Life'
];

function generateMixCDName() {
    const descriptive = DESCRIPTIVE_WORDS[Math.floor(Math.random() * DESCRIPTIVE_WORDS.length)];
    const event = EVENT_WORDS[Math.floor(Math.random() * EVENT_WORDS.length)];
    return `${descriptive} ${event}`;
}

const GENRE_MAPPING = {
    'pop': ['pop', 'dance pop', 'electropop', 'indie pop', 'synth-pop'],
    'rock': ['rock', 'classic rock', 'indie rock', 'alternative rock', 'hard rock'],
    'hip hop': ['hip hop', 'rap', 'trap', 'conscious hip hop'],
    'electronic': ['electronic', 'house', 'techno', 'edm', 'dubstep'],
    'country': ['country', 'country pop', 'bluegrass'],
    'r&b': ['r&b', 'soul', 'funk', 'neo soul'],
    'jazz': ['jazz', 'smooth jazz', 'bebop', 'swing'],
    'classical': ['classical', 'orchestral', 'opera'],
    'reggae': ['reggae', 'dancehall', 'dub'],
    'folk': ['folk', 'indie folk', 'americana'],
    'latin': ['latin', 'reggaeton', 'salsa', 'bachata']
};

async function safeFetchJSON(url, accessToken) {
    try {
        console.log("Fetching URL:", url);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!res.ok) {
            const text = await res.text();
            console.warn(`Spotify fetch failed, skipping: ${url}`, `Status ${res.status}`, text);
            return null;
        }
        return res.json();
    } catch (err) {
        console.warn("Fetch error:", err);
        return null;
    }
}

function getPrimaryGenre(genres) {
    if (!genres || genres.length === 0) return 'pop';
    
    for (const [primary, variations] of Object.entries(GENRE_MAPPING)) {
        for (const genre of genres) {
            if (variations.some(v => genre.toLowerCase().includes(v))) {
                return primary;
            }
        }
    }
    
    const firstGenre = genres[0].toLowerCase();
    if (firstGenre.includes('pop')) return 'pop';
    if (firstGenre.includes('rock')) return 'rock';
    if (firstGenre.includes('hip hop') || firstGenre.includes('rap')) return 'hip hop';
    if (firstGenre.includes('country')) return 'country';
    if (firstGenre.includes('electronic')) return 'electronic';
    
    return 'pop'; 
}

async function searchTracksByGenreAndYear(genre, year, accessToken, limit = 50) {
    const yearRange = `${year-2}-${year+2}`; 
    const searchQuery = `genre:"${genre}" year:${yearRange}`;
    const url = `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=${limit}&market=US`;
    
    console.log("Searching with query:", searchQuery);
    const data = await safeFetchJSON(url, accessToken);
    return data?.tracks?.items || [];
}

async function searchTracksByGenre(genre, accessToken, limit = 50) {
    const searchQuery = `genre:"${genre}"`;
    const url = `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=${limit}&market=US`;
    
    console.log("Searching by genre only:", searchQuery);
    const data = await safeFetchJSON(url, accessToken);
    return data?.tracks?.items || [];
}

async function getRelatedArtistsTracks(artistId, accessToken) {
    const relatedData = await safeFetchJSON(`${SPOTIFY_API_BASE}/artists/${artistId}/related-artists`, accessToken);
    const relatedArtists = relatedData?.artists?.slice(0, 5) || [];
    
    let tracks = [];
    for (const artist of relatedArtists) {
        const topTracksData = await safeFetchJSON(`${SPOTIFY_API_BASE}/artists/${artist.id}/top-tracks?market=US`, accessToken);
        if (topTracksData?.tracks) {
            tracks.push(...topTracksData.tracks.slice(0, 3));
        }
    }
    
    return tracks;
}

async function getTopTracks(artistId, accessToken) {
    const data = await safeFetchJSON(`${SPOTIFY_API_BASE}/artists/${artistId}/top-tracks?market=US`, accessToken);
    return data?.tracks || [];
}

async function generateAlbumFromTrack(trackId, accessToken) {
    console.log("Fetching track info for track ID:", trackId);
    const trackData = await safeFetchJSON(`${SPOTIFY_API_BASE}/tracks/${trackId}`, accessToken);
    if (!trackData) throw new Error("Cannot fetch seed track info.");

    const seedArtist = trackData.artists[0];
    const releaseDate = trackData.album.release_date;
    const releaseYear = parseInt(releaseDate.split('-')[0]);
    
    console.log("Primary artist ID:", seedArtist.id);
    console.log("Release year:", releaseYear);

    const artistData = await safeFetchJSON(`${SPOTIFY_API_BASE}/artists/${seedArtist.id}`, accessToken);
    const artistGenres = artistData?.genres || [];
    const primaryGenre = getPrimaryGenre(artistGenres);
    
    console.log("Seed artist genres:", artistGenres);
    console.log("Primary genre selected:", primaryGenre);

    let trackPool = [];

    if (primaryGenre && releaseYear && releaseYear > 1950) {
        console.log(`Searching for ${primaryGenre} tracks from around ${releaseYear}`);
        const genreYearTracks = await searchTracksByGenreAndYear(primaryGenre, releaseYear, accessToken, 30);
        trackPool.push(...genreYearTracks);
        console.log(`Found ${genreYearTracks.length} tracks by genre and year`);
    }

    if (trackPool.length < TRACKS_PER_ALBUM && primaryGenre) {
        console.log(`Searching for ${primaryGenre} tracks (any year)`);
        const genreTracks = await searchTracksByGenre(primaryGenre, accessToken, 30);
        trackPool.push(...genreTracks);
        console.log(`Total tracks after genre search: ${trackPool.length}`);
    }

    if (trackPool.length < TRACKS_PER_ALBUM) {
        console.log("Fetching tracks from related artists");
        const relatedTracks = await getRelatedArtistsTracks(seedArtist.id, accessToken);
        trackPool.push(...relatedTracks);
        console.log(`Total tracks after related artists: ${trackPool.length}`);
    }

    if (trackPool.length < TRACKS_PER_ALBUM) {
        console.log("Fetching top tracks for final fallback:", seedArtist.name);
        const topTracks = await getTopTracks(seedArtist.id, accessToken);
        trackPool.push(...topTracks);
        console.log(`Total tracks after fallback: ${trackPool.length}`);
    }

    trackPool = trackPool.filter(t => t.id !== trackId);

    trackPool.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    
    const uniqueTracks = [];
    const seen = new Set();
    
    uniqueTracks.push({
        id: trackData.id,
        name: trackData.name,
        artist: trackData.artists.map(a => a.name).join(", "),
        preview_url: trackData.preview_url,
        spotify_url: trackData.external_urls.spotify,
        album_art: trackData.album.images[0]?.url || null
    });
    seen.add(trackData.id);
    
    for (const t of trackPool) {
        if (!seen.has(t.id) && uniqueTracks.length < TRACKS_PER_ALBUM) {
            seen.add(t.id);
            uniqueTracks.push({
                id: t.id,
                name: t.name,
                artist: t.artists.map(a => a.name).join(", "),
                preview_url: t.preview_url,
                spotify_url: t.external_urls.spotify,
                album_art: t.album.images[0]?.url || null
            });
        }
    }

    console.log("Final generated tracks:", uniqueTracks.map(t => `${t.name} by ${t.artist}`));
    console.log(`Generated ${uniqueTracks.length} tracks total`);
    
    return uniqueTracks;
}

let canvas, ctx;
let isDrawing = false;
let currentTool = 'draw';
let brushColor = '#000000';
let brushSize = 5;
let selectedSticker = null;

function initializeCanvas() {
    console.log('Attempting to initialize canvas...');
    
    canvas = document.getElementById('albumCanvas');
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }

    const canvasArea = document.querySelector('.canvas-area');
    if (!canvasArea) {
        console.error('Canvas area not found!');
        return;
    }

    ctx = canvas.getContext('2d');
    
    const rect = canvasArea.getBoundingClientRect();
    console.log('Canvas area dimensions:', rect.width, 'x', rect.height);
    
    const width = rect.width > 0 ? rect.width : 300;
    const height = rect.height > 0 ? rect.height : 300;
    
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    
    console.log('Canvas set to:', canvas.width, 'x', canvas.height);
    

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = true;
    
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    addCanvasEventListeners();
    addToolEventListeners();
    
    console.log('Canvas initialized successfully!');
}

function addCanvasEventListeners() {
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    canvas.addEventListener('click', handleCanvasClick);
    
    canvas.addEventListener('touchstart', handleTouch);
    canvas.addEventListener('touchmove', handleTouch);
    canvas.addEventListener('touchend', stopDrawing);
    
    console.log('Canvas event listeners added');
}

function addToolEventListeners() {
    const colorPicker = document.getElementById('colorPicker');
    if (colorPicker) {
        colorPicker.addEventListener('change', (e) => {
            brushColor = e.target.value;
            console.log('Color changed to:', brushColor);
        });
    }
    
    const brushSizeSlider = document.getElementById('brushSize');
    if (brushSizeSlider) {
        brushSizeSlider.addEventListener('input', (e) => {
            brushSize = parseInt(e.target.value);
            console.log('Brush size changed to:', brushSize);
        });
    }
    
    const drawTool = document.getElementById('drawTool');
    if (drawTool) {
        drawTool.addEventListener('click', () => {
            console.log('Draw tool selected');
            setTool('draw');
        });
    }
    
    const stickerTool = document.getElementById('stickerTool');
    if (stickerTool) {
        stickerTool.addEventListener('click', () => {
            console.log('Sticker tool selected');
            setTool('sticker');
        });
    }
    
    const clearButton = document.getElementById('clearCanvas');
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            console.log('Clearing canvas');
            clearCanvas();
        });
    }
    
    document.querySelectorAll('.sticker').forEach(sticker => {
        sticker.addEventListener('click', (e) => {
            const stickerText = e.target.dataset.sticker;
            console.log('Sticker selected:', stickerText);
            selectSticker(stickerText);
        });
    });
    
    console.log('Tool event listeners added');
}

function startDrawing(e) {
    if (currentTool !== 'draw') return;
    
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    console.log('Starting draw at:', x, y);
    
    ctx.beginPath();
    ctx.moveTo(x, y);
}

function draw(e) {
    if (!isDrawing || currentTool !== 'draw') return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = brushColor;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
}

function stopDrawing() {
    if (isDrawing) {
        console.log('Stopping draw');
    }
    isDrawing = false;
    ctx.beginPath();
}

function handleTouch(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent(e.type === 'touchstart' ? 'mousedown' : 
                                     e.type === 'touchmove' ? 'mousemove' : 'mouseup', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
}

function setTool(tool) {
    currentTool = tool;
    console.log('Tool set to:', tool);
    
    document.querySelectorAll('.tool-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const stickerPanel = document.getElementById('stickerPanel');
    
    if (tool === 'draw') {
        document.getElementById('drawTool').classList.add('active');
        if (stickerPanel) stickerPanel.classList.remove('active');
        canvas.style.cursor = 'crosshair';
        selectedSticker = null;
    } else if (tool === 'sticker') {
        document.getElementById('stickerTool').classList.add('active');
        if (stickerPanel) stickerPanel.classList.add('active');
        canvas.style.cursor = 'pointer';
    }
}

function selectSticker(stickerText) {
    selectedSticker = stickerText;
    canvas.style.cursor = 'copy';
    console.log('Ready to place sticker:', stickerText);
}

function handleCanvasClick(e) {
    if (currentTool === 'sticker' && selectedSticker) {
        placeStickerOnCanvas(e);
    }
}

function placeStickerOnCanvas(e) {
    if (!selectedSticker) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    console.log('Placing sticker at:', x, y);
    
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.fillText(selectedSticker, x, y);
    
    selectedSticker = null;
    canvas.style.cursor = 'pointer';
}

function clearCanvas() {
    if (!ctx) return;
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    console.log('Canvas cleared');
}


document.addEventListener('DOMContentLoaded', () => {

    setTimeout(() => {
        const saveButton = document.getElementById('saveToSpotify');
        if (saveButton) {
            saveButton.addEventListener('click', () => {
                alert('Save to Spotify functionality coming soon!');
            });
        }
        
        const shareButton = document.getElementById('shareCD');
        if (shareButton) {
            shareButton.addEventListener('click', () => {
                alert('Share Mix CD functionality coming soon!');
            });
        }
        
        const startOverButton = document.getElementById('startOver');
        if (startOverButton) {
            startOverButton.addEventListener('click', () => {
                window.location.href = 'selectionscreen.html';
            });
        }
    }, 500);
});