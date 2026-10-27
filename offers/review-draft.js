// Questions invite honest user-authored feedback rather than copied testimonials.
const openings = [
  'Write about finding your Loomii link and sharing it on Instagram.',
  'Describe receiving anonymous messages from friends through Loomii.',
  'Describe creating your Loomii account and user ID.',
  'Describe the Loomii screen layout, navigation and text readability.',
  'Describe a friend opening your Loomii link to send a message.',
  'Describe how Loomii explains the sender staying anonymous.',
  'Describe using your Loomii link in a WhatsApp status or social story.',
  'Describe Loomii performance on your phone, including any lag or errors.',
  'Describe finding and reading new messages in Loomii.',
  'Write about composing and sending a message through Loomii.',
  'Describe using Loomii buttons and controls on your phone.',
  'Describe trying Loomii with a friend for the first time.',
];
const endings = [
  'Describe what you actually tried and what you would improve.',
  'Share what worked and what did not, in your own words.',
  'Include something you personally tried and any problems you encountered.',
  'Describe your own experience, including any confusion or difficulties.',
  'Write honest feedback based on your own use of the app.',
  'Mention what you would change; any rating or criticism is welcome.',
];
export function reviewDraft(code, includeReference = true) {
  let seed = 2166136261;
  for (const char of String(code)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const text = `${openings[seed % openings.length]} ${endings[Math.floor(seed / openings.length) % endings.length]}`;
  return includeReference ? `${text}\n\nReview reference: ${code}` : text;
}

export function nextFeedbackSeed(currentSeed) {
  const current=reviewDraft(currentSeed,false).split('?')[0].split('.')[0];
  let candidate;
  do {candidate=crypto.randomUUID();}while(reviewDraft(candidate,false).split('?')[0].split('.')[0]===current);
  return candidate;
}
