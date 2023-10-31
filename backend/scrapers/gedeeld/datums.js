function arrayCheckAndOrToString(event, key, required = true) {
  if (!event[key]) {
    if (required) {
      throw new Error(`${key} not on event`);
    } else {
      return false;
    }
  }
  const src = event[key];
  if (typeof src === 'string') {
    return (`${src}`).trim();
  }
  if (Array.isArray(src) && typeof src[0] === 'string') {
    return src[0].trim();
  }

  throw new Error(`geen array of string. typeof event.${key} ${typeof event[key]}`);
}

function isDate(date, str, required = true) {
  if (/\d{4}-\d\d-\d\d/.test(date)) {
    return true;
  }
  if (required) {
    throw new Error(`${date} ${str} geen date`);
  }
  return false;
}

function isTime(time, str, required = true) {
  if (/\d{1,2}\s?:\s?\d\d/.test(time)) {
    return true;
  }
  if (required) {
    throw new Error(`${time} ${str} geen tijd`);
  }
  return false;
}

function isISOString(date, str = '', required = true) {
  try {
    (new Date(date).toISOString());
  } catch (error) {
    if (required) {
      throw new Error(`${date} ${str} geen isostring`);
    } else {
      return false;
    }
  }
  return true;
}

function _mapToDateString(event, key, required) {
  const cappedKey = key[0].toUpperCase() + key.substring(1, 10);
  const mapKey = `mapTo${cappedKey}`;
  try {
    const str = arrayCheckAndOrToString(event, mapKey, required);
    try {
      if (str && isISOString(str, mapKey)) {
        // eslint-disable-next-line no-param-reassign
        event[key] = event[mapKey];
      }
    } catch (isISOError) {
      event.errors.push({
        error: isISOError,
        remarks: `isISOString err ${mapKey} ${event.anker}`,
        toDebug: {
          key: `${key}`,
          [`${mapKey}`]: `${event[mapKey]}`,
        },
      });
    }
  } catch (arrayCheckError) {
    event.errors.push({
      error: arrayCheckError,
      remarks: `Array check ${mapKey} ${event.anker}`,
      [`${mapKey}`]: event[mapKey],
    });
  }

  return event;
}

function _mapToTime(event, key, required) {
  const cappedKey = key[0].toUpperCase() + key.substring(1, 10);
  const mapKey = `mapTo${cappedKey}Time`;
  const timeKey = `${key}Time`;
  try {
    const str = arrayCheckAndOrToString(event, mapKey, required);
    let match;
    try {
      if (isTime(str, mapKey, required)) {
        match = str.match(/(\d\d):(\d\d)/);
        const secs = '00';
        // eslint-disable-next-line no-param-reassign
        event[timeKey] = `${match[1]}:${match[2]}:${secs}`;
      }
    } catch (isTimeError) {
      event.errors.push({
        error: isTimeError,
        remarks: `isTimeError ${mapKey} ${event.anker}`,
        toDebug: {
          [`${mapKey}`]: event[mapKey],
          event,
          match,
        },
      });
    }
  } catch (arrayCheckError) {
    event.errors.push({
      error: arrayCheckError,
      remarks: `Array check ${mapKey} ${event.anker}`,
      toDebug: JSON.parse(JSON.stringify(event)),
    });
  }

  return event;
}

export function mapToStartTime(event) {
  return _mapToTime(event, 'start', true);
}

export function mapToDoorTime(event) {
  return _mapToTime(event, 'door', false);
}

