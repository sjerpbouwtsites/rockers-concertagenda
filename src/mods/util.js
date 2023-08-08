export function BEMify(selectors = '', modifiers = null) {
  if (!modifiers || modifiers.length === 0) return selectors;
  let modAr;
  if (typeof modifiers === 'string') {
    modAr = [modifiers];
  } else {
    modAr = modifiers;
  }
  return selectors
    .split(' ')
    .map((selector) => {
      const modified = modAr
        .filter((modifier) => modifier)
        .map((modifier) => `${selector}--${modifier}`)
        .join(' ');
      return `${selector} ${modified}`;
    })
    .join(' ')
    .trim();
}

export function stripHTML(text) {
  if (!text) return '';
  return text.replace(/<\/?\w+>/g, '');
}

/**
 * To be used in filter method. Removes those events that are past or dont have a start
 * @param {*} musicEvent
 * @returns bool
 */
export function filterEventsDateInPast(musicEvent) {
  if (!musicEvent.start) {
    return false;
  }
  const musicEventTime = Number(
    new Date(musicEvent.start).toISOString().substring(0, 10).replace(/-/g, ''),
  );
  const nowDate = Number(new Date().toISOString().substring(0, 10).replace(/-/g, ''));
  return musicEventTime >= nowDate;
}

export async function waitFor(wait = 500) {
  return new Promise((res) => {
    setTimeout(res, wait);
  });
}

export default {};
