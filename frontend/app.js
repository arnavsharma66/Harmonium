/**
 * Harmonium Core Application Logic
 */

// --- 1. State Management & Persistance ---
const State = {
    token: localStorage.getItem('harmonium_token') || null,
    user: null,
    history: JSON.parse(localStorage.getItem('harmonium_history')) || [],
    likes: JSON.parse(localStorage.getItem('harmonium_likes')) || [],
    queue: JSON.parse(localStorage.getItem('harmonium_queue')) || [],
    queueIndex: 0,
    filterPref: localStorage.getItem('harmonium_filter') || 'music',
    shuffleOn: localStorage.getItem('harmonium_shuffle') === 'true',
    repeatOn: localStorage.getItem('harmonium_repeat') === 'true',
    
    save() {
        if (this.token) localStorage.setItem('harmonium_token', this.token);
        else localStorage.removeItem('harmonium_token');
        localStorage.setItem('harmonium_history', JSON.stringify(this.history));
        localStorage.setItem('harmonium_likes', JSON.stringify(this.likes));
        localStorage.setItem('harmonium_queue', JSON.stringify(this.queue));
        localStorage.setItem('harmonium_filter', this.filterPref);
        localStorage.setItem('harmonium_shuffle', this.shuffleOn);
        localStorage.setItem('harmonium_repeat', this.repeatOn);
    }
};

function escapeHtml(unsafe) {
    return (unsafe || '').toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// --- 2. DOM Elements ---
const DOM = {
    landing: document.getElementById('landing-page'),
    shell: document.getElementById('app-shell'),
    btnLogin: document.getElementById('btn-login'),
    btnLogout: document.getElementById('btn-logout'),
    userName: document.getElementById('user-name'),
    userAvatar: document.getElementById('user-avatar'),
    content: document.getElementById('content'),
    queuePanel: document.getElementById('queue-panel'),
    lyricsPanel: document.getElementById('lyrics-panel'),
    toastContainer: document.getElementById('toast-container'),
    ytContainer: document.getElementById('yt-player-container'),
    playerThumb: document.getElementById('player-thumb'),
    playerTitle: document.getElementById('player-title'),
    playerArtist: document.getElementById('player-artist'),
    timeCurrent: document.getElementById('time-current'),
    timeTotal: document.getElementById('time-total'),
    progressFill: document.getElementById('progress-fill-el'),
    progressBar: document.getElementById('progress-bar-el'),
    volSlider: document.getElementById('vol-slider')
};

// --- 3. Utilities ---
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    DOM.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function parseDuration(duration) {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0;
    const hours = (parseInt(match[1]) || 0);
    const minutes = (parseInt(match[2]) || 0);
    const seconds = (parseInt(match[3]) || 0);
    return hours * 3600 + minutes * 60 + seconds;
}

function extractDominantColor(imgSrc, callback) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        try {
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let r=0, g=0, b=0, count=0;
            for(let i=0; i<data.length; i+=16) { 
                if(data[i+3]>128) { r+=data[i]; g+=data[i+1]; b+=data[i+2]; count++; }
            }
            if(count>0) callback(`rgb(${Math.floor(r/count)},${Math.floor(g/count)},${Math.floor(b/count)})`);
            else callback('var(--surface-sidebar)');
        } catch(e) { callback('var(--surface-sidebar)'); }
    };
    img.onerror = () => callback('var(--surface-sidebar)');
    img.src = imgSrc.startsWith('http') ? `https://api.allorigins.win/raw?url=${encodeURIComponent(imgSrc)}` : imgSrc;
}

// --- 4. API Service ---
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://harmonium.onrender.com';

