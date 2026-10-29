# Nocturne

Nocturne is a private, cinematic streaming front end for an existing **Plex Media Server**.
Plex keeps the files, metadata, transcoder, and watch history. Nocturne gives that library a
distinct interface: a cinematic hero, a black-and-red top-navigation layout, horizontal artwork
rows, a ranked Top 10, My List, real resume progress, search, library browsing, title and season
details, and an in-app player that streams straight from Plex.

**Current version:** 1.1.0 — desktop and responsive web with the streaming redesign, My List, and in-app playback, focused on Windows + Plex.

**New to Nocturne?** Follow the step-by-step **[download and Windows installation guide](TUTORIAL.md)**.

---

## What works in this first version

- Connects to your existing Plex server without adding another media server.
- Plex PIN sign-in with automatic server discovery.
- Manual Plex token + server address fallback.
- Cinematic home page built entirely from your Plex data:
  - Continue Watching from Plex On Deck
  - Recently Added
  - Top 10 in Your Library Today, with ranked artwork
  - Popular Movies
  - TV Shows
  - Top Rated
  - Up to four populated genre collections
- Black-and-red streaming interface with a top navigation bar, hover actions, and landscape artwork cards.
- A full library browser on Home: every Plex movie and TV library gets a tab, every title is listed,
  and more pages load automatically as you scroll.
- My List, saved in this browser on this PC, with an automatic My List home row.
- Real posters, backdrops, summaries, ratings, years, content ratings, cast, and genres.
- Search across the Plex library, including episode names.
- Paginated movie and TV library pages with sorting.
- Movie and series detail pages, season switching, episode lists, and watch progress.
- Built-in player with resume, seeking, volume, fullscreen, keyboard shortcuts, and buffering states.
- Direct play for browser-compatible files; automatic Plex HLS transcoding for everything else.
- Watch progress and finished titles are written back to Plex, so Continue Watching stays current.
- Plex token and all Plex API requests stay on the local backend. The browser never receives the token.
- Loading skeletons, empty states, connection errors, retry actions, and a Plex-offline banner.
- Responsive layout for desktop, tablet, and mobile, with a TV-oriented larger layout at wide viewports.

The app never renames, moves, deletes, or modifies your media files. It only reads library metadata
and artwork from Plex.

---

## The short Windows version

1. Install **Node.js 24 LTS**.
2. Put this project folder somewhere convenient, for example
   `C:\Users\<YourName>\Projects\Nocturne`.
3. Open **PowerShell** in that folder.
4. Run `npm install`.
5. Make sure Plex Media Server is running.
6. Run `npm run dev`.
7. Open **http://127.0.0.1:5173** in Edge.
8. Complete the Plex sign-in screen.

For daily use after the first setup, run `npm start` instead and open **http://127.0.0.1:8787**.

---

## 1. Check Node.js

Open **PowerShell** (press `Win`, type `PowerShell`, press Enter) and run:

```powershell
node --version
npm --version
```

You want Node **22.12 or newer**; Node 24 LTS is the recommended version.

If Node is missing, either install it from <https://nodejs.org/> (choose the LTS installer), or run:

```powershell
winget install --id OpenJS.NodeJS.LTS -e --source winget
```

Close PowerShell and open it again after installing. Re-run `node --version` to confirm.

> If PowerShell says `npm.ps1 cannot be loaded because running scripts is disabled`, use
> `npm.cmd` instead of `npm` (for example `npm.cmd install`), or change the policy only for your
> own account with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` and confirm.

## 2. Put the project in a known folder

Nocturne is a standalone project. The folder containing `package.json` is the Nocturne folder.
On Windows, a sensible path is:

```text
C:\Users\<YourName>\Projects\Nocturne
```

In PowerShell, replace `<YourName>` and enter the real path:

```powershell
cd C:\Users\<YourName>\Projects\Nocturne
```

Confirm you are in the right place:

```powershell
Get-ChildItem
```

You should see `package.json`, `server`, `src`, and this `README.md`.

## 3. Install the app dependencies

```powershell
npm install
```

This does not install Plex or modify it. It downloads the React, Vite, and Express packages used
by Nocturne into `node_modules`.

## 4. Start Plex first

Make sure **Plex Media Server** is running and that this address loads in Edge:

```text
http://127.0.0.1:32400/web
```

Nocturne expects Plex on this PC in the default first version. If Plex is on another machine, you can
use the manual server address on Nocturne's setup screen (for example `http://192.168.1.50:32400`),
provided the PC running Nocturne can reach it.

