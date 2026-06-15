# Deployment Steps

## 1. Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/ourparty.git
git push -u origin master
```

## 2. Deploy on Render

1. Go to https://render.com and sign in (free account)
2. Click "New" → "Web Service"
3. Connect your GitHub repo `ourparty`
4. Render auto-detects `render.yaml` — confirm settings
5. Click "Create Web Service"
6. Wait ~2 minutes for build to complete
7. Copy your service URL — looks like `https://ourparty-server.onrender.com`

## 3. Verify server is live

Open your browser and visit: `https://your-service-url.onrender.com/`

Expected response: `{"status":"ok"}`

## 4. Wire the URL into the extension

In `extension/background.js`, replace:
```javascript
const SERVER_URL = "wss://YOUR-RENDER-URL.onrender.com";
```
with (use your actual URL):
```javascript
const SERVER_URL = "wss://your-service-url.onrender.com";
```

In `extension/popup.js`, replace:
```javascript
const SERVER_HTTP = "https://YOUR-RENDER-URL.onrender.com";
```
with:
```javascript
const SERVER_HTTP = "https://your-service-url.onrender.com";
```

Then commit:
```bash
git add extension/background.js extension/popup.js
git commit -m "chore: set production Render server URL"
git push
```

## 5. Load extension in Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked" → select the `extension/` folder
4. Do this on both your machine and your partner's machine