async function apiFetch(endpoint) {
    if (!State.token) throw new Error("No token");
    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${State.token}` }
    });
    if (res.status === 401) {
        State.token = null;
        State.save();
        window.location.reload();
    }
    return res.json();
}

// --- 5. Authentication ---
async function initAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParams = urlParams.get('token');
    
    if (tokenParams) {
        State.token = tokenParams;
        State.save();
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    if (State.token) {
        try {
            const user = await apiFetch('/auth/me');
            if (user && !user.error) {
                State.user = user;
                DOM.landing.classList.remove('active');
                DOM.shell.classList.add('active');
                if(DOM.userName) DOM.userName.textContent = user.name || user.given_name;
                if(DOM.userAvatar) {
                    DOM.userAvatar.src = user.picture;
                    DOM.userAvatar.style.display = 'block';
                }
                return true;
            } else {
                throw new Error("Invalid token");
            }
        } catch (e) {
            State.token = null;
            State.save();
            if(DOM.landing) DOM.landing.classList.add('active');
            if(DOM.shell) DOM.shell.classList.remove('active');
            return false;
        }
    } else {
        if(DOM.landing) DOM.landing.classList.add('active');
        if(DOM.shell) DOM.shell.classList.remove('active');
        return false;
    }
}

if(DOM.btnLogin) DOM.btnLogin.addEventListener('click', () => { window.location.href = `${API_BASE}/auth/login`; });
if(DOM.btnLogout) DOM.btnLogout.addEventListener('click', async () => {
    if(State.token) {
        try { await fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: { 'Authorization': `Bearer ${State.token}` }}); } catch(e){}
    }
    State.token = null;
    State.save();
    window.location.reload();
});

// --- 6. YouTube Audio Engine ---
let ytPlayer;
let isPlaying = false;
let progressInterval;
let currentTrackDuration = 0;

window.onYouTubeIframeAPIReady = function() {
    if(typeof YT === 'undefined') return;
    ytPlayer = new YT.Player('yt-player', {
        height: '150',
        width: '268',
        playerVars: { 'playsinline': 1, 'controls': 0, 'disablekb': 1, 'fs': 0, 'rel': 0 },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': () => {
                showToast("This track is unavailable. Skipping...");
                setTimeout(playNext, 1500);
            }
        }
    });
};

function onPlayerReady(event) {
    if (DOM.volSlider) event.target.setVolume(DOM.volSlider.value);
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        currentTrackDuration = ytPlayer.getDuration();
        if(DOM.timeTotal) DOM.timeTotal.textContent = formatTime(currentTrackDuration);
        const playBtn = document.querySelector('.icon-play');
        const pauseBtn = document.querySelector('.icon-pause');
        if(playBtn) playBtn.style.display = 'none';
        if(pauseBtn) pauseBtn.style.display = 'block';
        
        startProgressLoop();
        recordHistory(); // Only records uniquely per track loaded securely
        
        const btnVid = document.getElementById('btn-video');
        if(btnVid) btnVid.style.display = 'inline-block';
    } else {
        isPlaying = false;
        const playBtn = document.querySelector('.icon-play');
        const pauseBtn = document.querySelector('.icon-pause');
        if(playBtn) playBtn.style.display = 'block';
        if(pauseBtn) pauseBtn.style.display = 'none';
        clearInterval(progressInterval);
    }
    
    if (event.data === YT.PlayerState.ENDED) {
        if(State.repeatOn) ytPlayer.playVideo();
        else playNext();
    }
}

function startProgressLoop() {
    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
        if (!ytPlayer || !isPlaying) return;
        const currentTime = ytPlayer.getCurrentTime();
        if(DOM.timeCurrent) DOM.timeCurrent.textContent = formatTime(currentTime);
        const percent = (currentTime / currentTrackDuration) * 100;
        if(DOM.progressFill) DOM.progressFill.style.width = `${percent}%`;
        syncLyrics(currentTime);
    }, 1000);
}


// --- 7. Playback Controls ---
function loadTrack(trackId, title, artist, thumb, autoPlay = true) {
    clearInterval(progressInterval);
    if(DOM.playerTitle) DOM.playerTitle.textContent = title;
    if(DOM.playerArtist) DOM.playerArtist.textContent = artist;
    if(DOM.playerThumb) DOM.playerThumb.src = thumb;
    
    if (ytPlayer && ytPlayer.loadVideoById) {
        if(autoPlay) ytPlayer.loadVideoById(trackId);
        else ytPlayer.cueVideoById(trackId);
    }
    fetchLyrics(artist, title);
    updateLikeButtonState(trackId);
    renderQueue();
    
    document.querySelectorAll('.track-row').forEach(row => {
        if(row.dataset.id === trackId) row.classList.add('playing');
        else row.classList.remove('playing');
    });
}

function updateLikeButtonState(trackId) {
     const btnLike = document.getElementById('btn-like');
     if (!btnLike) return;
     if (State.likes.includes(trackId)) {
         btnLike.classList.add('active');
         btnLike.querySelector('svg').setAttribute('fill', 'currentColor');
     } else {
         btnLike.classList.remove('active');
         btnLike.querySelector('svg').setAttribute('fill', 'none');
     }
}

function playNext() {
    if (State.queue.length === 0) return;
    
    if(State.shuffleOn) {
        State.queueIndex = Math.floor(Math.random() * State.queue.length);
    } else if (State.queueIndex < State.queue.length - 1) {
        State.queueIndex++;
    } else {
        return; 
    }
    
    const nextTrack = State.queue[State.queueIndex];
    loadTrack(nextTrack.id, nextTrack.title, nextTrack.artist, nextTrack.thumb);
}

function playPrev() {
    if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getCurrentTime() > 3) {
        ytPlayer.seekTo(0);
        return;
    }
    if (State.queueIndex > 0) {
        State.queueIndex--;
        const prevTrack = State.queue[State.queueIndex];
        loadTrack(prevTrack.id, prevTrack.title, prevTrack.artist, prevTrack.thumb);
    }
}

let lastRecordedTrack = null;
function recordHistory() {
    const current = State.queue[State.queueIndex];
    if (!current || current.id === lastRecordedTrack) return;
    lastRecordedTrack = current.id;
    const existing = State.history.find(t => t.id === current.id);
    if (existing) {
        existing.plays = (existing.plays || 0) + 1;
        existing.lastPlayed = Date.now();
    } else {
        State.history.push({ ...current, plays: 1, lastPlayed: Date.now() });
    }
    State.save();
}

// Control Events
const btnPlayPause = document.getElementById('btn-play-pause');
if(btnPlayPause) btnPlayPause.addEventListener('click', () => {
    if (!ytPlayer) return;
    if (isPlaying) ytPlayer.pauseVideo();
    else ytPlayer.playVideo();
});

const btnNext = document.getElementById('btn-next');
if(btnNext) btnNext.addEventListener('click', playNext);
const btnPrev = document.getElementById('btn-prev');
if(btnPrev) btnPrev.addEventListener('click', playPrev);

if(DOM.progressBar) DOM.progressBar.addEventListener('click', (e) => {
    if (!ytPlayer || !currentTrackDuration) return;
    const rect = DOM.progressBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    ytPlayer.seekTo(pos * currentTrackDuration);
});

if(DOM.volSlider) DOM.volSlider.addEventListener('input', (e) => {
    if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(e.target.value);
});

const btnQueue = document.getElementById('btn-queue');
if(btnQueue) btnQueue.addEventListener('click', (e) => {
    if(DOM.queuePanel) DOM.queuePanel.classList.toggle('open');
    e.currentTarget.classList.toggle('active');
});

const btnLyrics = document.getElementById('btn-lyrics');
if(btnLyrics) btnLyrics.addEventListener('click', (e) => {
    if(DOM.lyricsPanel) DOM.lyricsPanel.classList.toggle('open');
    e.currentTarget.classList.toggle('active');
});

const btnVideo = document.getElementById('btn-video');
if(btnVideo) btnVideo.addEventListener('click', (e) => {
    if(DOM.ytContainer) DOM.ytContainer.classList.toggle('show');
    e.currentTarget.classList.toggle('active');
});

const btnLike = document.getElementById('btn-like');
if(btnLike) btnLike.addEventListener('click', (e) => {
    if (State.queue.length === 0) return;
    const targetTrack = State.queue[State.queueIndex].id;
    const idx = State.likes.indexOf(targetTrack);
    const svg = e.currentTarget.querySelector('svg');
    if (idx > -1) {
        State.likes.splice(idx, 1);
        e.currentTarget.classList.remove('active');
        svg.setAttribute('fill', 'none');
        showToast('Removed from Liked Songs');
    } else {
        State.likes.push(targetTrack);
        e.currentTarget.classList.add('active');
        svg.setAttribute('fill', 'currentColor');
        showToast('Added to Liked Songs');
    }
    State.save();
});


// --- 8. UI Rendering & Pagination ---
let currentNextPageToken = null;
let activeViewType = null;
let activePlaylistId = null;
let activeSnippet = null;

function getGreeting() {
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 18) return "Good afternoon";
    return "Good evening";
}

let sidebarNextPageToken = null;
async function renderSidebarPlaylists(pageToken = '') {
    try {
        const data = await apiFetch(`/api/playlists?maxResults=50${pageToken ? '&pageToken='+pageToken : ''}`);
        const container = document.getElementById('playlists-list');
        if(!container) return;
        if (!pageToken) container.innerHTML = '';
        
        if (data.items) {
            data.items.forEach(pl => {
                const a = document.createElement('a');
                a.className = 'playlist-item';
                a.textContent = pl.snippet.title;
                a.dataset.id = pl.id;
                a.addEventListener('click', () => loadPlaylistView(pl.id, pl.snippet));
                container.appendChild(a);
            });
        }
        
        sidebarNextPageToken = data.nextPageToken || null;
        if (sidebarNextPageToken) {
            const btn = document.createElement('a');
            btn.className = 'playlist-item';
            btn.style.color = 'var(--accent-warm)';
            btn.textContent = 'Load More...';
            btn.onclick = (e) => { e.currentTarget.remove(); renderSidebarPlaylists(sidebarNextPageToken); };
            container.appendChild(btn);
        }
    } catch (e) {}
}

async function renderHome() {
    if(!DOM.content) return;
    
    // Fetch quick grid playlists instead of hardcoding
    let topPlaylists = '';
    try {
        const pls = await apiFetch('/api/playlists?maxResults=5');
        if (pls.items) {
            window._homePlaylists = pls.items;
            topPlaylists = pls.items.map((pl, idx) => `
                <div class="quick-card" onclick="loadPlaylistView('${pl.id}', window._homePlaylists[${idx}].snippet)">
                    <img src="${pl.snippet.thumbnails?.default?.url || '/icon-192.png'}" alt="playlist">
                    <span class="title" title="${escapeHtml(pl.snippet.title)}">${escapeHtml(pl.snippet.title)}</span>
                    <button class="play-hover-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></button>
                </div>
            `).join('');
        }
    } catch(e) {}
    
    DOM.content.innerHTML = `
        <div class="section-header greeting">${getGreeting()}</div>
        <div class="quick-grid">
            <div class="quick-card" onclick="loadLikedSongsView()">
                <img src="/icon-192.png" alt="Liked Songs">
                <span class="title">Liked Songs</span>
                <button class="play-hover-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></button>
            </div>
            ${topPlaylists}
        </div>
        <div class="section-header">Most Played</div>
        <div class="horizontal-scroll" id="home-most-played"></div>
    `;
    
    const sorted = [...State.history].sort((a,b) => b.plays - a.plays).slice(0,10);
    const container = document.getElementById('home-most-played');
    if (sorted.length === 0) {
        container.innerHTML = `<p style="color:var(--text-secondary); padding: 0 32px;">Start playing music to see your top tracks here.</p>`;
    } else {
        container.innerHTML = sorted.map(t => `
            <div class="music-card" onclick="playSingleTrack('${t.id}', '${escapeHtml(t.title).replace(/'/g,"\\'")}', '${escapeHtml(t.artist).replace(/'/g,"\\'")}', '${t.thumb}')">
                <img class="artwork" src="${t.thumb}" alt="art">
                <div class="title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
                <div class="subtitle" title="${escapeHtml(t.artist)}">${escapeHtml(t.artist)}</div>
                <button class="play-hover-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></button>
            </div>
        `).join('');
    }
}

async function loadLikedSongsView(pageToken = '') {
    if(!pageToken && DOM.content) DOM.content.innerHTML = `<div class="spinner"></div>`;
    activeViewType = 'liked';
    try {
        const url = `/api/liked?maxResults=50${pageToken ? '&pageToken='+pageToken : ''}`;
        const data = await apiFetch(url);
        currentNextPageToken = data.nextPageToken || null;
        if(pageToken && window._currentRawItems) window._currentRawItems = window._currentRawItems.concat(data.items || []);
        else window._currentRawItems = data.items || [];
        renderTracksView("Liked Songs", "Your Favorites", "", window._currentRawItems);
    } catch (e) {
        if(!pageToken && DOM.content) DOM.content.innerHTML = `<div style="padding:40px;">Error loading liked songs.</div>`;
    }
}

async function loadPlaylistView(id, snippet, pageToken = '') {
    if(!pageToken && DOM.content) DOM.content.innerHTML = `<div class="spinner"></div>`;
    activeViewType = 'playlist';
    activePlaylistId = id;
    activeSnippet = snippet;
    try {
        const url = `/api/playlist-items?playlistId=${id}&maxResults=50${pageToken ? '&pageToken='+pageToken : ''}`;
        const data = await apiFetch(url);
        currentNextPageToken = data.nextPageToken || null;
        const thumb = snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '/icon-192.png';
        if(pageToken && window._currentRawItems) window._currentRawItems = window._currentRawItems.concat(data.items || []);
        else window._currentRawItems = data.items || [];
        renderTracksView(snippet.title, snippet.channelTitle, thumb, window._currentRawItems);
    } catch (e) {
        if(!pageToken && DOM.content) DOM.content.innerHTML = `<div style="padding:40px;">Error loading playlist.</div>`;
    }
}

function renderTracksView(title, subtitle, thumb, items) {
    if(!DOM.content) return;
    const safeThumb = thumb || '/icon-192.png';
    const tracks = items.map(item => {
        const t = item.snippet;
        const videoId = t.resourceId?.videoId || item.id?.videoId || item.id;
        const durationStr = item.contentDetails?.duration || "PT0S";
        return {
            id: videoId,
            title: t.title,
            artist: t.channelTitle || t.videoOwnerChannelTitle || "Unknown Artist",
            thumb: t.thumbnails?.default?.url || safeThumb,
            duration: parseDuration(durationStr)
        };
    }).filter(t => t.title !== 'Private video' && t.title !== 'Deleted video');
    
    window._currentTracks = tracks;
    
    let html = `
        <div class="view-header" id="dynamic-header" style="transition: background-color 0.5s ease;">
            <div class="bg-blur" style="background-image: url('${safeThumb}')"></div>
            <div class="bg-gradient"></div>
            <div class="content">
                <img class="artwork" src="${safeThumb}">
                <div class="meta">
                    <span class="label">PLAYLIST</span>
                    <h1 class="title" title="${escapeHtml(title)}">${escapeHtml(title)}</h1>
                    <div class="subtitle" title="${escapeHtml(subtitle)}">${escapeHtml(subtitle)} • ${tracks.length} tracks</div>
                    <div class="actions">
                        <button class="btn-primary" id="btn-play-all">Play</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="track-table">
    `;
    
    tracks.forEach((t, i) => {
        const isPlaying = (State.queue[State.queueIndex]?.id === t.id);
        const isLiked = State.likes.includes(t.id);
        html += `
            <div class="track-row ${isPlaying ? 'playing' : ''}" data-id="${t.id}" data-index="${i}">
                <div class="num">${i+1}</div>
                <div class="eq"><div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div></div>
                <div class="info">
                    <img src="${t.thumb}" alt="thumb">
                    <div class="info-text">
                        <span class="title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
                        <span class="artist" title="${escapeHtml(t.artist)}">${escapeHtml(t.artist)}</span>
                    </div>
                </div>
                <div class="actions">
                    <button class="icon-btn like-btn" data-id="${t.id}">
                        <svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" class="${isLiked ? 'active' : ''}"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    </button>
                </div>
                <div class="duration">${formatTime(t.duration)}</div>
            </div>
        `;
    });
    
    if (currentNextPageToken) {
        html += `<div style="text-align: center; padding: 20px;"><button class="btn-primary" id="btn-load-more" style="background: var(--surface-card); color: var(--text-primary); border: 1px solid var(--border-default);">Load More</button></div>`;
    }
    
    html += `</div>`;
    DOM.content.innerHTML = html;
    
    extractDominantColor(safeThumb, (color) => {
        const header = document.getElementById('dynamic-header');
        if(header) header.style.backgroundColor = color;
    });
    
    const btnPlayAll = document.getElementById('btn-play-all');
    if(btnPlayAll) btnPlayAll.addEventListener('click', () => {
        playQueueFrom(window._currentTracks, 0);
    });

    const btnLoadMore = document.getElementById('btn-load-more');
    if (btnLoadMore) {
        btnLoadMore.addEventListener('click', () => {
            if (activeViewType === 'liked') loadLikedSongsView(currentNextPageToken);
            else if (activeViewType === 'playlist') loadPlaylistView(activePlaylistId, activeSnippet, currentNextPageToken);
        });
    }

    document.querySelectorAll('.track-row').forEach(row => {
        row.addEventListener('click', (e) => {
            if(e.target.closest('.like-btn')) {
                const tid = row.dataset.id;
                const idx = State.likes.indexOf(tid);
                const btnSvg = e.target.closest('.like-btn').querySelector('svg');
                if(idx > -1) {
                    State.likes.splice(idx, 1);
                    btnSvg.setAttribute('fill', 'none');
                    btnSvg.classList.remove('active');
                    showToast('Removed from Liked Songs');
                } else {
                    State.likes.push(tid);
                    btnSvg.setAttribute('fill', 'currentColor');
                    btnSvg.classList.add('active');
                    showToast('Added to Liked Songs');
                }
                State.save();
                e.stopPropagation();
            } else {
                playQueueFrom(window._currentTracks, parseInt(row.dataset.index));
            }
        });
    });
}

// --- 9. Queue & Action Handlers ---
window.playQueueFrom = function(tracks, index) {
    State.queue = [...tracks];
    State.queueIndex = index;
    State.save();
    const track = State.queue[index];
    loadTrack(track.id, track.title, track.artist, track.thumb);
};

window.playSingleTrack = function(id, title, artist, thumb) {
    State.queue = [{id, title, artist, thumb}];
    State.queueIndex = 0;
    State.save();
    loadTrack(id, title, artist, thumb);
};

function renderQueue() {
    const list = document.getElementById('queue-list');
    const cnt = document.getElementById('queue-count');
    if(cnt) cnt.textContent = State.queue.length;
    if(!list) return;
    list.innerHTML = State.queue.map((t, i) => {
        const isPlaying = (i === State.queueIndex);
        return `
        <div class="queue-item" style="${isPlaying ? 'background:rgba(200, 149, 106, 0.1)' : ''}">
            <img src="${t.thumb}">
            <div class="queue-item-meta">
                <div class="queue-item-title" style="${isPlaying ? 'color:var(--accent-warm)' : ''}">${escapeHtml(t.title)}</div>
                <div class="queue-item-artist">${escapeHtml(t.artist)}</div>
            </div>
            <button class="icon-btn" onclick="removeQueueItem(${i})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>`;
    }).join('');
}

