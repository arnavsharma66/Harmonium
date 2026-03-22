import os
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS
import requests

app = Flask(__name__)

# Environment variables
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("REDIRECT_URI", "http://localhost:5000/auth/callback")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

# Enable CORS precisely for frontend domains
CORS(app, origins=[FRONTEND_URL, "https://harmonium.vercel.app"])


# --- AUTH ENDPOINTS ---

@app.route('/auth/login')
def auth_login():
    """Redirect to Google OAuth consent screen."""
    scope = "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile"
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        "?response_type=code"
        f"&client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&scope={scope}"
    )
    return redirect(auth_url)


@app.route('/auth/callback')
def auth_callback():
    """Handle Google OAuth redirect, exchange code for token, redirect to frontend."""
    code = request.args.get('code')
    if not code:
        return redirect(f"{FRONTEND_URL}?error=missing_code")
        
    # Exchange code for token
    token_url = "https://oauth2.googleapis.com/token"
    payload = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code"
    }
    response = requests.post(token_url, data=payload)
    token_data = response.json()
    
    access_token = token_data.get('access_token')
    if access_token:
        # Pass the token back to the frontend in URL query
        return redirect(f"{FRONTEND_URL}?token={access_token}")
    else:
        # Optional: capture full error for logging if needed
        return redirect(f"{FRONTEND_URL}?error=token_exchange_failed")


@app.route('/auth/me')
def auth_me():
    """Validate token and get user profile data."""
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return jsonify({"error": "No token provided"}), 401
        
    url = "https://www.googleapis.com/oauth2/v1/userinfo?alt=json"
    response = requests.get(url, headers={"Authorization": auth_header})
    
    if response.status_code == 200:
        return jsonify(response.json()), 200
        
    return jsonify({"error": "Invalid token"}), 401


@app.route('/auth/logout', methods=['POST'])
def auth_logout():
    """Revoke token (optional). The frontend mainly clears its localStorage."""
    auth_header = request.headers.get('Authorization')
    if auth_header:
        token = auth_header.replace("Bearer ", "")
        requests.post("https://oauth2.googleapis.com/revoke", params={"token": token})
    return jsonify({"success": True}), 200


# --- YOUTUBE API PROXIES ---

def proxy_yt_request(endpoint, default_params=None):
    """Proxy generic requests to YouTube Data API using the user's token."""
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return jsonify({"error": "No token provided"}), 401
    
    url = f"https://www.googleapis.com/youtube/v3/{endpoint}"
    
    # Merge query default params with incoming query string
    params = dict(request.args)
    if default_params:
        for k, v in default_params.items():
            params.setdefault(k, v)
            
    response = requests.get(url, headers={"Authorization": auth_header}, params=params)
    return jsonify(response.json()), response.status_code


@app.route('/api/liked')
def api_liked():
    """Proxy request to fetch the user's liked videos."""
    return proxy_yt_request("videos", {
        "myRating": "like",
        "part": "snippet,contentDetails",
        "maxResults": 50
    })

@app.route('/api/playlists')
def api_playlists():
    """Proxy request to fetch the user's playlists."""
    return proxy_yt_request("playlists", {
        "mine": "true",
        "part": "snippet,contentDetails",
        "maxResults": 50
    })

@app.route('/api/playlist-items')
def api_playlist_items():
    """Proxy request to fetch items for a specific playlist."""
    return proxy_yt_request("playlistItems", {
        "part": "snippet,contentDetails",
        "maxResults": 50
    })

@app.route('/api/videos')
def api_videos():
    """Proxy request to fetch specific videos by ID."""
    return proxy_yt_request("videos", {
        "part": "snippet,contentDetails"
    })

@app.route('/api/search')
def api_search():
    """Proxy request for YouTube Search API."""
    return proxy_yt_request("search", {
        "part": "snippet",
        "type": "video",
        "maxResults": 15 # Default pagination
    })

# --- HEALTH ---
@app.route('/health')
def health_check():
    return jsonify({"status": "ok", "service": "harmonium-backend"}), 200


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    debug_mode = os.environ.get("FLASK_DEBUG", "False").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
