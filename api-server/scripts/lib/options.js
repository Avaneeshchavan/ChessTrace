function positiveInt(value, name, max) {
  if (!/^\d+$/.test(value) || +value < 1 || +value > max) {
    throw new Error(`--${name} must be an integer between 1 and ${max}`);
  }
  return +value;
}

module.exports = { positiveInt };
