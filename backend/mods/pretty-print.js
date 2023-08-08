const seen = [];
/**
 * Check if a value is an object or a function. Keep in mind that array, function, regexp, etc, are objects in JavaScript.
 *
 * @param value the value to check
 * @return true if the value is an object or a function
 */
function isObj(value) {
  const type = typeof value;
  return value !== null && (type === 'object' || type === 'function');
}
/**
 * Check if a value is a regular expression.
 *
 * @param value the value to check
 * @return true if the value is a regular expression
 */
function isRegexp(value) {
  return Object.prototype.toString.call(value) === '[object RegExp]';
}

function __spreadArrays() {
  for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
  for (var r = Array(s), k = 0, i = 0; i < il; i++) for (let a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++) r[k] = a[j];
  return r;
}

/**
 * Get an array of all of the enumerable symbols for an object.
 *
 * @param object the object to get the enumerable symbols for
 */
function getOwnEnumPropSymbols(object) {
  return Object.getOwnPropertySymbols(object).filter((keySymbol) => Object.prototype.propertyIsEnumerable.call(object, keySymbol));
}
/**
 * pretty print an object
 *
 * @param input the object to pretty print
 * @param options the formatting options, transforms, and filters
 * @param pad the padding string
 */
function prettyPrint(input, options, pad) {
  if (pad === void 0) { pad = ''; }
  // sensible option defaults
  const defaultOptions = {
    indent: '\t',
    singleQuotes: true,
  };
  const combinedOptions = Object.assign(defaultOptions, options);
  let tokens;
  if (combinedOptions.inlineCharacterLimit === undefined) {
    tokens = {
      newLine: '\n',
      newLineOrSpace: '\n',
      pad,
      indent: pad + combinedOptions.indent,
    };
  } else {
    tokens = {
      newLine: '@@__PRETTY_PRINT_NEW_LINE__@@',
      newLineOrSpace: '@@__PRETTY_PRINT_NEW_LINE_OR_SPACE__@@',
      pad: '@@__PRETTY_PRINT_PAD__@@',
      indent: '@@__PRETTY_PRINT_INDENT__@@',
    };
  }
  const expandWhiteSpace = function (string) {
    if (combinedOptions.inlineCharacterLimit === undefined) {
      return string;
    }
    const oneLined = string
      .replace(new RegExp(tokens.newLine, 'g'), '')
      .replace(new RegExp(tokens.newLineOrSpace, 'g'), ' ')
      .replace(new RegExp(`${tokens.pad}|${tokens.indent}`, 'g'), '');
    if (oneLined.length <= combinedOptions.inlineCharacterLimit) {
      return oneLined;
    }
    return string
      .replace(new RegExp(`${tokens.newLine}|${tokens.newLineOrSpace}`, 'g'), '\n')
      .replace(new RegExp(tokens.pad, 'g'), pad)
      .replace(new RegExp(tokens.indent, 'g'), pad + combinedOptions.indent);
  };
  if (seen.indexOf(input) !== -1) {
    return '"[Circular]"';
  }
  if (input === null
        || input === undefined
        || typeof input === 'number'
        || typeof input === 'boolean'
        || typeof input === 'function'
        || typeof input === 'symbol'
        || isRegexp(input)) {
    return String(input);
  }
  if (input instanceof Date) {
    return "new Date('".concat(input.toISOString(), "')");
  }
  if (Array.isArray(input)) {
    if (input.length === 0) {
      return '[]';
    }
    seen.push(input);
    var ret = `[${tokens.newLine}${input.map((el, i) => {
      const eol = input.length - 1 === i ? tokens.newLine : `,${tokens.newLineOrSpace}`;
      let value = prettyPrint(el, combinedOptions, pad + combinedOptions.indent);
      if (combinedOptions.transform) {
        value = combinedOptions.transform(input, i, value);
      }
      return tokens.indent + value + eol;
    }).join('')}${tokens.pad}]`;
    seen.pop();
    return expandWhiteSpace(ret);
  }
  if (isObj(input)) {
    let objKeys_1 = [...Object.keys(input), ...(getOwnEnumPropSymbols(input))];
    if (combinedOptions.filter) {
      objKeys_1 = objKeys_1.filter((el) => combinedOptions.filter && combinedOptions.filter(input, el));
    }
    if (objKeys_1.length === 0) {
      return '{}';
    }
    seen.push(input);
    var ret = `{${tokens.newLine}${objKeys_1.map((el, i) => {
      const eol = objKeys_1.length - 1 === i ? tokens.newLine : `,${tokens.newLineOrSpace}`;
      const isSymbol = typeof el === 'symbol';
      const isClassic = !isSymbol && /^[a-z$_][a-z$_0-9]*$/i.test(el.toString());
      const key = isSymbol || isClassic ? el : prettyPrint(el, combinedOptions);
      let value = prettyPrint(input[el], combinedOptions, pad + combinedOptions.indent);
      if (combinedOptions.transform) {
        value = combinedOptions.transform(input, el, value);
      }
      return `${tokens.indent + String(key)}: ${value}${eol}`;
    }).join('')}${tokens.pad}}`;
    seen.pop();
    return expandWhiteSpace(ret);
  }
  input = String(input).replace(/[\r\n]/g, (x) => (x === '\n' ? '\\n' : '\\r'));
  if (!combinedOptions.singleQuotes) {
    input = input.replace(/"/g, '\\"');
    return '"'.concat(input, '"');
  }
  input = input.replace(/\\?'/g, '\\\'');
  return "'".concat(input, "'");
}
export default prettyPrint;
