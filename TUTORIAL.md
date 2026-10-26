# Nocturne — download and installation guide

This guide takes you from the GitHub page to a working Nocturne interface connected to your
own Plex library. It is written for **Windows 10 or 11** and assumes you have never run a
Node.js project before.

Nocturne is only an interface. It does not move, rename, delete, or copy your media. Your
existing Plex Media Server keeps the files, metadata, playback engine, and watch history.

The application and its GitHub repository are both called **Nocturne**.

**Repository:** <https://github.com/captinfurious/Nocturne>

> The repository is private by default. Sign in to GitHub with the account that owns it
> before downloading. If you want other people to download Nocturne, change the repository
> visibility to public in **Settings → General → Danger Zone**.

---

## What you need

Before starting, confirm you have:

- Windows 10 or 11.
- A working **Plex Media Server** on the same PC or on your local network.
- Microsoft Edge (Chrome and Firefox also work).
- About 10 minutes for the first setup.
- An internet connection for installing packages and signing in to Plex.

You do **not** need to install Plex again, change Plex settings, or move your media.

---

## Step 1 — Download Nocturne

You can download the project as a ZIP file or clone it with Git. Use the ZIP method if you
are new to development.

### Option A — Download the ZIP (recommended for beginners)

1. Open the repository page in Edge:
   <https://github.com/captinfurious/Nocturne>
2. Click the green **Code** button.
3. Click **Download ZIP**.
4. Open your **Downloads** folder.
5. Right-click `Nocturne-main.zip` and choose **Extract All…**.
6. Extract it somewhere easy to find. For example:

   ```text
   C:\Users\<YourName>\Projects\Nocturne
   ```

> **Important:** Do not run Nocturne from inside the ZIP file. Windows lets you browse a ZIP
> like a folder, but the project needs a real extracted folder.

If you extracted the ZIP with the default name, the inner folder will be called
`Nocturne-main`. You can rename it to `Nocturne` so the examples below
match exactly; either name works as long as you adjust the paths.

### Option B — Clone with Git

Install **Git for Windows** from <https://git-scm.com/download/win> if it is not already
installed. Then open PowerShell and run:

```powershell
cd "C:\Users\<YourName>\Projects"
git clone https://github.com/captinfurious/Nocturne.git
cd Nocturne
```

A private repository will ask you to sign in to GitHub. Use your normal GitHub account.

---

## Step 2 — Install Node.js

Nocturne needs **Node.js 22.12 or newer**. Node 24 LTS is recommended.

In PowerShell, check whether Node is already installed:

```powershell
node --version
npm --version
```

If both commands print version numbers and Node is 22.12 or newer, skip to Step 3.

If Windows says the command is not recognized, install Node with:

```powershell
winget install --id OpenJS.NodeJS.LTS -e --source winget
```

Alternatively, download the **LTS installer** from <https://nodejs.org/> and run it with
the default options.

**Close PowerShell and open it again** after installing. Then check again:

```powershell
node --version
npm --version
```

You should see something like `v24.x.x` and `10.x.x`. Exact numbers may be newer.

---

## Step 3 — Open the project folder in PowerShell

In PowerShell, use `cd` followed by the real path of the folder that contains
`package.json`.

```powershell
cd "C:\Users\<YourName>\Projects\Nocturne"
```

Replace `<YourName>` with your Windows user name and adjust the path if you extracted the
ZIP somewhere else. Then confirm you are in the right folder:

```powershell
Get-ChildItem
```

You should see files and folders such as:

```text
package.json
server
src
tools
README.md
TUTORIAL.md
```

If you do not see `package.json`, you are in the wrong folder. Use `cd` again with the
folder you created when extracting the ZIP.

---

## Step 4 — Install Nocturne's dependencies

With PowerShell still in the project folder, run:

```powershell
npm install
```

This downloads the packages Nocturne needs into a local `node_modules` folder. It usually takes
30 seconds to a few minutes. You only need to do this after the first download or after the
project's dependencies change.

If PowerShell blocks `npm` with a message about `npm.ps1`, either use the Windows wrapper:

```powershell
npm.cmd install
```

or allow locally created scripts for your own Windows account:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Then confirm the prompt and try `npm install` again. Do not disable Windows security
features globally just to run Nocturne.

---

## Step 5 — Make sure Plex is running

Start **Plex Media Server** and open this address in Edge:

```text
http://127.0.0.1:32400/web
```

You should see your Plex library. If that address does not work, fix Plex first; Nocturne cannot
work without it.

If Plex runs on another computer on your network, keep that computer awake and note its
address, for example:

```text
http://192.168.1.50:32400
```

Nocturne's setup screen can use a manual server address if automatic discovery cannot find it.

---

## Step 6 — Start Nocturne for the first time

In the same PowerShell window, run:

```powershell
npm run dev
```

This starts two local processes:

- the Nocturne API on `http://127.0.0.1:8787`
- the Nocturne interface on `http://127.0.0.1:5173`

Keep the PowerShell window open. Now open Edge and go to:

```text
http://127.0.0.1:5173
```

You will see the Nocturne setup screen.

### Connect your Plex account