window.removeQueueItem = function(i) {
    if (window.event) window.event.stopPropagation();
    State.queue.splice(i, 1);
    if (i < State.queueIndex) State.queueIndex--;
    else if (i === State.queueIndex && State.queue.length > 0) {
        if (State.queueIndex >= State.queue.length) State.queueIndex = 0;
        const nt = State.queue[State.queueIndex];
        loadTrack(nt.id, nt.title, nt.artist, nt.thumb);
    } else if (State.queue.length === 0 && ytPlayer && ytPlayer.stopVideo) {
        ytPlayer.stopVideo();
        if(DOM.playerTitle) DOM.playerTitle.textContent = 'No track playing';
        if(DOM.playerArtist) DOM.playerArtist.textContent = '';
    }
    State.save();
    renderQueue();
};

const clrQueue = document.getElementById('btn-clear-queue');
if(clrQueue) clrQueue.addEventListener('click', () => {
    State.queue = [];
    State.queueIndex = 0;
    State.save();
    renderQueue();
    showToast('Queue cleared');
    if(ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
    if(DOM.playerTitle) DOM.playerTitle.textContent = 'No track playing';
    if(DOM.playerArtist) DOM.playerArtist.textContent = '';
});

// --- 10. Navigations ---
document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const view = e.currentTarget.dataset.view;
        if (view === 'home') renderHome();
        if (view === 'liked') loadLikedSongsView();
        if (view === 'browse' && DOM.content) DOM.content.innerHTML = `<div class="section-header greeting">Browse</div><p style="padding: 0 32px">Curated content coming soon.</p>`;
    });
});


