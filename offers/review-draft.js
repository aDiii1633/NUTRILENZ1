// Neutral drafts describe the app rather than inventing praise or a user's experience.
const openings = [
  'Loomii is an app for anonymous questions and answers.',
  'Loomii focuses on anonymous Q&A.',
  'Anonymous questions and answers are the main idea behind Loomii.',
  'Loomii brings an anonymous Q&A format to a mobile app.',
  'The Loomii app is built around anonymous questions and replies.',
  'Loomii offers a place for anonymous questions and answers.',
];
const endings = [
  'Sharing my feedback on that experience here.',
  'This review is about its anonymous Q&A experience.',
  'Leaving my feedback about the app here.',
  'My feedback here relates to the app and its Q&A format.',
  'Sharing a review of the app and its question-and-answer format.',
  'This is my review of the anonymous question-and-answer experience.',
];
export function reviewDraft(code, includeReference = true) {
  let seed = 2166136261;
  for (const char of String(code)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const text = `${openings[seed % openings.length]} ${endings[Math.floor(seed / openings.length) % endings.length]}`;
  return includeReference ? `${text}\n\nReview reference: ${code}` : text;
}