export function mapToStartDate(event, regexMode, months) {
  if (Array.isArray(event.mapToStartDate)) {
    event.errors.push({
      error: new Error('type error map to start date'),
      remarks: 'mapToStartDate is Array',
      toDebug:event.mapToStartDate,
    });
    return event;
  }

  if (!event.mapToStartDate) {
    event.errors.push({
      error: new Error('map to start date falsy'),
      remarks: 'mapToStartDate is falsy',
      toDebug: event.mapToStartDate,
    });
    return event;
  }

  if (regexMode === 'dag-maandNaam') {
    const dateM = event.mapToStartDate.match(/(\d{1,2})[\/\s]?(\w+)/);

    if (!Array.isArray(dateM) || (Array.isArray(dateM) && dateM.length < 3)) {
      event.errors.push({
        error: new Error(`datematch dag-maandNaam mode`),
        toDebug: {
          string: event.mapToStartDate,
          res: dateM,
        },
      });
      return event;
    }
    let jaar = (new Date()).getFullYear();
    const huiMaandNr = (new Date()).getMonth() + 1;
    const maandNaam = dateM[2];
    const maandGetal = months[maandNaam];
    if (huiMaandNr > maandGetal) {
      jaar += jaar + 1;
    }
    const dag = dateM[1].padStart(2, '0');
    const dateStr = `${jaar}-${maandGetal}-${dag}`;
    if (isDate(dateStr)) {
      // eslint-disable-next-line no-param-reassign
      event.startDate = dateStr;
    }
    return event;
  }
  if (regexMode === 'dag-maandNaam-jaar') {
    const dateM = event.mapToStartDate.match(/(\d{1,2})[\/\s]?(\w+)[\/\s]?(\d{2,4})/);
    if (!Array.isArray(dateM) || (Array.isArray(dateM) && dateM.length < 4)) {
      event.errors.push({
        error: new Error(`datematch dag-maandNaam-jaar mode`),
        toDebug: {
          string: event.mapToStartDate,
          res: dateM,
        },
      });
      return event;
    }
    const jaar = dateM[3].padStart(4, '20');
    const maandNaam = dateM[2];
    const maandGetal = months[maandNaam.toLowerCase()];
    const dag = dateM[1].padStart(2, '0');
    const dateStr = `${jaar}-${maandGetal}-${dag}`;
    if (isDate(dateStr)) {
      // eslint-disable-next-line no-param-reassign
      event.startDate = dateStr;
    }
    return event;
  }
  if (regexMode === 'maand-dag-jaar') {
    const dateM = event.mapToStartDate.match(/(\w+)\s(\d\d)\s?,?\s?(\d\d\d\d)/im);
    if (Array.isArray(dateM) && dateM.length < 4) {
      event.errors.push({
        error: new Error(`datematch maand-dag-jaar mode`),
        toDebug: {
          string: event.mapToStartDate,
          res: dateM,
        },
      });
      return event;
    }
    const maandNaam = dateM[1];
    const maandGetal = months[maandNaam.toLowerCase()];
    const dag = dateM[2].padStart(2, '0');
    const jaar = dateM[3].padStart(4, '20');
    const dateStr = `${jaar}-${maandGetal}-${dag}`;
    if (isDate(dateStr)) {
      // eslint-disable-next-line no-param-reassign
      event.startDate = dateStr;
    }
    return event;
  }
  if (regexMode === 'dag-maandNummer-jaar') {
    const dateM = event.mapToStartDate.match(/(\d{1,2})[\/\s]?(\d+)[\/\s]?(\d{2,4})/);
    if (!Array.isArray(dateM) || (Array.isArray(dateM) && dateM.length < 4)) {
      event.errors.push({
        error: new Error(`datematch dag-maandNummer-jaar mode`),
        toDebug: {
          string: event.mapToStartDate,
          res: dateM,
        },
      });
      return event;
    }
    const jaar = dateM[3].padStart(4, '20');
    const maandGetal = dateM[2];
    const dag = dateM[1].padStart(2, '0');
    const dateStr = `${jaar}-${maandGetal}-${dag}`;
    if (isDate(dateStr)) {
      // eslint-disable-next-line no-param-reassign
      event.startDate = dateStr;
    }
    return event;
  }
  event.errors.push({
    remarks: `onbekende regexMode ${regexMode}`,
  });

  return event;
}
function _combineTimeDate(event, destKey, required) {
  const timeString = `${destKey}Time`;
  try {
    const str = `${event.startDate}T${event[timeString]}`;
    if (isISOString(str, timeString, required)) {
      // eslint-disable-next-line no-param-reassign
      event[destKey] = str;
    }
  } catch (combineTimeDateError) {
    event.errors.push({
      error: combineTimeDateError,
      remarks: `Err combine startDate ${timeString} to ${destKey}`,
      toDebug:{
        startDate: `${event.startDate}`,
        time: `${event[timeString]}`,
        combi: `${event.startDate}T${event[timeString]}`,
      },
    });
  }

  return event;
}
export function combineStartTimeStartDate(event) {
  return _combineTimeDate(event, 'start', true);
}
export function combineDoorTimeStartDate(event) {
  return _combineTimeDate(event, 'door', false);
}
export function combineEndTimeStartDate(event) {
  return _combineTimeDate(event, 'end', false);
}

export function mapToStart(event) {
  return _mapToDateString(event, 'start', true);
}

export function mapToDoor(event) {
  return _mapToDateString(event, 'door', false);
}

export default {};