// --- 11. Lyrics Integration ---
let lyricsData = [];
async function fetchLyrics(artist, title) {
    const container = DOM.lyricsPanel ? DOM.lyricsPanel.querySelector('.lyrics-container') : null;
    if(!container) return;
    container.innerHTML = '<p class="nearby">Searching for lyrics...</p>';
    lyricsData = [];
    
    let cleanTitle = title.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').split('-')[0].trim();
    let cleanArtist = artist.replace(/VEVO|Official|Topic/ig, '').trim();

    try {
        const res = await fetch(`https://lrclib.net/api/search?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`);
        if (res.ok) {
            const arr = await res.json();
            const data = (arr && arr.length > 0) ? arr[0] : null;

            if (data && data.syncedLyrics) parseSyncedLyrics(data.syncedLyrics);
            else if (data && data.plainLyrics) container.innerHTML = `<p>${data.plainLyrics.replace(/\n/g, '<br>')}</p>`;
            else throw new Error("No lyrics");
        } else throw new Error("No lyrics");
    } catch(e) {
        container.innerHTML = '<p class="nearby">Instrumental or lyrics unavailable.</p>';
    }
}

function parseSyncedLyrics(lrc) {
    lyricsData = [];
    const lines = lrc.split('\n');
    const container = DOM.lyricsPanel.querySelector('.lyrics-container');
    container.innerHTML = '';
    
    const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
    let trackIndex = 0;
    lines.forEach((line) => {
        const match = timeReg.exec(line);
        if (match) {
            const time = parseInt(match[1])*60 + parseInt(match[2]) + parseFloat("0."+match[3]);
            const text = match[4].trim() || "♪";
            lyricsData.push({ time, text, index: trackIndex });
            const p = document.createElement('p');
            p.id = `lrc-${trackIndex}`;
            p.textContent = text;
            container.appendChild(p);
            trackIndex++;
        }
    });
}

