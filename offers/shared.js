export const LOOMII_URL = 'https://play.google.com/store/apps/details?id=com.loomii.app';
export const CLAIM_URL = 'https://www.app20.in/';
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export function validateSubmission({name,email,username}) {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) throw new Error('Enter your name (2–100 characters).');
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 80) throw new Error('Enter your Loomii username (2–80 characters).');
  return {name:name.trim(),email:email.trim().toLowerCase(),username:username.trim()};
}
export function validateScreenshot(file) {
  if (!file || !SCREENSHOT_TYPES.includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP screenshot.');
  if (file.size < 1 || file.size > MAX_SCREENSHOT_BYTES) throw new Error('Screenshot must be smaller than 5 MB.');
}
