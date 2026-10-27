// Questions invite honest user-authored feedback rather than copied testimonials.
const openings = [
  'How easy was it to find your Loomii link and share it on Instagram?',
  'Describe receiving anonymous messages from friends through Loomii.',
  'How did creating your Loomii account and user ID work for you?',
  'Describe the Loomii screen layout, navigation and text readability.',
  'What happened when a friend opened your Loomii link to send a message?',
  'How clear was Loomii about the sender staying anonymous?',
  'Describe using your Loomii link in a WhatsApp status or social story.',
  'How did Loomii perform on your phone? Mention any lag or errors.',
  'Was it clear where to find new messages in Loomii?',
  'What would you improve about writing and sending a message through Loomii?',
  'Describe whether Loomii buttons and controls were easy to use on your phone.',
  'What did you learn after trying Loomii with a friend for the first time?',
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
