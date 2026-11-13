export const handoffKey = tabId => `handoff:${tabId}`;

export async function prepareHandoff(browser, id, platform, url) {
  const tab = await browser.tabs.create({ url, active: false });
  const key = handoffKey(tab.id);
  try {
    await browser.storage.session.set({ [key]: { id, platform, tabId: tab.id } });
    await browser.tabs.update(tab.id, { active: true });
  } catch (error) {
    await Promise.allSettled([browser.storage.session.remove(key), browser.tabs.remove(tab.id)]);
    throw error;
  }
}

export async function readHandoff(browser, tabId) {
  if (!Number.isInteger(tabId)) return undefined;
  const key = handoffKey(tabId);
  return (await browser.storage.session.get(key))[key];
}
