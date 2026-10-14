export const dailyCheckins = [
  'yo, anything good happen today?',
  "so, how'd today go?",
  'anything worth keeping from today?',
  'hey, got a good moment from today?',
  'alright, tell me something good.',
  'anything nice happen, even something small?',
  "what's one thing that didn't suck today?"
];

export const savedReplies = [
  'got it. keeping that one.',
  'nice. saved.',
  'one for the collection.',
  'hell yeah. saved.'
];

export const skipReplies = [
  'fair. see you tomorrow.',
  'fair enough. maybe tomorrow.',
  'yeah, some days are just like that.'
];

export const memoryIntros = [
  'yo, remember this?',
  'found this one from a while back.',
  'this one turned up.',
  'here’s one from the collection.'
];

export const pick = (items) => items[Math.floor(Math.random() * items.length)];

export function pickDailyVariant(lastVariant = null) {
  const parsed = lastVariant === null ? null : Number(lastVariant);
  const choices = dailyCheckins.map((_, index) => index).filter((index) => index !== parsed);
  return pick(choices);
}

export const dailyMessage = (variant) => dailyCheckins[Number(variant)] ?? pick(dailyCheckins);
