# Cuesprig

A local video calendar for creators managing YouTube, Instagram, and TikTok. Plan videos in a week or month view, organize brands, and prepare uploads using your existing Chrome sign-ins.

## Install from source

You need desktop Google Chrome and Node.js 20 or later.

1. Download this repository with **Code → Download ZIP**, then extract it into a folder you intend to keep.
2. Open a terminal in that folder and run `npm run build`.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode**, then select **Load unpacked**.
5. Select the generated `dist/cuesprig` folder. The welcome screen opens.
6. Open Chrome’s Extensions menu and pin **Cuesprig**.
7. Click Cuesprig, then **Open calendar**. Create your brand and add a video.

Keep the extracted folder in place. To update, replace the source files, run `npm run build`, and click **Reload** on the Cuesprig card at `chrome://extensions`. Keep the same extension folder to retain its identity and local storage.

## Prepare a video

1. Add a video, YouTube title, description, date, and time to your calendar.
2. Open its card and choose **Prepare for YouTube**, **Prepare for Instagram**, or **Prepare for TikTok**.
3. Sign in on the platform and verify the intended account. Open its upload editor.
4. Click the pinned Cuesprig extension. Choose **Insert video** and keep the popup open until the handoff finishes.
5. After the platform processes the upload, click Cuesprig again and choose **Fill title and description**. Copy buttons provide a fallback if the platform’s editor has changed.
6. Review the content, account, date, time, and time zone in the platform. Complete scheduling there and wait for its confirmation before closing it.

The companion uses Chrome’s temporary access to the tab where you click it. Upload and text controls are experimental and require verification against the live platform editors. Scheduling confirmation and publication status are not yet synchronized back into the calendar. Entries currently remain labeled as drafts.

## Calendar

The title on each card is the YouTube title. Week view groups overlapping videos into a readable **View posts** card. Month view displays two videos per day and a **+N more** button. Open either to see the full day’s list and edit a video. Each brand has its own calendar and optional profile picture.

## Local development and tests

```sh
npm run dev
npm test
npm run check
```

The development calendar is available at http://127.0.0.1:4317. Tests cover title display, overlapping entries, month overflow, day details, brand isolation, URL restrictions, and the built extension’s entrypoints.

The development server and installed extension have separate browser storage. Existing localhost drafts remain on that origin. Export/import for moving drafts is still pending.

## Privacy and storage

Videos, brand pictures, titles, and descriptions are stored in IndexedDB in your Chrome profile. The extension sends a selected video and text to a platform only when you activate its transfer controls. Authentication happens on the platform itself using your normal browser session.

There are no analytics or bundled credentials. Clearing extension storage or uninstalling it deletes its local data. Keep original video files separately. Chrome Sync and a read-only phone calendar are not implemented yet.

## Current development status

This release is under active development. Remaining work includes live browser verification, native scheduling confirmation, backups/import, read-only phone synchronization, and release ZIP packaging. Browser automation can need updates when platform interfaces change. Check the platform’s own scheduler to confirm what will publish.

## Contributing

Use fictional data in examples and screenshots. Run `npm test` and `npm run check` before submitting changes. Keep credentials, browser profiles, exports, personal media, and local configuration out of Git. Report platform failures with the platform name and reproduction steps, omitting account identifiers and private content.
