// Runs in the platform tab. Read only account controls, never cookies or tokens.
export function detectAccount(platform) {
  const text = element => element?.textContent?.trim();
  const image = element => element?.querySelector('img')?.src;
  if (platform === 'youtube') {
    const channel = /^\/channel\/(UC[\w-]+)/.exec(location.pathname);
    const name = text(document.querySelector('#entity-name, .entity-name'));
    if (location.hostname === 'studio.youtube.com' && channel && name) {
      return { id: channel[1], name, url: `https://www.youtube.com/channel/${channel[1]}`, picture: document.querySelector('#entity-image img, img#avatar')?.src ?? null };
    }
  }
  if (platform === 'instagram') {
    const links = [...document.querySelectorAll('a[href]')];
    const profile = links.find(link => link.querySelector('img[alt*="profile picture" i]') && link.closest('nav, [role="navigation"]'));
    const match = profile && /^\/([\w.]+)\/?$/.exec(new URL(profile.href).pathname);
    if (match && !['accounts', 'explore', 'direct', 'reels'].includes(match[1])) {
      return { id: match[1], name: `@${match[1]}`, url: `https://www.instagram.com/${match[1]}/`, picture: image(profile) ?? null };
    }
  }
  if (platform === 'tiktok') {
    const profile = document.querySelector('a[data-e2e="nav-profile"], a[data-e2e="profile-icon"], [data-e2e="profile-icon"] a');
    const match = profile && /^\/@([\w.]+)\/?$/.exec(new URL(profile.href).pathname);
    if (match) return { id: match[1], name: `@${match[1]}`, url: `https://www.tiktok.com/@${match[1]}`, picture: image(profile) ?? null };
  }
  return null;
}

const destinations = {
  youtube: 'https://studio.youtube.com/',
  instagram: 'https://www.instagram.com/',
  tiktok: 'https://www.tiktok.com/',
};
export const connectionKey = (brandId, platform) => `connection:${brandId}:${platform}`;
export async function openConnection(browser, brandId, platform) {
  if (!Object.hasOwn(destinations, platform) || typeof brandId !== 'string' || !brandId) throw new Error('Choose a brand and platform.');
  const guided = Boolean(browser.storage.session);
  const source = guided ? await browser.tabs.getCurrent() : null;
  const tab = await browser.tabs.create({ url: guided ? 'about:blank' : destinations[platform], active: true });
  await browser.storage.local.set({ [connectionKey(brandId, platform)]: { state: 'pending', tabId: tab.id } });
  if (guided) {
    await browser.storage.session.set({ [guideKey(tab.id)]: { brandId, platform, sourceId: source?.id } });
    await browser.tabs.update(tab.id, { url: destinations[platform] });
  }
  return tab.id;
}
export async function checkConnection(browser, brandId, platform, { documentId, save = true } = {}) {
  if (!Object.hasOwn(destinations, platform)) throw new Error('Choose a supported platform.');
  const key = connectionKey(brandId, platform);
  const pending = (await browser.storage.local.get(key))[key];
  if (!pending?.tabId) throw new Error('Click Connect to open a sign-in tab.');
  const tab = await browser.tabs.get(pending.tabId).catch(() => null);
  if (!tab) throw new Error('The sign-in tab was closed. Click Connect to try again.');
  if (new URL(tab.url).origin !== new URL(destinations[platform]).origin) throw new Error('Finish signing in on the platform, then check again.');
  const [result] = await browser.scripting.executeScript({ target: documentId ? { tabId: tab.id, documentIds: [documentId] } : { tabId: tab.id }, func: detectAccount, args: [platform] });
  if (!result?.result) throw new Error('Account not detected yet. Finish signing in and open your channel or profile, then check again.');
  const account = result.result;
  if (typeof account.id !== 'string' || !account.id || typeof account.name !== 'string') throw new Error('Could not verify the account.');
  if (save) await browser.storage.local.set({ [key]: { state: 'detected', account, tabId: tab.id } });
  return account;
}

export const guideKey = tabId => `account-guide:${tabId}`;
export const isConnectionPage = (platform, url) => typeof url === 'string' && url.startsWith(new URL(destinations[platform]).origin + '/');
