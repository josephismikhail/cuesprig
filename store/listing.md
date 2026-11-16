# Chrome Web Store listing

**Name:** Cuesprig

**Description:** Plan videos for YouTube, Instagram, and TikTok in a local week or month calendar. Keep separate brand calendars, prepare uploads in your existing Chrome sessions, and record the schedules confirmed by each platform. An optional read-only phone calendar shows what is coming up.

**Category:** Productivity

**Screenshot:** [Calendar with fictional posts](calendar.jpg)

**Privacy policy:** https://github.com/josephismikhail/cuesprig/blob/main/PRIVACY.md

## Permission explanations

- `activeTab` and `scripting` let you insert your selected video and text into the supported platform tab after opening the extension.
- `storage` keeps the active upload handoff and optional calendar sync settings in Chrome.
- Optional HTTPS access lets you connect to the calendar server you choose. The extension asks for access to that server during sync setup.

## Build for submission

Run `npm test` and `python scripts/package-extension.py`. Upload the resulting ZIP in `dist/` to the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole). Add the screenshot and privacy policy link. Verify the privacy declarations against the extension, then submit for review from the publisher account.
