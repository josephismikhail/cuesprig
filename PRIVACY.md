# Cuesprig privacy policy

Cuesprig stores draft videos, titles, captions, brands, and schedule records in your Chrome profile. It has no analytics and does not collect social media credentials.

When you ask Cuesprig to transfer a video or fill text, the extension sends that content to the editor in the platform tab you opened. The platform handles your login, upload, and publication under its own privacy policy.

Phone calendar sync is optional. If you enable it, Cuesprig sends scheduled titles, brand names, times, and platform names to the HTTPS server you configure. The phone saves the most recent snapshot and read key on that device. Video files, captions, and social sessions stay outside phone sync.

The optional ChatGPT connector shares draft titles, captions, and calendar details with your configured server and makes them available to your authorized ChatGPT connection. The server keeps the last synced calendar and queued changes. Video files, social sessions, and brand pictures are excluded. Disable the connector on the server to stop access, and remove the server’s connector snapshot file when you no longer need it.

If you explicitly import a video through ChatGPT, the connector temporarily stages that attachment on your configured server. Cuesprig retrieves it on desktop sync. The connector deletes the staged copy after acknowledgment. Files expire after 24 hours and expired files are removed on the next intake. This does not change how ChatGPT stores the original attachment.

You can export a local backup. Keep it private. Uninstalling the extension or clearing its data removes the local calendar from that Chrome profile. On the phone, **Forget this calendar** clears its saved copy and read key. You control retention on your own sync server.

For privacy questions, contact the maintainer through [the Cuesprig repository](https://github.com/josephismikhail/cuesprig). Keep private account information out of public issues.
