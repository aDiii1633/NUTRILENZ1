import { getClient } from './client.js';
import { collectFields, applyContent, emptyContent, DEMO_KEY } from './model.js';

export const fields = collectFields(document);
export let siteContent = emptyContent();
export async function loadWebsiteContent() {
  const client = getClient();
  try {
    if (client) {
      const { data, error } = await client.from('site_content').select('document').eq('id', 'main').single();
      if (error) throw error;
      siteContent = applyContent(document, fields, data.document);
    } else if (import.meta.env.DEV) {
      const demo = localStorage.getItem(DEMO_KEY);
      if (demo) siteContent = applyContent(document, fields, JSON.parse(demo));
    }
  } catch (error) {
    // Keep the complete built-in website available during a database outage.
    console.warn('Saved content could not be loaded. Showing the built-in website.', error.message);
  }
  return siteContent;
}
