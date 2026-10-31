# Nocturne — install and setup guide

This guide takes you from the GitHub page to a working Nocturne app connected to your own Plex
library. It is written for **Windows 10 or 11**.

Nocturne is only an interface. It does not move, rename, delete, or copy your media. Your existing
Plex Media Server keeps the files, metadata, playback engine, and watch history.

**Repository:** <https://github.com/captinfurious/Nocturne>

> The repository may be private. Sign in to GitHub with the account that owns it before
> downloading. To let other people install Nocturne, make the repository public or share a ZIP
> with them.

---

## What you need

- Windows 10 or 11.
- A working **Plex Media Server** on the same PC or on your local network.
- Microsoft Edge (the installer uses its app-window mode; Chrome or Firefox can be used for the
  browser-only mode).
- An internet connection for the first installation.
- About 10 minutes.
- No Node.js setup. If Node is missing, the installer downloads a private, checksum-verified
  runtime and keeps it inside Nocturne.

You do **not** need to install Plex again, change Plex settings, or move your media.

---

## Step 1 — Download Nocturne

Use the ZIP method if you are new to development.

### Option A — Download the ZIP

1. Open <https://github.com/captinfurious/Nocturne> in Edge.
2. Click the green **Code** button.
3. Click **Download ZIP**.
4. Open your **Downloads** folder.
5. Right-click `Nocturne-main.zip` and choose **Extract All…**.
6. Extract it somewhere easy to find, for example:

   ```text
   C:\Users\<YourName>\Projects\Nocturne
   ```

> **Important:** Do not run the installer from inside the ZIP. Windows lets you browse a ZIP like
> a folder, but Nocturne needs a real extracted folder.

If the inner folder is called `Nocturne-main`, you can rename it to `Nocturne`. Either name works.

### Option B — Clone with Git

Install **Git for Windows** from <https://git-scm.com/download/win> if needed. Then open
PowerShell and run:

```powershell
cd "C:\Users\<YourName>\Projects"
git clone https://github.com/captinfurious/Nocturne.git
cd Nocturne
```

A private repository asks you to sign in to GitHub. Use your normal GitHub account.

---

## Step 2 — Install the Windows app

1. Start **Plex Media Server**.
2. Open the extracted Nocturne folder.
3. Double-click **`Start Nocturne.cmd`** at the top of the folder.

A console window opens and walks through the install. The first build can take a minute or two.
The same file opens the installed app afterwards, and it runs the installer again when the project
contains a newer version. To change startup settings directly, use
`windows\Install Nocturne.cmd`.

### If Windows shows a SmartScreen warning

Click **More info**, then **Run anyway**.

Nocturne is not code-signed. The installer and `Nocturne.exe` are built locally from the plain-text
scripts in `windows\`; they are not a commercial signed installer. Windows Defender or SmartScreen
may warn about any unsigned app. Nocturne's own installer writes inside your user profile and does
not request Administrator rights. It downloads Node into the app folder when needed; it does not
install Node system-wide.

### If Node.js is missing

The installer offers to download the current Node.js LTS runtime (about 40 MB) into Nocturne's own
folder. Answer **Y**. It verifies the download's published SHA-256 checksum before using it. You do
not need to install Node yourself.

If the download fails, the installer can fall back to `winget` or you can install Node from
<https://nodejs.org/> and run `windows\Install Nocturne.cmd` again.

### Choose startup

The installer asks:

```text
Start Nocturne server automatically when you sign in to Windows? [Y/n]
```

Press **Enter** for Yes. The default adds one shortcut to your personal Startup folder. It starts
the local Nocturne server about **15 seconds after you sign in**, hidden in the background, so
Plex has time to start too. It does not open a browser window at login.

Answer **n** if you prefer to start Nocturne only when you open it.

### What the installer creates

Nocturne installs per Windows account:

| What | Where |
| --- | --- |
| App, launcher, local server, Node runtime | `%LOCALAPPDATA%\Programs\Nocturne` |
| Plex token and app settings | `%LOCALAPPDATA%\Nocturne\data` |
| Launcher log | `%LOCALAPPDATA%\Programs\Nocturne\logs\launcher.log` |
| Server log | `%LOCALAPPDATA%\Programs\Nocturne\logs\server.log` |
| Desktop shortcut | `Nocturne.lnk` |
| Start Menu | `Nocturne` folder with the app, **Stop**, and **Uninstall** |
| Optional startup entry | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Nocturne.lnk` |

The installed app picks a private loopback port for your Windows account (usually 8800–9299), so
separate Windows accounts normally get separate local servers instead of both using port 8787.
Source mode still uses port 8787.

