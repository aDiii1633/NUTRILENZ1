export const SCHEMA_VERSION = 1;
export const DEMO_KEY = 'nutrilenz:demo-content:v1';
export const defaultSettings = {
  title: 'Nutrilenz — A little time. A little extra.',
  description: 'Discover simple app tasks, see the reward upfront, and earn with Nutrilenz. Small tasks. Real possibilities.',
  reward: 10,
  offerUrl: '',
  supportEmail: '',
  color: '#285be9',
  startTitle: 'Your first task starts here.',
  startDescription: 'Choose an available offer, follow the instructions, and submit the required proof for verification.',
  taskInstructions: 'Read all instructions and eligibility requirements.\nInstall and explore the app as requested.\nComplete the listed actions and submit the required proof.\nWait for verification before an approved reward is paid.',
  privacy: 'This website does not collect UPI details or process payments. The earnings calculator runs in your browser. Google Fonts receives normal font requests when this page loads. External offers have their own privacy policies. Contact the website owner with privacy questions.',
  terms: 'Task availability, eligibility, verification, and rewards depend on each offer. Earnings shown by the calculator are estimates, not a promise. This website does not itself verify task submissions or issue payments. Review the offer provider’s terms before participating.',
};

export function safeUrl(value, externalOnly = false) {
  if (typeof value !== 'string') return false;
  if (!externalOnly && (/^#[a-zA-Z0-9_-]*$/.test(value) || /^mailto:[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value))) return true;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}

// The source HTML is the schema: paths are generated identically in the website and editor.
// Text is applied through nodeValue, never interpreted as HTML.
export function collectFields(doc) {
  const fields = [];
  const roots = [...doc.querySelectorAll('.announcement, header.header, main > section, body > footer')];
  roots.forEach((root, rootIndex) => {
    const group = root.id || (root.matches('header') ? 'navigation' : root.matches('footer') ? 'footer' : [...root.classList].find(name => !['section','wrap'].includes(name))) || `section-${rootIndex}`;
    function visit(element, path) {
      if (element.matches('script, style, svg, output, select, .sr-only, [aria-hidden="true"], #year')) return;
      [...element.childNodes].forEach((node, index) => {
        if (node.nodeType !== 3 || !/[\p{L}\p{N}]/u.test(node.nodeValue) || node.nodeValue.trim().length < 2) return;
        fields.push({ key: `${path}:text:${index}`, group, type: 'text', original: node.nodeValue.trim(), node });
      });
      if (element.matches('a[href]') && !element.getAttribute('href').startsWith('mailto:')) {
        fields.push({ key: `${path}:href`, group, type: 'url', original: element.getAttribute('href'), node: element });
      }
      [...element.children].forEach((child, index) => visit(child, `${path}.${index}`));
    }
    visit(root, `r${rootIndex}`);
  });
  return fields;
}

export function validateDocument(value, fields) {
  if (!value || value.schemaVersion !== SCHEMA_VERSION || !value.text || !value.settings) throw new Error('Unsupported content format. Export a new backup from this version of the editor.');
  const settings = { ...defaultSettings, ...value.settings };
  if (Object.keys(settings).some(key => !(key in defaultSettings))) throw new Error('Unknown website setting.');
  if (!Number.isFinite(settings.reward) || settings.reward < 1 || settings.reward > 10000) throw new Error('Reward must be between ₹1 and ₹10,000.');
  if (!/^#[0-9a-f]{6}$/i.test(settings.color)) throw new Error('Choose a valid six-digit theme color.');
  if (settings.offerUrl && !safeUrl(settings.offerUrl, true)) throw new Error('Offer URL must start with https:// or http://.');
  if (settings.supportEmail && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(settings.supportEmail)) throw new Error('Enter a valid support email.');
  for (const [key, item] of Object.entries(settings)) if (key !== 'reward' && (typeof item !== 'string' || item.length > 12000)) throw new Error(`Invalid setting: ${key}.`);
  if (!settings.title.trim()) throw new Error('Website title cannot be empty.');
  const allowed = new Map(fields.map(field => [field.key, field]));
  const text = {};
  for (const [key, item] of Object.entries(value.text)) {
    const field = allowed.get(key);
    if (!field) continue; // New template versions may retire old fields.
    if (typeof item !== 'string' || item.length > 6000) throw new Error('A page field is too long or invalid.');
    if (field.type === 'url' && !safeUrl(item)) throw new Error(`Invalid link in ${field.group}. Use a full https:// address or a #section link.`);
    text[key] = item;
  }
  return { schemaVersion: SCHEMA_VERSION, text, settings };
}

export function applyContent(doc, fields, value) {
  const content = validateDocument(value, fields);
  for (const field of fields) {
    if (!(field.key in content.text)) continue;
    if (field.type === 'url') field.node.setAttribute('href', content.text[field.key]);
    else {
      const leading = field.node.nodeValue.match(/^\s*/)[0];
      const trailing = field.node.nodeValue.match(/\s*$/)[0];
      field.node.nodeValue = leading + content.text[field.key] + trailing;
    }
  }
  doc.title = content.settings.title;
  doc.querySelector('meta[name="description"]')?.setAttribute('content', content.settings.description);
  doc.documentElement.style.setProperty('--blue', content.settings.color);
  return content;
}

export const emptyContent = () => ({ schemaVersion: SCHEMA_VERSION, text: {}, settings: { ...defaultSettings } });
