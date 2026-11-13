# Cuesprig

A local video calendar for creators managing YouTube, Instagram, and TikTok. Plan videos in a week or month view, organize brands, and prepare uploads using your existing Chrome sign-ins.

## Install in Chrome

1. Download the `cuesprig-chrome-*.zip` from the repository’s **Releases** page and extract it to a folder you intend to keep.
2. Open `chrome://extensions` in desktop Chrome.
3. Turn on **Developer mode**, then select **Load unpacked**.
4. Select the extracted folder that contains `manifest.json`. The welcome screen opens.
5. Pin **Cuesprig** from Chrome’s Extensions menu. Click it, then choose **Open calendar**.

For updates, extract the new release into the same folder and click **Reload** on the Cuesprig card in `chrome://extensions`. Keeping the folder path preserves the extension’s identity and local storage.

### Build from source

Use Node.js 20 or later. Download or clone the repository, run `npm run build` in its folder, and load `dist/cuesprig` using the same Chrome steps. For a release ZIP, run `python3 scripts/package-extension.py` after the build with Python 3.11 or later.

## Prepare a video

1. Add a video, YouTube title, description, date, and time to your calendar.
2. Select **Save and prepare** or open a saved video’s card. Choose **Prepare for YouTube**, **Prepare for Instagram**, or **Prepare for TikTok**.
3. Use the tab Cuesprig opens. Each platform tab keeps its own handoff until you close it or restart Chrome. Sign in on the platform and verify the intended account. Open its upload editor.
4. Click the pinned Cuesprig extension. Choose **Insert video** and keep the popup open until the handoff finishes. If the editor rejects the handoff, use **Download video instead** and select the downloaded file in the platform’s file picker.
5. After the platform processes the upload, click Cuesprig again and choose **Fill title and description**. Copy buttons provide a fallback if the platform’s editor has changed.
6. Review the content, account, date, time, and time zone in the platform. Complete scheduling there and wait for its confirmation before closing it.

The companion uses Chrome’s temporary access to the tab where you click it. Upload and text controls are experimental and require verification against the live platform editors. Once the platform confirms, return to the card and choose **Record schedule**. Pick the platform and enter the confirmed date and time. Matching times share a card, and different times appear separately. Cuesprig labels this as a schedule you recorded. Use **Remove record** if you cancel it on the platform.

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

## Current development status

This release is under active development. Remaining work includes live browser verification, automatic schedule verification and live phone installation verification. Browser automation can need updates when platform interfaces change. Check the platform’s own scheduler to confirm what will publish.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for pull requests, tests, and repository maintenance. Keep account identifiers, private media, and exports out of issue reports and commits.
