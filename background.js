chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'spotify-auth-code') {
    const authCode = message.code;
    console.log('Received auth code:', authCode);

    await exchangeAuthCodeForToken(authCode);

    sendResponse({ success: true });
  }
});

async function exchangeAuthCodeForToken(authCode) {
  const clientId = 'ddfe25c5a2a84c1c92a2cc004312bd6d';
  const redirectUri = 'chrome-extension://cfimnpeelhammhmohonddcgfiihelane/callback.html';

  const codeVerifier = await getCodeVerifier();

  if (!codeVerifier) {
    console.error('No code verifier found.');
    return;
  }

  const body = new URLSearchParams();
  body.append('client_id', clientId);
  body.append('grant_type', 'authorization_code');
  body.append('code', authCode);
  body.append('redirect_uri', redirectUri);
  body.append('code_verifier', codeVerifier);

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const data = await response.json();

    if (data.access_token) {
      console.log('Access token received:', data.access_token);
      chrome.storage.local.set({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        token_timestamp: Date.now()
      });
    } else {
      console.error('Error getting access token:', data);
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

function getCodeVerifier() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['code_verifier'], (result) => {
      resolve(result.code_verifier);
    });
  });
}