## 5. Start Nocturne during setup/development

```powershell
npm run dev
```

This starts two local processes:

- the Nocturne API on `http://127.0.0.1:8787`
- the Vite interface on `http://127.0.0.1:5173`

Open **http://127.0.0.1:5173** in Microsoft Edge.

Keep the PowerShell window open while you use Nocturne. Press `Ctrl+C` in that window to stop it.

## 6. Connect your Plex account

On the Nocturne setup screen:

1. Click **Sign in to Plex**. A Plex page opens in a new tab.
2. Sign in with your normal Plex account.
3. If Plex asks for the one-time code, it is already shown in Nocturne (for example `N00VA`).
4. Return to the Nocturne tab. It detects the sign-in automatically and finds your server.
5. Nocturne opens your home page with your real library.

Nocturne asks Plex for a token, then stores that token **only on this PC** in
`data/config.json`. The browser never receives the token. Nocturne never sees your Plex password.

### If automatic sign-in cannot find your server

Use **Use a Plex token instead** on the setup screen:

1. In Plex Web, open any movie or episode.
2. Open its **…** menu and choose **Get Info** (or **View XML**).
3. In the XML page URL, find `X-Plex-Token=...`.
4. Copy the token value only.
5. Paste it into Nocturne along with the optional server address
   (`http://127.0.0.1:32400` if Plex is on this PC).
6. Click **Connect with token**.

Plex's official instructions: <https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/>

Do not paste your token into chat, screenshots, a public repository, or any website. Nocturne stores it
locally so you do not need to handle it again.

## 7. Daily use after restarting your PC

1. Start **Plex Media Server**.
2. Open PowerShell.
3. Go to the Nocturne folder:

   ```powershell
   cd C:\Users\<YourName>\Projects\Nocturne
   ```

4. Start the production build:

   ```powershell
   npm start
   ```

5. Open **http://127.0.0.1:8787** in Edge.

`npm start` builds the current Nocturne interface and starts the local server in one step. The first
build takes a few seconds. Keep the PowerShell window open; `Ctrl+C` stops Nocturne.

If you are actively editing code, use `npm run dev` instead and open `http://127.0.0.1:5173`.
Vite reloads the interface as you save files.

There is no separate database or cloud service to start. The Plex connection is remembered in
`data/config.json`.

---

## Playback: how the in-app player works

Every **Play** and **Resume** button now opens Nocturne's own full-screen player. Playback still
runs on your Plex server; Nocturne is the screen in front of it.

1. Nocturne asks Plex for the movie or episode and its media file.
2. If the browser can play that file as-is (MP4/M4V/WebM with H.264/VP8/VP9/AV1 video and
   AAC/MP3/Opus/Vorbis audio), the player streams the original file with HTTP range requests.
   This is **direct play** and starts instantly.
3. Otherwise Plex's universal transcoder converts the file to HLS in real time and Nocturne proxies
   the playlist and segments. The player badge shows **Plex transcode**.

All Plex requests, including the token and the transcode session, stay on the backend. The browser
only sees opaque, temporary Nocturne session IDs. Those sessions expire after six hours or when the
player closes.

### Player controls

- Click the video or press **Space** / **K** to play or pause.
- **← / →** skip 10 seconds, **J / L** skip 30 seconds.
- **↑ / ↓** change volume, **M** mutes, **F** toggles fullscreen, **Esc** closes the player.
- The scrub bar supports mouse, touch, and keyboard seeking.
- Resume points are read from Plex. Progress is sent while playing, when pausing, and when closing;
  finishing a title marks it watched in Plex and updates Continue Watching.

