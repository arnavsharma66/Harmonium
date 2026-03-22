import os
import requests
from flask import Flask, redirect, request, jsonify
from flask_cors import CORS

app = Flask(__name__)

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5500").rstrip("/")
CORS(app, origins=[FRONTEND_URL, "http://localhost:5500", "http://localhost:3000"])

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = "https://harmonium.onrender.com/auth/callback"
YOUTUBE_API = "https://www.googleapis.com/youtube/v3"


@app.route("/auth/login")
def login():
    scope = "openid email profile https://www.googleapis.com/auth/youtube.readonly"
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        "&response_type=code"
        f"&scope={requests.utils.quote(scope)}"
    )
    return redirect(auth_url)


@app.route("/auth/callback")
def callback():
    code = request.args.get("code")
    if not code:
        return redirect(f"{FRONTEND_URL}?error=no_code")
    token_resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
        },
    )
    if not token_resp.ok:
        return redirect(f"{FRONTEND_URL}?error=token_failed")
    access_token = token_resp.json().get("access_token")
    if not access_token:
        return redirect(f"{FRONTEND_URL}?error=no_token")
    return redirect(f"{FRONTEND_URL}?token={access_token}")


@app.route("/auth/me")
def me():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return jsonify({"error": "no token"}), 401
    r = requests.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": auth}
    )
    if not r.ok:
        return jsonify({"error": "invalid token"}), 401
    return jsonify(r.json())


@app.route("/auth/logout", methods=["POST"])
def logout():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        requests.post("https://oauth2.googleapis.com/revoke",
                      params={"token": auth[7:]})
    return jsonify({"ok": True})


def proxy_yt(path, extra_params=None):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return jsonify({"error": "not authenticated"}), 401
    params = dict(request.args)
    if extra_params:
        params.update(extra_params)
    r = requests.get(
        f"{YOUTUBE_API}{path}",
        headers={"Authorization": auth},
        params=params
    )
    return jsonify(r.json()), r.status_code


@app.route("/api/liked")
def liked():
    return proxy_yt("/videos", {"myRating": "like", "part": "snippet,contentDetails", "maxResults": "50"})


@app.route("/api/playlists")
def playlists():
    return proxy_yt("/playlists", {"mine": "true", "part": "snippet,contentDetails", "maxResults": "50"})


@app.route("/api/playlist-items")
def playlist_items():
    return proxy_yt("/playlistItems", {"part": "snippet,contentDetails", "maxResults": "50"})


@app.route("/api/videos")
def videos():
    return proxy_yt("/videos", {"part": "snippet,contentDetails"})


@app.route("/api/search")
def search():
    return proxy_yt("/search", {"part": "snippet", "type": "video", "maxResults": "15"})


@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "harmonium-backend"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
