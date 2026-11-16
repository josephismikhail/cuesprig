(() => {
  if (globalThis.cuesprigAccountGuide) return;
  globalThis.cuesprigAccountGuide = true;
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ':host{all:initial;position:fixed;bottom:20px;right:20px;z-index:2147483647} section{box-sizing:border-box;width:min(320px,calc(100vw - 40px));padding:16px;background:#faf5f9;color:#35243f;border:1px solid #dfd2e8;border-radius:14px;box-shadow:0 4px 24px #35243f33;font:14px system-ui} p{line-height:1.45} button{font:inherit;color:inherit;background:#e9def4;border:0;border-radius:7px;padding:8px 12px;cursor:pointer}';
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Cuesprig account setup');
  const title = document.createElement('strong');
  title.textContent = 'Connect to Cuesprig';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Sign in and open your channel or profile here, then check your account.';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Check account';
  let candidate;
  button.addEventListener('click', async event => {
    if (!event.isTrusted) return;
    button.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: 'cuesprig:account-guide', accountId: candidate?.id });
      if (!result?.ok) throw new Error(result?.error ?? 'Cuesprig could not check the account. Try again.');
      if (result.linked) {
        status.textContent = 'Account linked. You can return to Cuesprig.';
        button.hidden = true;
      } else {
        candidate = result.account;
        status.textContent = 'Link ' + candidate.name + ' to ' + result.brandName + '?';
        button.textContent = 'Use this account';
      }
    } catch (error) {
      candidate = undefined;
      button.textContent = 'Check account';
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  panel.append(title, status, button);
  root.append(style, panel);
  document.documentElement.append(host);
})();