### Playback behaviour to expect

- A transcoded stream starts a few seconds slower than direct play because Plex has to prepare it.
- Seeking inside a transcoded title restarts the Plex transcode at the new position. That is reliable
  across Plex versions, but it is not instant like direct play.
- Subtitle track selection is not implemented yet. Titles that rely on external subtitle tracks may
  play without subtitles. Audio track selection is also not exposed yet.
- The player falls back to **Open in Plex** if Plex cannot produce a stream. That button opens the
  exact title in Plex Web and contains no token.

Nocturne never modifies your media files or your Plex installation. It only asks Plex to read and
stream them.

---

## Security and privacy

- The Plex token is stored in `data/config.json` on the local machine, with restrictive file
  permissions where the operating system supports them.
- The browser calls Nocturne's local API; the API adds the Plex token to Plex requests.
- Artwork is proxied through Nocturne as well, because Plex image URLs also require the token.
- The API binds to `127.0.0.1` only. It is not reachable from your LAN by default.
- The built app sends a strict Content Security Policy and state-changing API calls reject
  cross-origin requests.
- `.env`, `data/`, `dist/`, `node_modules/`, and `.tools/` are git-ignored.

**Do not change `HOST` to `0.0.0.0` and expose port 8787 to the internet.** Nocturne currently trusts
requests from your local machine and has no account system of its own. A future remote/TV version
needs real authentication in front of the API.

---

## Project structure

```text
Nocturne/
├─ server/
│  ├─ index.js        Local Express API, setup routes, static hosting, security headers
│  ├─ plexAuth.js     Plex PIN sign-in, plex.tv resource discovery, token validation
│  ├─ plex.js         Server-side Plex API client, image proxy, Plex Web deep links
│  ├─ player.js       In-app playback sessions, direct streaming, HLS proxy, Plex progress
│  ├─ nocturne.js     Plex → Nocturne normalization, home rows, search, details, libraries
│  ├─ cache.js        Short-lived in-memory cache for Plex reads
│  └─ config.js       Local data/config.json management; never exposed to the browser
├─ src/
│  ├─ components/     App shell, top nav, hero, rows, cards, player overlay, skeletons, states
│  ├─ player/         Player state provider shared by every Play button
│  ├─ pages/          Home, Library, Search, My List, Title, Setup, Settings, Not Found
│  ├─ hooks/          Data loading and page title hooks
│  ├─ lib/            Formatting, media helpers, and the localStorage My List store
│  ├─ styles/         Design tokens, shell, components, page styles
│  ├─ api.js          Browser API client (no token handling)
│  └─ App.jsx         Route and health bootstrapping
├─ tools/mock-plex/   Development-only Plex + plex.tv simulator (never used in normal runs)
├─ public/            Favicon
├─ data/              Created at runtime; local Plex token/config (ignored by git)
├─ .env.example       Optional advanced configuration
├─ TUTORIAL.md        Beginner download and installation guide
├─ vite.config.js
└─ package.json
```

### API surface

```text
GET  /api/health
GET  /api/libraries
GET  /api/home?refresh=1
GET  /api/library/:key?sort=recent&start=0&size=60
GET  /api/search?q=...
GET  /api/title/:ratingKey
GET  /api/season/:ratingKey
GET  /api/image?path=...&w=...&h=...
POST /api/auth/pin
GET  /api/auth/pin/:id
POST /api/auth/manual
POST /api/auth/rediscover
POST /api/auth/disconnect
POST /api/player                 → create a temporary playback session
GET  /api/player/:id/master.m3u8 → proxied Plex HLS master playlist
GET  /api/player/:id/hls?u=...    → proxied HLS playlist or segment
GET  /api/player/:id/stream       → direct-play media with range support
POST /api/player/:id/progress     → write playback position to Plex
POST /api/player/:id/stop         → stop the transcode and finalize Plex progress
GET  /api/play/:ratingKey        → 302 fallback to the title in Plex Web (no token in URL)
```