1. Click **Sign in to Plex**.
2. A Plex login page opens in a new tab.
3. Sign in with your normal Plex account.
4. If Plex asks for the one-time code, copy it from the Nocturne setup screen.
5. Return to the Nocturne tab. Nocturne detects the sign-in and finds your server automatically.
6. Your home page appears with content from your real Plex library.

Nocturne stores the Plex token **only on this PC** in `data/config.json`. The browser never
receives the token, and your Plex password is never seen by Nocturne.

### If Nocturne cannot find your server

On the setup screen, click **Use a Plex token instead** or **Connect with a token and server
address**. You will need:

- a Plex token, and
- your server address, such as `http://127.0.0.1:32400`.

Plex's official token instructions are here:
<https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/>

Do not post your token in a GitHub issue, screenshot, chat, or public file. Treat it like a
password.

---

## Step 7 — Start Nocturne after restarting your PC

For everyday use, you do not need the development server. From the project folder, run:

```powershell
npm start
```

Nocturne builds the interface and serves the whole app at:

```text
http://127.0.0.1:8787
```

Open that address in Edge. The first build takes a few seconds. Keep PowerShell open while
you use Nocturne.

Suggested daily routine:

1. Start **Plex Media Server**.
2. Open PowerShell.
3. Run `cd "C:\Users\<YourName>\Projects\Nocturne"`.
4. Run `npm start`.
5. Open `http://127.0.0.1:8787`.

Press `Ctrl+C` in PowerShell to stop Nocturne. Closing the window also stops it.

---

## Playback in Nocturne

Nocturne reads your Plex library, artwork, metadata, Continue Watching progress, and episodes.
When you press a Play or Resume button, Nocturne opens the exact movie or episode in **Plex Web**.

Playback stays inside Plex in this version. That is deliberate:

- Plex handles codecs, direct play, transcoding, subtitles, and audio tracks.
- Resume points stay in the same place Nocturne reads them from.
- Nothing about your Plex installation or media files is modified.

An embedded player inside Nocturne can be added later, but it is a much larger project than the
first release.

---

## Updating Nocturne later

### If you downloaded the ZIP

1. Download a new ZIP from the repository's **Code** menu.
2. Extract it to a new folder.
3. Keep your old `data` folder if you want to preserve the saved Plex login.
4. Run `npm install` in the new folder, then `npm start`.

### If you cloned with Git

From the project folder:

```powershell
git pull
npm install
npm start
```

`npm install` is only strictly necessary when the dependency list changes, but running it
after an update is harmless.

---

## Troubleshooting

### "Nocturne can't reach its own engine"

The local API is not running. Make sure the PowerShell window is still open and start Nocturne
again with `npm run dev` or `npm start`.

### "Nocturne is not connected to Plex yet"

Complete the setup screen. If Plex was working before, open **Settings** and click
**Test connection**, or sign in again.

### "Plex is offline"

- Start Plex Media Server.
- Test `http://127.0.0.1:32400/web` in Edge.
- Click **Retry** in Nocturne.
- If you use a different port, enter that address on the Nocturne setup screen.

### Plex sign-in finds my account but not my server

Make sure Plex is running on this PC and reachable at `http://127.0.0.1:32400`. Then use the
manual token/server-address option. If Plex is on another PC, use that PC's LAN address and
make sure Windows Firewall allows Plex on the local network.

### "Port already in use" / EADDRINUSE

Another copy of Nocturne may still be running. Close the old PowerShell window or stop the old
process. To see what is using the ports:

```powershell
Get-NetTCPConnection -LocalPort 8787,5173 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

If you intentionally use a different port, set `PORT=8788` in a local `.env` file. The Vite
proxy reads the same setting. Restart Nocturne after changing it.

### My posters are missing

Confirm the Plex connection in **Settings**, then reload. Nocturne proxies artwork through its
local backend because Plex image paths also require authentication.

### I want to disconnect or start over

Open **Settings → Disconnect Plex**. This removes the saved token and server details from
Nocturne. It does not change Plex, your account, or any media file.

To completely remove Nocturne, stop it, delete the project folder, and optionally delete its
`data` folder. Nothing is installed as a Windows service.

### The interface says "previous Plex connection expired"

Plex rejected the saved token. Sign in again on the setup screen. This does not mean your
media is damaged. It usually means the token was revoked or the Plex account password changed.

---

## Privacy and safety

- Nocturne's backend listens only on `127.0.0.1` by default. It is not exposed to the internet.
- Your Plex token is stored in `data/config.json` and is excluded from Git.
- `.env`, `data/`, `node_modules/`, `dist/`, and temporary tooling are excluded from the
  repository.
- Do not change `HOST` to `0.0.0.0` or forward port 8787 on your router without adding real
  authentication. Nocturne 1.0 has no multi-user login of its own.
- The included `tools/mock-plex` server is only for development. Never point a real Plex
  account or token at it.

---

## Where to go next

- Read [README.md](README.md) for the full project and security documentation.
- Once Nocturne works on your PC, the natural next step is a **TV mode** with large focus states
  and keyboard/D-pad navigation.
- Android TV, Fire TV, Roku, Apple TV, Samsung Tizen, and LG webOS require separate packaged
  apps. See the Smart TV roadmap in [README.md](README.md#smart-tv-roadmap--what-runs-where).

Enjoy your private cinema.
