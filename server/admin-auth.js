import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive=promisify(scrypt);
export async function verifyAdminPassword(password, encoded) {
  if(typeof password!=='string'||password.length>256||typeof encoded!=='string')return false;
  const parts=encoded.split(':');
  if(parts.length!==3||parts[0]!=='scrypt'||!/^[a-f0-9]{32}$/.test(parts[1])||!/^[a-f0-9]{128}$/.test(parts[2]))return false;
  const actual=await derive(password,Buffer.from(parts[1],'hex'),64);
  return timingSafeEqual(actual,Buffer.from(parts[2],'hex'));
}
export function adminIdentity(username) {
  if(typeof username!=='string'||!/^[a-z0-9_-]{3,40}$/.test(username))throw new Error('Invalid username');
  return `${username}@admin.nutrilenz.in`;
}