Only the local frontend is intended to call these routes.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API + Vite with hot reload; open `http://127.0.0.1:5173` |
| `npm run build` | Build the production interface into `dist/` |
| `npm start` | Build, then serve Nocturne at `http://127.0.0.1:8787` |
| `npm run mock:plex` | Start the development test Plex server on port 32499 (advanced) |

### Advanced `.env` fallback

The setup screen is the normal path. For automation or troubleshooting, copy `.env.example` to
`.env` and provide both:

```dotenv
PLEX_URL=http://127.0.0.1:32400
PLEX_TOKEN=your-long-plex-token
```

This bypasses the setup screen. `.env` must remain private and is ignored by git. A token in
`data/config.json` from the setup screen takes precedence over `.env`.

### Optional mock Plex for development

The mock is isolated and is not used unless you explicitly start it:

```powershell
# Terminal 1
npm run mock:plex

# Terminal 2, from the same folder
$env:NOCTURNE_DATA_DIR="$PWD\.tools\test-data"
$env:PLEX_TV_BASE_URL="http://127.0.0.1:32499/tv"
$env:PORT="8788"
npm run dev
```

Open `http://127.0.0.1:5173`, complete the mock PIN sign-in, and browse invented test titles.
The mock's manual token is `mock-plex-token-1234567890`. Never use the mock token or server with a
real Plex setup. Use `Remove-Item Env:NOCTURNE_DATA_DIR, Env:PLEX_TV_BASE_URL, Env:PORT` afterwards to
clear the shell variables.

---

## Troubleshooting

### “Nocturne can’t reach its own engine”

The local API is not running. In PowerShell, in the project folder, run `npm run dev` (or
`npm start` after a build), then reload. Make sure you did not close the PowerShell window.

### “Nocturne is not connected to Plex yet” / Plex offline banner

- Start Plex Media Server.
- Test `http://127.0.0.1:32400/web` in Edge.
- Click **Retry** on the banner, or open Settings → **Test connection**.
- If the token was revoked, disconnect in Settings and sign in again.

### Plex sign-in finds the account but not the server

Make sure Plex is running on this PC and reachable at `http://127.0.0.1:32400`. Then use
**Use a Plex token instead** on setup and optionally enter that address. Check that Windows
Firewall is not blocking Plex's local port.

### Port already in use

If PowerShell reports `EADDRINUSE` for 8787 or 5173, another copy is still running. Close the old
Nocturne window, or inspect the listener in PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 8787,5173 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

If you intentionally want a different port, set `PORT=8788` in `.env`; the Vite proxy reads the
same value. Restart both processes afterwards.

### Posters are missing or broken

The image proxy uses the saved Plex token. Confirm the connection in Settings, then reload. Some
Plex versions disable the photo transcoder; Nocturne falls back to the original artwork, but that can
be slower on a large library.

### Build fails after upgrading Node

Nocturne requires Node 22.12+ and is tested on Node 24 LTS. Check `node --version`; install the LTS
release if it is older. The app uses ESM, modern `fetch`, and Vite 8.

### I want to start over with Plex

Settings → **Disconnect Plex** removes the saved token and server details. It does **not** touch
Plex, your media, or your Plex account. Sign in again on the setup screen.

---

## Testing status

This build was verified end to end against an isolated mock Plex + plex.tv API:

- PIN sign-in, server discovery, token storage, manual token fallback, and invalid-token errors.
- Home rows, genre rows, Continue Watching progress, libraries, search, movie details, show
  seasons, episode progress, artwork proxying, and token-leak checks.
- In-app direct playback with real MP4 video, byte-range requests, resume, progress reporting, and
  the ended state.
