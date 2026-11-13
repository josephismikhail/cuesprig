# Frame — local calendar UI

A dependency-free, local prototype: a monthly calendar, a large add button, video drag-and-drop and preview, a YouTube title, and a description shared across platforms. Choose a date and time to save a local draft. Click a draft to edit it.

## Run

Requires Node.js 20 or later.

```sh
npm run dev
```

Open http://127.0.0.1:4317. The server listens only on the local loopback interface. Keep this process running while opening the prototype. `PORT` can override the default.

```sh
npm run check
```

## Scope and storage

This version is a UI prototype. It does not log in to social platforms, upload remotely, or schedule platform publication. Entries are visibly marked as local drafts.

Videos and metadata are stored in this browser's IndexedDB, outside the source repository. There are no analytics, third-party assets, or network uploads. Browser data clearing removes drafts; this prototype is not a backup. Storage is specific to the browser profile and origin, so keep the same local URL and port.

The web manifest provides standalone-window metadata; offline launch and the browser automation companion are future work.

## Public source hygiene

Use fictional data in screenshots and examples. Never commit browser profiles, session cookies, credentials, personal media, or exported draft databases. The ignore rules are a secondary safeguard, not a substitute for reviewing staged files and history before publication.