Nocturne does **not** install a Windows service, change Plex, alter media files, add firewall rules,
change the hosts file, or write to `Program Files`. The Node runtime is a private file inside
Nocturne's app folder, not a system-wide Node installation.

At the end, Nocturne opens in a standalone Edge app window. The downloaded project folder is no
longer needed to run the app, but keep it if you want to update Nocturne later. Because the Node
runtime is bundled, you can remove or update a separately installed Node.js without breaking
Nocturne.

---

## Step 3 — Connect your Plex account

The first launch shows Nocturne's setup screen.

1. Click **Sign in to Plex**.
2. A Plex login page opens.
3. Sign in with your normal Plex account.
4. If Plex asks for a one-time code, copy it from the Nocturne setup screen.
5. Return to Nocturne. It detects the sign-in and finds your server automatically.
6. Your home page appears with real content from your Plex library.

Nocturne stores the Plex token **only on this PC**, in
`%LOCALAPPDATA%\Nocturne\data\config.json`. The browser never receives the token. Nocturne never
sees your Plex password.

### If Nocturne cannot find your server

On the setup screen, click **Use a Plex token instead** or **Connect with a token and server
address**. You need:

- a Plex token, and
- your server address, such as `http://127.0.0.1:32400`.

Plex's official token instructions:
<https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/>

Do not post your token in a GitHub issue, screenshot, chat, or public file. Treat it like a
password.

### Installing for another person

Nocturne is per Windows account, not per PC. Each person who wants to use it should:

1. Have access to a Plex server (their own, or a library shared with their Plex account).
2. Download or receive the Nocturne project folder.
3. Run `Start Nocturne.cmd` while signed in to their own Windows account.
4. Sign in with their own Plex account.

Never copy someone else's `data\config.json` or Plex token. Giving someone a Plex token gives them
access to that Plex account and its libraries.

Nocturne has no user accounts of its own. Plex controls which libraries each Plex account can see.
If someone cannot see a library in Plex Web, Nocturne cannot show it to them either.

---

## Step 4 — Daily use

1. Start **Plex Media Server**.
2. Open **Nocturne** from the Start Menu or desktop.

If you enabled startup, the server is already running in the background after you sign in.
Opening the shortcut just reopens the app window.

