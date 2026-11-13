<p align="center">
  <img src="public/brand-mark.svg" width="136" height="150" alt="Cuesprig logo">
</p>
<h1 align="center">Cuesprig</h1>
<p align="center">Good content. Right on time.</p>
<p align="center">A local video calendar for YouTube, Instagram, and TikTok.</p>

## Install in Chrome

### Windows quick setup

Copy this line into Windows Terminal, PowerShell, or Command Prompt:

```powershell
powershell.exe -NoProfile -STA -Command "Invoke-Expression (Invoke-RestMethod 'https://raw.githubusercontent.com/josephismikhail/cuesprig/main/install.ps1')"
```

Choose the Chrome profile you want in the setup window and click **Continue**. The [installer](install.ps1) downloads and verifies the latest release, copies its folder path, and opens Extensions in the profile you chose. No Node.js or admin access is needed.

1. In the Chrome tab that opens, turn on **Developer mode** and click **Load unpacked**.
2. In the folder picker, press **Alt+D**, paste the copied path, press **Enter**, then click **Select Folder**.
3. In Cuesprig’s welcome tab, click **Open calendar**. You can pin the extension later from Chrome’s Extensions menu.

To update, run the same command and click **Reload** on the Cuesprig card in Chrome.

### Manual installation

1. Download the `cuesprig-chrome-*.zip` from the repository’s **Releases** page and extract it to a folder you intend to keep.
2. Open `chrome://extensions` in desktop Chrome.
3. Turn on **Developer mode**, then select **Load unpacked**.
4. Select the extracted folder that contains `manifest.json`. The welcome screen opens.
5. Pin **Cuesprig** from Chrome’s Extensions menu. Click it, then choose **Open calendar**.

For updates, extract the new release into the same folder and click **Reload** on the Cuesprig card in `chrome://extensions`. Keeping the folder path preserves the extension’s identity and local storage.

### Build from source

Use Node.js 20 or later. Download or clone the repository, run `npm run build` in its folder, and load `dist/cuesprig` using the same Chrome steps. For a release ZIP, run `python3 scripts/package-extension.py` after the build with Python 3.11 or later.

## Send a video in the background

In a video’s details, choose **Send to YouTube**, **Send to Instagram**, or **Send to TikTok**. Approve access to that platform in Chrome if asked. The extension opens an inactive tab and attempts to hand off the video when it finds an upload field. Progress in Cuesprig measures the handoff to the browser editor. Use **Open platform tab** when the editor needs sign-in or review. Choose **Prepare for** to open the manual upload workflow directly.

Finish scheduling on the platform and record its confirmation in Cuesprig.

## Prepare a video

1. Add a video, YouTube title, description, date, and time to your calendar.
2. Select **Save and prepare** or open a saved video’s card. Choose **Prepare for YouTube**, **Prepare for Instagram**, or **Prepare for TikTok**.
3. Use the tab Cuesprig opens. Each platform tab keeps its own handoff until you close it or restart Chrome. Sign in on the platform and verify the intended account. Open its upload editor.
4. Click the pinned Cuesprig extension. Choose **Insert video** and keep the popup open until the handoff finishes. If the editor rejects the handoff, use **Download video instead** and select the downloaded file in the platform’s file picker.
5. After the platform processes the upload, click Cuesprig again and choose **Fill title and description**. Copy buttons provide a fallback if the platform’s editor has changed.
6. Review the content, account, date, time, and time zone in the platform. Complete scheduling there and wait for its confirmation before closing it.

The companion uses Chrome’s temporary access to the tab where you click it. Upload and text controls are experimental and require verification against the live platform editors. Once the platform confirms, choose **Record confirmed schedule** in the Cuesprig toolbar popup. You can also open the calendar card and choose **Record schedule**. Pick the platform and enter the confirmed date and time. Matching times share a card, and different times appear separately. Cuesprig labels this as a schedule you recorded. Use **Remove record** if you cancel it on the platform.

## Calendar

The title on each card is the YouTube title. Week view groups overlapping videos into a readable **View posts** card. Month view displays two videos per day and a **+N more** button. Open either to see the full day’s list and edit a video. Each brand has its own calendar and optional profile picture.

## Local development and tests

```sh
npm run dev
npm test
npm run check
```

The development calendar is available at http://127.0.0.1:4317. Tests cover title display, overlapping entries, month overflow, day details, brand isolation, URL restrictions, and the built extension’s entrypoints.

The development server and installed extension have separate browser storage. To move drafts from localhost into the extension, open the brand menu in the localhost calendar, choose **Backup**, then **Download backup**. In the extension calendar, open **Backup**, choose that file, check **Replace this calendar with the backup**, and select **Restore backup**. Restore replaces the destination workspace, so download a backup there first if it already contains drafts.

## Privacy and storage

Videos, brand pictures, titles, and descriptions are stored in IndexedDB in your Chrome profile. The extension sends a selected video and text to a platform only when you activate its transfer controls. Authentication happens on the platform itself using your normal browser session.

There are no analytics or bundled credentials. Clearing extension storage or uninstalling it deletes its local data. Keep original video files separately. The optional phone calendar uses your own HTTPS server and separate read and write keys.

## Optional phone calendar

