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
2. Open its card and choose **Prepare for YouTube**, **Prepare for Instagram**, or **Prepare for TikTok**.
3. Sign in on the platform and verify the intended account. Open its upload editor.
4. Click the pinned Cuesprig extension. Choose **Insert video** and keep the popup open until the handoff finishes.
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

The development server and installed extension have separate browser storage. Existing localhost drafts remain on that origin. Export/import for moving drafts is still pending.

## Privacy and storage

Videos, brand pictures, titles, and descriptions are stored in IndexedDB in your Chrome profile. The extension sends a selected video and text to a platform only when you activate its transfer controls. Authentication happens on the platform itself using your normal browser session.

There are no analytics or bundled credentials. Clearing extension storage or uninstalling it deletes its local data. Keep original video files separately. Chrome Sync and a read-only phone calendar are not implemented yet.

## Current development status

This release is under active development. Remaining work includes live browser verification, automatic schedule verification, backups/import, read-only phone synchronization. Browser automation can need updates when platform interfaces change. Check the platform’s own scheduler to confirm what will publish.

## Contributing

Use fictional data in examples and screenshots. Run `npm test` and `npm run check` before submitting changes. Keep credentials, browser profiles, exports, personal media, and local configuration out of Git. Report platform failures with the platform name and reproduction steps, omitting account identifiers and private content.