**Closing the Nocturne window stops playback but leaves the server running** so the next launch is
fast. To restart or stop it from inside the app, go to **Settings → Local server → Server
controls**. Stopping Nocturne opens a private control page at an address like
`http://127.0.0.1:8801` (one port above Nocturne's own address). Use **Start server** there to
bring Nocturne back without finding the Start Menu. The control page only works on the PC itself.

You can also stop everything with Start Menu → **Nocturne** → **Stop Nocturne**. Signing out or
restarting Windows also stops it.

### Watch on another device on your Wi-Fi

You can open the same Nocturne app in a browser on a phone, tablet, or TV without installing
anything else there.

1. On the PC, open Nocturne and go to **Settings → Network**.
2. Turn on **Watch from another screen**.
3. Nocturne shows an address such as `http://192.168.1.25:8800`. Type that exact address into the
   other device's browser. It must be on the same Wi-Fi or wired network.
4. Keep the PC awake and leave Plex and Nocturne running. Playback still comes from Plex on the PC.

If the page does not load, allow **Node.js** (the bundled runtime is `runtime\node.exe`) or
**Nocturne** through Windows Firewall for **Private** networks. The first launch may show a Windows
firewall prompt; choose **Allow** on private networks. Guest Wi-Fi and routers with “AP isolation”
block device-to-device traffic, so use the main home Wi-Fi.

LAN mode is off by default. While it is on, anyone on your Wi-Fi who knows the address can open
Nocturne and watch your library. Turn it off in Settings when you do not need it. Plex connection
and network changes only work on the PC itself, so another device cannot disconnect Plex. Do **not**
forward this port on your router or expose it to the internet; there is no separate Nocturne
account login.

If Settings says **No usable network address was found**, check that the PC is on Wi-Fi or Ethernet.
If you created a `.env` file and set `HOST=127.0.0.1`, remove that line and restart Nocturne.

### Turn startup on or off

Run `windows\Install Nocturne.cmd` again:

- Answer **Y** to enable startup.
- Answer **n** to disable it.

The installer updates the app, keeps your Plex sign-in, and refreshes the shortcuts. You can also
remove only the startup entry:

```powershell
Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Nocturne.lnk" -ErrorAction SilentlyContinue
```

### Update Nocturne

1. Download the newest project version (ZIP or `git pull`).
2. Close the Nocturne app window.
3. Run `Start Nocturne.cmd` from the new folder. It detects the version change and runs the
   installer; if the version is unchanged, it simply opens the app.
4. Answer the startup question again, or run `windows\Install Nocturne.cmd` directly if you want
   to change startup settings.

The installer stops the old background server, rebuilds Nocturne, and replaces the app files.
Your Plex sign-in in `%LOCALAPPDATA%\Nocturne\data` is kept.

### Uninstall Nocturne

Start Menu → **Nocturne** → **Uninstall Nocturne**. If that entry is missing, run
`windows\Uninstall Nocturne.cmd` from the downloaded project.

It removes the app and shortcuts. It asks separately before deleting your saved Plex sign-in, and
it never touches Plex, your account, or your media. A reinstall keeps the sign-in unless you chose
to delete it.

---

## Playback in Nocturne

Press **Play** or **Resume** and the video opens inside Nocturne. You do not need to switch to
Plex Web. Plex is still doing the actual work behind the scenes.

Nocturne uses two playback paths automatically:

- **Direct play** — the file is already browser-friendly (usually MP4 with H.264 video and AAC
  audio). Playback starts immediately.
- **Plex transcode** — the file uses a container or codec the browser cannot handle (very common
  for MKV or HEVC). Plex converts it while you watch, and Nocturne displays a small
  **Plex transcode** badge.

You can play, pause, skip 10 seconds, drag the progress bar, change the volume, and go fullscreen.
The keyboard shortcuts are **Space** (play/pause), **← / →** (10 seconds), **J / L** (30 seconds),
**↑ / ↓** (volume), **M** (mute), **F** (fullscreen), **C** (audio and subtitles), and **Esc**
(close the menu or the player).

Click the speech-bubble icon in the player controls to choose an **audio track** or **subtitles**.
Text subtitles appear immediately. Nocturne first checks that Plex can actually deliver the track;
if it cannot, it automatically restarts the stream and asks Plex to burn that subtitle into the
picture. Image subtitle formats such as PGS always use burn-in, so the stream restarts briefly when
you pick one. **Skip Intro** appears while Plex's detected intro is playing. When an episode ends,
Nocturne counts down to the next episode and plays it automatically unless you press
**Cancel autoplay**.

**Progress is saved to Plex.** If you stop halfway through, the title appears in Continue Watching
at that position. If you watch to the end, Plex marks it watched.

A few things to know:

- A transcoded video may take a few seconds to start, especially for 4K or HEVC files.
- Seeking in a transcoded video restarts the conversion at the new position, so it can pause for a
  few seconds. Direct-play files seek instantly.
- Switching audio tracks or picking an image subtitle restarts the Plex stream at your current
  position, so expect a short pause.
- Skip Intro only appears when Plex has analysed that episode's intro. Autoplay needs another
  episode to exist after the current one.
- If a title cannot be streamed, use **Open in Plex** from the player's error screen.

Nocturne only reads and streams from Plex. It never changes your media files, codecs, or Plex
library settings.

---

## Troubleshooting

### Nothing opens when I double-click the Nocturne shortcut

The launcher waits up to 30 seconds for the local server, then shows an error with a log path.
Open:

```text
%LOCALAPPDATA%\Programs\Nocturne\logs\launcher.log
%LOCALAPPDATA%\Programs\Nocturne\logs\server.log
```

Common causes:

- **The bundled Node runtime is missing or blocked.** Run the installer again. If antivirus keeps
  blocking it, install Node 22.12 or newer manually and rerun the installer so it can bundle that
  copy instead.
- **The app's local port is already used by another program.** Run the installer again; it picks a
  different private port. Source mode uses 8787.
- **Antivirus blocked the launcher.** Allow `Nocturne.exe` for your own user account, or inspect
  the scripts and run from source instead.

### "Nocturne can't reach its own engine"

The local API did not start. Open Start Menu → **Nocturne** → **Stop Nocturne**, then open the app
again. If it keeps failing, read the server log above.

### "Nocturne is not connected to Plex yet"

Complete the setup screen. If Plex was working before, open **Settings** and click
**Test connection**, or sign in again.

### Subtitles do not appear

- Pick the subtitle again from the player's speech-bubble menu. Nocturne now verifies the track and
  retries with Plex burn-in when the text version fails.
- When burn-in is used, the player shows **Plex is burning this subtitle into the video**. Give Plex
  a few seconds to prepare the restarted stream.
- Try another subtitle track. A damaged or empty external subtitle file can still have nothing to
  display even after burn-in.
- Image formats such as PGS always require Plex to transcode. Check that Plex is not overloaded; 4K
  burn-in can take a while on a slow CPU.
- If it still fails, look at `%LOCALAPPDATA%\Programs\Nocturne\logs\server.log` for a line beginning
  with `[Nocturne] Could not load subtitle`, and open the same title in Plex Web to compare.

### Another device cannot open Nocturne

- Confirm **Settings → Network → Watch from another screen** is on and use the address shown there.
- Both devices must be on the same home network. Guest Wi-Fi, VPNs, and AP isolation can block it.
- Allow Node.js or Nocturne through Windows Firewall for **Private** networks.
- The PC must be awake; sleep stops the server.
- If the page says **This device is not allowed in yet**, LAN mode is off. Turn it on from the PC.
- Do not port-forward the address; LAN mode is not intended for internet access.

### "Plex is offline"

- Start Plex Media Server.
- Test `http://127.0.0.1:32400/web` in Edge.
- Click **Retry** in Nocturne.
- If you use a different port, enter that address on the Nocturne setup screen.

### Plex sign-in finds my account but not my server

Make sure Plex is running on this PC and reachable at `http://127.0.0.1:32400`. Then use the
manual token/server-address option. If Plex is on another PC, use that PC's LAN address and make
sure Windows Firewall allows Plex on the local network.

### "Port already in use" / EADDRINUSE

The installed app uses a private per-account port near 8800, so this is mostly a source-mode
problem. Another copy of Nocturne may still be running. Use Start Menu → **Nocturne** →
**Stop Nocturne**, then reopen the app. To see what is using the source-mode ports:

```powershell
Get-NetTCPConnection -LocalPort 8787,5173 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

If you intentionally use a different port in source mode, set `PORT=8788` in a local `.env` file.
The Vite proxy reads the same setting. The installed app chooses its own port.

### Playback will not start or keeps buffering

- Confirm Plex Media Server is running and can play the same title in Plex Web.
- A transcode needs CPU time. On a low-power PC, 4K files may take a while to start; try a 1080p
  title first.
- Close other browser tabs using the player, then retry. Each open player keeps a Plex transcode
  session alive.
- If Nocturne shows a technical error, open **Plex Web** with the same title once. If it also fails
  there, the problem is in Plex or the media file, not Nocturne.
- Use **Open in Plex** on the error screen as a fallback while you investigate.

### The player is silent

Click the speaker icon in the player controls or press **M**. Browsers sometimes block autoplay with
sound until you interact with the page. Click the big play button if it appears.

### My posters are missing

Confirm the Plex connection in **Settings**, then reload. Nocturne proxies artwork through its
local backend because Plex image paths also require authentication.

### I want to disconnect or start over

Open **Settings → Disconnect Plex**. This removes the saved token and server details from
Nocturne. It does not change Plex, your account, or any media file.

To remove the app completely, use **Uninstall Nocturne** in the Start Menu.

### The interface says "previous Plex connection expired"

Plex rejected the saved token. Sign in again on the setup screen. This does not mean your media is
damaged. It usually means the token was revoked or the Plex account password changed.

---

## Advanced: run from source

Use this only if you are changing Nocturne or the installer does not work. Source mode still
requires Node.js 22.12 or newer and `npm`. The normal app install above is the recommended path.

From PowerShell in the folder containing `package.json`:

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. For the production build:

```powershell
npm start
```

Open `http://127.0.0.1:8787`. This also starts the local control page at
`http://127.0.0.1:8788`, reachable from **Settings → Local server**. Keep the PowerShell window
open; `Ctrl+C` stops Nocturne. (`npm run dev` starts the browser app and API only, without the
installed server controls.)

Source mode stores its sign-in in the project's `data\config.json`, separate from the installed
app. The mock Plex server in `tools\mock-plex` is for development only. Never point a real Plex
token at it.

---

## Privacy and safety

- Nocturne's backend accepts this PC and, only when you enable LAN mode, private addresses on your
  own network. It is not exposed to the internet, and public addresses are rejected.
- The installed app stores the Plex token in
  `%LOCALAPPDATA%\Nocturne\data\config.json`; source mode uses `data\config.json`.
- The server control page listens only on `127.0.0.1`, one port above Nocturne, and is never
  available from your Wi-Fi.
- `.env`, `data\`, `node_modules\`, `dist\`, and temporary tooling are excluded from Git.
- Nocturne has no analytics, ads, accounts, or cloud service. Plex requests go directly from your
  PC to the Plex server you signed in to.
- LAN mode has no per-user login: anyone on your Wi-Fi who knows the address can use Nocturne
  while it is on. Keep it off on untrusted networks and never forward the port on your router.

---

## Where to go next

- Read [README.md](README.md) for the full project and security documentation.
- Once Nocturne works on your PC, the natural next step is a **TV mode** with large focus states
  and keyboard/D-pad navigation.
- Android TV, Fire TV, Roku, Apple TV, Samsung Tizen, and LG webOS require separate packaged apps.
  See the Smart TV roadmap in [README.md](README.md#smart-tv-roadmap--what-runs-where).

Enjoy your private cinema.
