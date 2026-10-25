import { loadWebsiteContent } from './cms/public.js';
import { routeOffer } from './offers/flow.js';
async function initializeWebsite() {
const { settings } = await loadWebsiteContent();
const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#nav');
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  nav.classList.toggle('open', open);
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open navigation');
}));
const range = document.querySelector('#tasks-range');
const days = document.querySelector('#days');
function calculate() {
  document.querySelector('#tasks-output').value = `${range.value} ${range.value === '1' ? 'task' : 'tasks'}`;
  document.querySelector('#earnings').replaceChildren(document.createTextNode(`₹${(Number(range.value) * Number(days.value) * settings.reward).toLocaleString('en-IN')}`));
  const suffix = document.createElement('span'); suffix.textContent = '/ month'; document.querySelector('#earnings').append(suffix);
}
range.addEventListener('input', calculate); days.addEventListener('change', calculate); calculate();
document.querySelector('.rate-label strong').textContent = `₹${settings.reward.toFixed(2)}`;
if (settings.reward !== 10) {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let node;
  while ((node = walk.nextNode())) {
    if (node.parentElement.closest('script,style,output')) continue;
    node.nodeValue = node.nodeValue.replace(/₹10(?=\b|[.])/g, `₹${settings.reward}`);
  }
}
document.querySelector('#year').textContent = new Date().getFullYear();
document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
  if (settings.supportEmail) link.href = `mailto:${settings.supportEmail}`;
  else { link.href = '#faq'; link.title = 'See frequently asked questions'; }
});
const dialog = document.querySelector('#task-dialog');
const content = document.querySelector('#dialog-content');
function paragraph(text, className = '') { const p = document.createElement('p'); p.textContent = text; p.className = className; return p; }
function showDialog(title) { document.querySelector('#dialog-title').textContent = title; content.replaceChildren(); }
document.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
document.querySelectorAll('[data-start], [data-task]').forEach(button => button.addEventListener('click', () => { location.hash = 'offer'; }));
document.querySelectorAll('[data-policy]').forEach(button => button.addEventListener('click', () => {
  const privacy = button.dataset.policy === 'privacy'; showDialog(privacy ? 'Your privacy matters.' : 'A little transparency.');
  content.append(paragraph(privacy ? settings.privacy : settings.terms)); dialog.showModal();
}));
routeOffer();
}
initializeWebsite();
