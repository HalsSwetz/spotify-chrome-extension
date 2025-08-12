function generateCodeVerifier() {
    const array = new Uint32Array(56);
    window.crypto.getRandomValues(array);
    return base64UrlEncode(arrayToString(array));
}

function arrayToString(uint32Array) {
    return String.fromCharCode.apply(null, new Uint8Array(uint32Array.buffer));
}


function base64UrlEncode(str) {
    return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/,'');
}

async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    const base64Digest = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return base64Digest;
}


document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const statusDiv = document.getElementById('status');

    loginBtn.addEventListener('click', async () => {
        statusDiv.textContent = 'Starting Spotify OAuth...';

        const clientId = 'ddfe25c5a2a84c1c92a2cc004312bd6d'; 
        const redirectUri = 'chrome-extension://cfimnpeelhammhmohonddcgfiihelane/callback.html'; 

        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        localStorage.setItem('code_verifier', codeVerifier);

        const scopes = [
            'playlist-modify-public',
            'playlist-modify-private',
            'user-read-currently-playing',
            'user-read-playback-state',
        ].join(' ');

        const authUrl = `https://accounts.spotify.com/authorize?` +
            `response_type=code` +
            `&client_id=${encodeURIComponent(clientId)}` +
            `&scope=${encodeURIComponent(scopes)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&code_challenge_method=S256` +
            `&code_challenge=${codeChallenge}`;

        window.open(authUrl, 'Spotify Login', 'width=500,height=600');
    });
});