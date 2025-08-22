function generateCodeVerifier() {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return base64UrlEncode(String.fromCharCode(...array));
}

function base64UrlEncode(str) {
    return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
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
    console.log("[popup.js] DOM loaded - attaching event listener");
    
    const loginBtn = document.getElementById('login-btn');
    const statusDiv = document.getElementById('status');
    
    if (!loginBtn) {
        console.error("[popup.js] Could not find login button in DOM!");
        return;
    }
    
    // Check if already authenticated
    checkAuthStatus();
    
    loginBtn.addEventListener('click', async () => {
        console.log("[popup.js] Login button clicked");
        
        // Disable button and show loading state
        loginBtn.disabled = true;
        loginBtn.textContent = 'Connecting...';
        statusDiv.innerHTML = 'Opening Spotify login<span class="loading-dots">...</span>';
        
        try {
            await initiateSpotifyAuth();
        } catch (error) {
            console.error("[popup.js] Auth initiation error:", error);
            resetLoginButton();
            statusDiv.textContent = 'Authentication failed. Please try again.';
        }
    });
});

async function checkAuthStatus() {
    try {
        const result = await chrome.storage.local.get(['spotify_access_token', 'expires_at']);
        
        if (result.spotify_access_token && result.expires_at > Date.now()) {
            document.getElementById('login-btn').textContent = 'Go to Mix Maker';
            document.getElementById('status').textContent = 'Already connected to Spotify!';
            
            document.getElementById('login-btn').addEventListener('click', async () => {
                try {
                    await chrome.tabs.create({
                        url: chrome.runtime.getURL('selectionscreen.html'),
                        active: true
                    });
                    window.close();
                } catch (error) {
                    console.error("[popup.js] Error creating tab:", error);
                    // Fallback: try opening in same tab
                    window.location.href = chrome.runtime.getURL('selectionscreen.html');
                }
            });
        }
    } catch (error) {
        console.error("[popup.js] Error checking auth status:", error);
    }
}

async function initiateSpotifyAuth() {
    const clientId = 'ddfe25c5a2a84c1c92a2cc004312bd6d';
    const redirectUri = chrome.identity.getRedirectURL();
    console.log("[popup.js] Using redirect URI:", redirectUri);
    
    const codeVerifier = generateCodeVerifier();
    console.log("[popup.js] Generated codeVerifier:", codeVerifier);
    
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    console.log("[popup.js] Generated codeChallenge:", codeChallenge);
    
    await chrome.storage.local.set({ code_verifier: codeVerifier });
    console.log("[popup.js] Code verifier saved to storage");
    
    const scopes = [
        'playlist-modify-public',
        'playlist-modify-private',
        'user-read-currently-playing',
        'user-read-playback-state',
    ].join(' ');
    
    const authUrl =
        `https://accounts.spotify.com/authorize?` +
        `response_type=code` +
        `&client_id=${encodeURIComponent(clientId)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&code_challenge_method=S256` +
        `&code_challenge=${codeChallenge}`;
    
    console.log("[popup.js] Final Spotify auth URL:", authUrl);
    
    try {
        // Use a more robust approach for the auth flow
        const responseUrl = await chrome.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true
        });
        
        console.log("[popup.js] Auth response URL:", responseUrl);
        
        if (!responseUrl) {
            throw new Error('No response URL received from auth flow');
        }

        const urlParams = new URLSearchParams(responseUrl.split('?')[1]);
        const authCode = urlParams.get('code');
        const error = urlParams.get('error');
        
        if (error) {
            console.error("[popup.js] Auth error:", error);
            document.getElementById('status').textContent = `Error: ${error}`;
            resetLoginButton();
            return;
        }
        
        if (authCode) {
            console.log("[popup.js] Authorization code received:", authCode);
            document.getElementById('status').innerHTML = 'Success! Getting access token<span class="loading-dots">...</span>';
            
            await exchangeCodeForToken(authCode, codeVerifier, redirectUri);
        } else {
            throw new Error('No authorization code received');
        }
        
    } catch (error) {
        console.error("[popup.js] Auth flow error:", error);
        document.getElementById('status').textContent = 'Authentication failed. Please try again.';
        resetLoginButton();
    }
}

function resetLoginButton() {
    const loginBtn = document.getElementById('login-btn');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Connect to Spotify';
}

async function exchangeCodeForToken(authCode, codeVerifier, redirectUri) {
    const clientId = 'ddfe25c5a2a84c1c92a2cc004312bd6d';
    
    console.log("[popup.js] Token exchange parameters:");
    console.log("- authCode:", authCode);
    console.log("- codeVerifier:", codeVerifier);
    console.log("- redirectUri:", redirectUri);
    console.log("- clientId:", clientId);
    
    const tokenData = new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier
    });
    
    console.log("[popup.js] Token request body:", tokenData.toString());
    
    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: tokenData
        });
        
        console.log("[popup.js] Token response status:", response.status);
        console.log("[popup.js] Token response headers:", [...response.headers.entries()]);
        
        const tokenResponse = await response.json();
        console.log("[popup.js] Token response:", tokenResponse);
        
        if (tokenResponse.access_token) {
            await chrome.storage.local.set({
                spotify_access_token: tokenResponse.access_token,
                refresh_token: tokenResponse.refresh_token,
                expires_at: Date.now() + (tokenResponse.expires_in * 1000)
            });
            
            document.getElementById('status').textContent = 'Connected! Opening Mix Maker...';
            console.log("[popup.js] Tokens saved successfully");
            
            setTimeout(async () => {
                try {
                    await chrome.tabs.create({
                        url: chrome.runtime.getURL('selectionscreen.html'),
                        active: true
                    });
                    window.close();
                } catch (error) {
                    console.error("[popup.js] Error creating tab:", error);
                    window.location.href = chrome.runtime.getURL('selectionscreen.html');
                }
            }, 1500);
        } else {
            console.error("[popup.js] Token exchange failed:", tokenResponse);
            document.getElementById('status').textContent = `Failed to get access token: ${tokenResponse.error}`;
            resetLoginButton();
        }
    } catch (error) {
        console.error("[popup.js] Token exchange error:", error);
        document.getElementById('status').textContent = 'Token exchange failed';
        resetLoginButton();
    }
}