function syncLyrics(currentTime) {
    if (lyricsData.length === 0) return;
    let activeIdx = -1;
    for (let i = 0; i < lyricsData.length; i++) {
        if (currentTime >= lyricsData[i].time) activeIdx = i;
        else break;
    }
    
    if (activeIdx !== -1) {
        document.querySelectorAll('.lyrics-container p').forEach((p, idx) => {
            p.className = '';
            if (idx === activeIdx) p.classList.add('active');
            else if (Math.abs(idx - activeIdx) <= 2) p.classList.add('nearby');
        });
        
        const activeItem = document.getElementById(`lrc-${activeIdx}`);
        if (activeItem && DOM.lyricsPanel) {
            DOM.lyricsPanel.scrollTo({ top: activeItem.offsetTop - DOM.lyricsPanel.clientHeight / 2 + 50, behavior: 'smooth' });
        }
    }
}


// --- 12. Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    switch(e.key.toLowerCase()) {
        case ' ': 
            e.preventDefault(); 
            const ply = document.getElementById('btn-play-pause');
            if(ply) ply.click(); 
            break;
        case 'n': const bn = document.getElementById('btn-next'); if(bn) bn.click(); break;
        case 'p': const bp = document.getElementById('btn-prev'); if(bp) bp.click(); break;
        case 'arrowright': if (ytPlayer && ytPlayer.getCurrentTime) ytPlayer.seekTo(ytPlayer.getCurrentTime() + 10); break;
        case 'arrowleft': if (ytPlayer && ytPlayer.getCurrentTime) ytPlayer.seekTo(ytPlayer.getCurrentTime() - 10); break;
        case 'l': const bl = document.getElementById('btn-lyrics'); if(bl) bl.click(); break;
        case 's': const bs = document.getElementById('btn-shuffle'); if(bs) bs.click(); break;
        case 'r': const br = document.getElementById('btn-repeat'); if(br) br.click(); break;
        case 'm': 
            if (ytPlayer) {
                if (ytPlayer.isMuted && ytPlayer.isMuted()) { ytPlayer.unMute(); if(DOM.volSlider) DOM.volSlider.value = ytPlayer.getVolume(); }
                else if (ytPlayer.mute) { ytPlayer.mute(); if(DOM.volSlider) DOM.volSlider.value = 0; }
            }
            break;
    }
});

// --- Bootstrap ---
const btnShuf = document.getElementById('btn-shuffle');
if(btnShuf) {
    if(State.shuffleOn) btnShuf.classList.add('active');
    btnShuf.addEventListener('click', (e) => { State.shuffleOn = !State.shuffleOn; State.save(); e.currentTarget.classList.toggle('active'); showToast(State.shuffleOn ? 'Shuffle On' : 'Shuffle Off'); });
}

const btnRep = document.getElementById('btn-repeat');
if(btnRep) {
    if(State.repeatOn) btnRep.classList.add('active');
    btnRep.addEventListener('click', (e) => { State.repeatOn = !State.repeatOn; State.save(); e.currentTarget.classList.toggle('active'); showToast(State.repeatOn ? 'Repeat On' : 'Repeat Off'); });
}

async function bootstrap() {
    const isAuthenticated = await initAuth();
    if (isAuthenticated) {
        renderSidebarPlaylists();
        renderHome();
        if (State.queue.length > 0 && State.queue[State.queueIndex]) {
            const t = State.queue[State.queueIndex];
            loadTrack(t.id, t.title, t.artist, t.thumb, false);
        }
    }
}

window.addEventListener('load', bootstrap);