- In-app HLS playback against a mock transcode with a real HLS playlist and MPEG-TS segment.
- Playback-session authorization, invalid-path rejection, session expiry, and Plex stop calls.
- The black-and-red redesign: top navigation, hero, hover cards, ranked Top 10, My List persistence,
  the all-library Home browser and its automatic paging, title pages, search, library, settings,
  mobile layout, and console errors.
- Production build and local Express hosting.

The actual Plex server at `127.0.0.1:32400` on your Windows PC is not reachable from the build
environment used here, so the final real-server connection and real-transcode playback still need
to be confirmed on your machine. The mock server under `tools/mock-plex` now includes a short test
video and HLS fixture for local player testing. If Plex returns an unexpected response, capture the
error shown by Nocturne and the relevant PowerShell output rather than deleting the project.

---

## Smart TV roadmap — what runs where

One React website does **not** automatically become native apps on every TV. The web version can
run in browsers on PCs and on TVs that provide a usable browser, but the mainstream TV platforms
need separate packaged applications. The good news is that the backend API and design system are
already the reusable core.

| Platform | Route from Nocturne today | Shared with the web app |
| --- | --- | --- |
| Windows / macOS / Linux browsers | Run the React web app now | Full interface |
| Android TV / Google TV | Native Android TV app (Kotlin + Compose for TV), or a TV-focused React Native app | API, design tokens, auth flow patterns; rewrite screens and D-pad navigation |
| Amazon Fire TV | Native Android/Fire TV app | Same as Android TV |
| Samsung Smart TV (Tizen) | Packaged Tizen web app, not the normal website | Can reuse React UI components in a Tizen wrapper; platform packaging, remote keys, and certification are separate work |
| LG webOS | Packaged webOS app | Same idea as Tizen; separate build and device testing |
| Roku | BrightScript / SceneGraph app | API and design language only; screens must be rebuilt |
| Apple TV | Native tvOS app (SwiftUI) | API and design language only; screens must be rebuilt |

Recommended order:

1. **Perfect the web version** on Windows and use it daily. Improve the home rows, search, and
   detail pages with your real library.
2. Add a **TV mode** to the web app: larger type, stronger focus rings, keyboard/D-pad arrow
   navigation, and a ten-foot layout. This helps browser-based TV devices and is required thinking
   for any TV client.
3. Build **Android TV / Fire TV** next. A single Android TV codebase can serve both, supports your
   existing Plex server, and has a mature native video player.
4. Add **Samsung Tizen** and **LG webOS** as packaged web apps if those are your households'
   platforms.
5. Build **Roku** and **Apple TV** only when those devices matter; they are genuinely separate
   clients.

For any TV client, keep the Plex token off the device if possible by hosting the Nocturne API on a
trusted machine, and add real authentication before exposing that API beyond localhost. The web
player and the `/api/player` session API are the reusable playback layer for those clients.

---

## Known limitations in 1.0

- Subtitle and audio-track selection are not implemented. Plex's default streams are used.
- Seeking in a transcoded title restarts the Plex transcode and takes a few seconds.
- Single Plex account and single selected server; switching Plex Home users is not implemented yet.
- My List is stored in this browser, not in Plex. It does not sync between browsers or Plex users
  and is not the same as a Plex watchlist.
- The top navigation shortcuts use the first movie library and first TV library, but the Home
  library browser includes every movie and TV library. Additional libraries also have their own
  pages at `/library/<key>`.
- Genre rows are built from the first movie and first TV library; the full Home browser still covers
  every title in every library.
- No profiles, notifications, rating editing, collection management, or Plex library scanning controls.
- Autoplay next episode and skip-intro are not implemented.
- No Plex music/photo libraries. Nocturne is film and TV focused.
- The UI is optimized for desktop/mobile/large screens; full remote-control navigation is future
  work.
- Remote Plex access, authentication for other devices, and multi-user security are outside the
  1.0 scope.

---

## License / attribution

Nocturne is a personal project and is not affiliated with Plex. Plex, Plex Media Server, and the Plex
logo are trademarks of Plex, Inc. Nocturne only talks to the Plex server you already run.
