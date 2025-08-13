function generateCodeVerifier() {
    // Generate proper length PKCE verifier (43-128 characters)
    const array = new Uint8Array(32); // 32 bytes = 43 base64url chars
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
    
    loginBtn.addEventListener('click', async () => {
        console.log("[popup.js] Login button clicked");
        statusDiv.textContent = 'Starting Spotify OAuth...';
        
        const clientId = 'ddfe25c5a2a84c1c92a2cc004312bd6d';
        const redirectUri = chrome.identity.getRedirectURL();
        console.log("[popup.js] Using redirect URI:", redirectUri);
        
        // Generate PKCE verifier/challenge
        const codeVerifier = generateCodeVerifier();
        console.log("[popup.js] Generated codeVerifier:", codeVerifier);
        
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        console.log("[popup.js] Generated codeChallenge:", codeChallenge);
        
        // Save code verifier for later use
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
            // Use Chrome's identity API instead of window.open
            const responseUrl = await chrome.identity.launchWebAuthFlow({
                url: authUrl,
                interactive: true
            });
            
            console.log("[popup.js] Auth response URL:", responseUrl);
            
            // Extract authorization code from response URL
            const urlParams = new URLSearchParams(responseUrl.split('?')[1]);
            const authCode = urlParams.get('code');
            const error = urlParams.get('error');
            
            if (error) {
                console.error("[popup.js] Auth error:", error);
                statusDiv.textContent = `Error: ${error}`;
                return;
            }
            
            if (authCode) {
                console.log("[popup.js] Authorization code received:", authCode);
                statusDiv.textContent = 'Authorization successful! Exchanging code for token...';
                
                // Exchange authorization code for access token
                await exchangeCodeForToken(authCode, codeVerifier, redirectUri);
            }
            
        } catch (error) {
            console.error("[popup.js] Auth flow error:", error);
            statusDiv.textContent = 'Authentication failed. Please try again.';
        }
    });
});

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
            // Save tokens to storage
            await chrome.storage.local.set({
                access_token: tokenResponse.access_token,
                refresh_token: tokenResponse.refresh_token,
                expires_at: Date.now() + (tokenResponse.expires_in * 1000)
            });
            
            document.getElementById('status').textContent = 'Successfully authenticated with Spotify!';
            console.log("[popup.js] Tokens saved successfully");
        } else {
            console.error("[popup.js] Token exchange failed:", tokenResponse);
            document.getElementById('status').textContent = `Failed to get access token: ${tokenResponse.error}`;
        }
    } catch (error) {
        console.error("[popup.js] Token exchange error:", error);
        document.getElementById('status').textContent = 'Token exchange failed';
    }
}