import os
import uuid
import requests
from flask import Flask, redirect, request, jsonify
from flask_cors import CORS
from authlib.integrations.flask_client import OAuth

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "fallback-secret-key-change-me")

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5500").rstrip("/")

ALLOWED_ORIGINS = [
    FRONTEND_URL,
    "http://localhost:5500",
    "http://localhost:3000",
    "http://127.0.0.1:5500",
]

CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)

# In-memory token store: { harmonium_token: { access_token, user } }
TOKEN_STORE = {}
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


def get_token_data():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    tok = auth[7:]
    return TOKEN_STORE.get(tok)


def yt(path, params=None):
    data = get_token_data()
    if not data:
        return None, 401
    access_token = data["access_token"]
    url = f"{YOUTUBE_API}{path}"
    r = requests.get(url, headers={"Authorization": f"Bearer {access_token}"}, params=params or {})
    if not r.ok:
        return None, r.status_code
    return r.json(), 200


@app.route("/auth/login")
def login():
    redirect_uri = "https://harmonium.onrender.com/auth/callback"
    state = str(uuid.uuid4())
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={os.environ['GOOGLE_CLIENT_ID']}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope=openid%20email%20profile%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.readonly"
        f"&state={state}"
        f"&access_type=offline"
    )
    return redirect(auth_url)


@app.route("/auth/callback")
def callback():
    code = request.args.get("code")
    if not code:
        return redirect(f"{FRONTEND_URL}?error=no_code")

    redirect_uri = "https://harmonium.onrender.com/auth/callback"
    token_resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    if not token_resp.ok:
        return redirect(f"{FRONTEND_URL}?error=token_failed")

    token_data = token_resp.json()
    access_token = token_data.get("access_token")

    user_resp = requests.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    user = user_resp.json() if user_resp.ok else {}

    harmonium_token = str(uuid.uuid4())
    TOKEN_STORE[harmonium_token] = {
        "access_token": access_token,
        "user": {
            "name": user.get("name", ""),
            "email": user.get("email", ""),
            "picture": user.get("picture", ""),
        },
    }

    return redirect(f"{FRONTEND_URL}?h_token={harmonium_token}")


@app.route("/auth/me")
def me():
    data = get_token_data()
    if not data:
        return jsonify({"error": "not authenticated"}), 401
    return jsonify(data["user"])


@app.route("/auth/logout", methods=["POST"])
def logout():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        tok = auth[7:]
        TOKEN_STORE.pop(tok, None)
    return jsonify({"ok": True})


@app.route("/api/playlists")
def playlists():
    if not get_token_data():
        return jsonify({"error": "not authenticated"}), 401
    params = {"part": "snippet,contentDetails", "mine": "true", "maxResults": 50}
    if request.args.get("pageToken"):
        params["pageToken"] = request.args["pageToken"]
    data, status = yt("/playlists", params)
    return jsonify(data), status


@app.route("/api/playlist-items")
def playlist_items():
    if not get_token_data():
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
    if not get_token_data():
        return jsonify({"error": "not authenticated"}), 401
    ids = request.args.get("id")
    if not ids:
        return jsonify({"error": "id required"}), 400
    data, status = yt("/videos", {"part": "snippet,contentDetails", "id": ids})
    return jsonify(data), status


@app.route("/api/liked")
def liked():
    if not get_token_data():
        return jsonify({"error": "not authenticated"}), 401
    params = {"part": "snippet,contentDetails", "myRating": "like", "maxResults": 50}
    if request.args.get("pageToken"):
        params["pageToken"] = request.args["pageToken"]
    data, status = yt("/videos", params)
    return jsonify(data), status


@app.route("/api/history")
def history():
    if not get_token_data():
        return jsonify({"error": "not authenticated"}), 401
    params = {"part": "snippet,contentDetails", "mine": "true", "maxResults": 50}
    data, status = yt("/activities", params)
    return jsonify(data), status


@app.route("/api/search")
def search():
    if not get_token_data():
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
