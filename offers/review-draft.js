// Questions invite honest user-authored feedback rather than copied testimonials.
const openings = [
  'How did sharing your Loomii link on an Instagram story work for you?',
  'What was your experience receiving anonymous messages from friends through Loomii?',
  'How easy or difficult was creating your Loomii link and sharing it in a status?',
  'Was the anonymous messaging experience in Loomii clear to you?',
  'What happened when a friend opened your Loomii link and sent a message?',
  'What would make sharing a Loomii link and receiving anonymous messages better?',
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