Run `npm run sync` on a machine that stays available when your laptop is off. Set `CUESPRIG_READ_TOKEN` and `CUESPRIG_WRITE_TOKEN` to separate randomly generated keys. Each key must contain at least 32 letters, digits, underscores, or hyphens. To generate a key, run `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` twice. Keep the keys in your host's secret or environment settings.

The service binds to `127.0.0.1:4318`. Put it behind your host's HTTPS reverse proxy and give it a persistent directory. Set `CUESPRIG_SYNC_PORT` to change the internal port and `CUESPRIG_SYNC_FILE` to choose the snapshot file. A service hosted only on your laptop becomes unavailable when the laptop shuts down.

1. In the desktop extension calendar, choose **Phone calendar**. Enter your HTTPS address and the write key. Select **Save and sync**, then grant Chrome access to that host.
2. Open the same address in Chrome on your phone and enter the read key. Use Chrome’s **Add to Home screen** menu to install it.
3. The phone refreshes on launch and keeps the last snapshot available offline. The desktop sends updates when you record or edit a schedule. Check **Last synced** for freshness and use **Save and sync** to retry a failed update.

The phone shows dates and times as entered on the desktop. It receives titles, brand names, posting times, and platforms. Video files, captions, brand pictures, and social account sessions stay on the desktop. Canceling or changing a schedule on a social platform requires updating its record in Cuesprig. The read key grants access to the calendar. Share it only with people you want to have access and rotate it if needed.

## Connect ChatGPT

For a hosted deployment, the included Dockerfile runs the sync server as a non-root process on port 4318. Build it with `docker build -t cuesprig-sync .` or point a container host at the repository. Supply the settings below as secrets, mount persistent storage at `/data`, and use the host's HTTPS endpoint. Configure `/healthz` as the health check. Local runs still listen on loopback by default.

Cuesprig can expose your synced calendar through a private ChatGPT MCP plugin. It can list brands, drafts, and recorded schedules, create and edit drafts, and add or remove schedule records. Writes queue until desktop sync, and ChatGPT can check whether a change was applied or rejected. Record a schedule only after the platform accepts it. The connector has no access to your platform sessions or video files.

1. Set up the optional phone calendar server as described above. Use a single server process and one Chrome workspace per sync server. Install server dependencies with `npm ci --omit=dev`.
2. Configure an OAuth provider that issues signed JWT access tokens and supports the OAuth client setup for custom ChatGPT MCP servers. Use the HTTPS MCP endpoint as the token audience. Configure `calendar:read` and `calendar:write` scopes. Set these environment variables on the server:

   | Variable | Value |
   | --- | --- |
   | `CUESPRIG_MCP_URL` | The HTTPS MCP resource URL, e.g. `https://calendar.example.com/mcp` |
   | `CUESPRIG_OAUTH_ISSUER` | Exact OAuth issuer, including any trailing slash |
   | `CUESPRIG_OAUTH_JWKS` | The provider’s HTTPS public signing-key endpoint |
   | `CUESPRIG_OAUTH_SUBJECT` | The OAuth subject of the only user allowed to access this workspace |

3. In Cuesprig’s **Phone calendar** settings, enable **Sync drafts and schedule changes with ChatGPT** and click **Save and sync**. This also shares draft titles, captions, and planned times with your own server. Use **Save and sync** again to pull queued changes on demand. Editing the local calendar also triggers sync.
4. In [ChatGPT Plugins](https://chatgpt.com/plugins), add a custom MCP server with the HTTPS MCP URL and OAuth authentication. Authorize the scopes you want to use. See [OpenAI’s connection guide](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) for provider and workspace requirements.

### Send a video from ChatGPT

On a ChatGPT surface that accepts your video attachment, attach the clip and say: “Use Cuesprig to import this video for Studio. Title: A fresh start. Description: A look behind the scenes.” You can add a planned date and time. Without them, Cuesprig uses today at 5 PM in the last synced desktop time zone as a draft slot.

To enable the attachment tool, set `CUESPRIG_ATTACHMENT_ORIGINS` on the connector host to the exact, trusted HTTPS origins used by your ChatGPT attachment delivery, separated by commas. Do not allow arbitrary origins. Refresh the ChatGPT tool list after enabling it.

The connector streams one MP4, MOV, or WebM file at a time to private staging storage. The limit is 100 MiB per video and 200 MiB total staged. Open or return to the desktop calendar to import queued drafts. The server deletes the staged file when the desktop acknowledges the import. After 24 hours a staged file cannot be retrieved, and expired files are removed during the next video intake. For a host with retention requirements, set up storage cleanup for expired files. Videos are outside phone calendar sync and calendar read tools.

An imported clip is a draft. Use the extension to prepare the platform upload and record the platform's confirmation. No social account action is triggered by the import.

The OAuth connection uses separate credentials from the phone and desktop keys. Keep the desktop write key private. Turning off ChatGPT sync stops desktop transfers. Disable the MCP endpoint or revoke the OAuth authorization to stop ChatGPT access to the last server snapshot.

## Current development status

This release is under active development. Remaining work includes live browser verification, automatic schedule verification and live phone installation verification. Browser automation can need updates when platform interfaces change. Check the platform’s own scheduler to confirm what will publish.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for pull requests, tests, and repository maintenance. Keep account identifiers, private media, and exports out of issue reports and commits.
