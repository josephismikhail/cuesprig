import { readWorkspace, restoreWorkspace } from './storage.js';
import { encodeBackup, decodeBackup } from './backup.js';

const $ = id => document.getElementById(id);
let busy = false;
const dialog = $('backup-dialog');

$('open-backup').addEventListener('click', () => {
  $('brand-menu').hidePopover();
  $('restore-backup').reset();
  $('backup-status').textContent = '';
  dialog.showModal();
});
$('close-backup').addEventListener('click', () => { if (!busy) dialog.close(); });
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });

async function run(action) {
  if (busy) return;
  busy = true;
  $('export-backup').disabled = $('import-backup').disabled = true;
  try { await action(); }
  catch (error) { $('backup-status').textContent = error.message || 'Backup could not be processed.'; }
  finally {
    busy = false;
    $('export-backup').disabled = $('import-backup').disabled = false;
  }
}
$('export-backup').addEventListener('click', () => run(async () => {
  const url = URL.createObjectURL(encodeBackup(await readWorkspace()));
  const link = document.createElement('a');
  link.href = url;
  link.download = `cuesprig-${new Date().toISOString().slice(0, 10)}.cuesprig`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  $('backup-status').textContent = 'Backup downloaded. Keep it somewhere private.';
}));
$('restore-backup').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    const workspace = await decodeBackup($('backup-file').files[0]);
    await restoreWorkspace(workspace);
    window.location.reload();
  });
});
