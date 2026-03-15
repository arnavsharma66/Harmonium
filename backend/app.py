import os
import requests
from flask import Flask, redirect, request, jsonify, session
from flask_cors import CORS
from authlib.integrations.flask_client import OAuth

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "change-this-in-production")

# Allow requests from your Vercel frontend
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5500")
CORS(app, origins=[FRONTEND_URL], supports_credentials=True)

# ── OAuth setup ──
oauth = OAuth(app)
google = oauth.register(
    name="google",
    client_id=os.environ["GOOGLE_CLIENT_ID"],
    client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": "openid email profile https://www.googleapis.com/auth/youtube.readonly",
        "token_endpoint_auth_method": "client_secret_post",
    },
)

YOUTUBE_API = "https://www.googleapis.com/youtube/v3"


# ── helpers ──
def yt(path, params=None):
    """Make a YouTube API call using the user's stored access token."""
    tok = session.get("access_token")
    if not tok:
        return None, 401
    url = f"{YOUTUBE_API}{path}"
    r = requests.get(url, headers={"Authorization": f"Bearer {tok}"}, params=params or {})
    if r.status_code == 401:
        session.clear()
        return None, 401
    if not r.ok:
        return None, r.status_code
    return r.json(), 200


def authed():
    return "access_token" in session


# ── auth routes ──
@app.route("/auth/login")
def login():
    redirect_uri = request.host_url.rstrip("/") + "/auth/callback"
    return google.authorize_redirect(redirect_uri)


@app.route("/auth/callback")
def callback():
    token = google.authorize_access_token()
    session["access_token"] = token["access_token"]
    # fetch user info and store
    userinfo = token.get("userinfo") or google.userinfo()
    session["user"] = {
        "name": userinfo.get("name", ""),
        "email": userinfo.get("email", ""),
        "picture": userinfo.get("picture", ""),
    }
    return redirect(f"{FRONTEND_URL}?logged_in=1")


@app.route("/auth/logout")
def logout():
    session.clear()
    return redirect(FRONTEND_URL)


@app.route("/auth/me")
def me():
    if not authed():
        return jsonify({"error": "not authenticated"}), 401
    return jsonify(session.get("user", {}))


# ── YouTube API proxy routes ──
# All routes below just pass the user's own token to YouTube.
# Quota is charged to the USER, not to your Google Cloud project.

@app.route("/api/playlists")
def playlists():
    if not authed():
        return jsonify({"error": "not authenticated"}), 401
    params = {"part": "snippet,contentDetails", "mine": "true", "maxResults": 50}
    if request.args.get("pageToken"):
        params["pageToken"] = request.args["pageToken"]
    data, status = yt("/playlists", params)
    return jsonify(data), status


@app.route("/api/playlist-items")
def playlist_items():
    if not authed():
        return jsonify({"error": "not authenticated"}), 401
    pid = request.args.get("playlistId")
    if not pid:
        return jsonify({"error": "playlistId required"}), 400
    params = {"part": "snippet,contentDetails", "playlistId": pid, "maxResults": 50}
    if request.args.get("pageToken"):
        params["pageToken"] = request.args["pageToken"]
    data, status = yt("/playlistItems", params)
    return jsonify(data), status


@app.route("/api/videos")
def videos():
    if not authed():
        return jsonify({"error": "not authenticated"}), 401
    ids = request.args.get("id")
    if not ids:
        return jsonify({"error": "id required"}), 400
    data, status = yt("/videos", {"part": "snippet,contentDetails", "id": ids})
    return jsonify(data), status


@app.route("/api/liked")
def liked():
    if not authed():
        return jsonify({"error": "not authenticated"}), 401
    params = {"part": "snippet,contentDetails", "myRating": "like", "maxResults": 50}
    if request.args.get("pageToken"):
        params["pageToken"] = request.args["pageToken"]
    data, status = yt("/videos", params)
    return jsonify(data), status


@app.route("/api/history")
def history():
    if not authed():
        return jsonify({"error": "not authenticated"}), 401
    params = {"part": "snippet,contentDetails", "mine": "true", "maxResults": 50}
    data, status = yt("/activities", params)
    return jsonify(data), status


@app.route("/api/search")
def search():
    if not authed():
        return jsonify({"error": "not authenticated"}), 401
    q = request.args.get("q", "")
    if not q:
        return jsonify({"error": "q required"}), 400
    params = {
        "part": "snippet",
        "q": q,
        "type": "video",
        "maxResults": 25,
        "videoCategoryId": "10",
    }
    data, status = yt("/search", params)
    return jsonify(data), status


@app.route("/health")
def health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
