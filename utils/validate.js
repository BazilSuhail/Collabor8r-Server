function required(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return `${fieldName} is required`;
  }
  return null;
}

function isString(value, fieldName) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    return `${fieldName} must be a string`;
  }
  return null;
}

function isNumber(value, fieldName) {
  if (value !== undefined && value !== null && typeof value !== 'number') {
    return `${fieldName} must be a number`;
  }
  return null;
}

function isBoolean(value, fieldName) {
  if (value !== undefined && value !== null && typeof value !== 'boolean') {
    return `${fieldName} must be a boolean`;
  }
  return null;
}

function isDate(value, fieldName) {
  if (value !== undefined && value !== null) {
    const d = new Date(value);
    if (isNaN(d.getTime())) return `${fieldName} must be a valid date`;
  }
  return null;
}

function isEmail(value, fieldName) {
  if (value !== undefined && value !== null && value !== '') {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(value)) return `${fieldName} must be a valid email`;
  }
  return null;
}

function isEnum(value, fieldName, validValues) {
  if (value !== undefined && value !== null && !validValues.includes(value)) {
    return `${fieldName} must be one of: ${validValues.join(', ')}`;
  }
  return null;
}

function isMongoId(value, fieldName) {
  if (value !== undefined && value !== null) {
    const re = /^[0-9a-fA-F]{24}$/;
    if (!re.test(String(value))) return `${fieldName} must be a valid ObjectId`;
  }
  return null;
}

function minLength(value, fieldName, min) {
  if (value !== undefined && value !== null && typeof value === 'string' && value.length < min) {
    return `${fieldName} must be at least ${min} characters`;
  }
  return null;
}

function maxLength(value, fieldName, max) {
  if (value !== undefined && value !== null && typeof value === 'string' && value.length > max) {
    return `${fieldName} must be at most ${max} characters`;
  }
  return null;
}

function min(value, fieldName, minVal) {
  if (value !== undefined && value !== null && typeof value === 'number' && value < minVal) {
    return `${fieldName} must be at least ${minVal}`;
  }
  return null;
}

function max(value, fieldName, maxVal) {
  if (value !== undefined && value !== null && typeof value === 'number' && value > maxVal) {
    return `${fieldName} must be at most ${maxVal}`;
  }
  return null;
}

function isArray(value, fieldName) {
  if (value !== undefined && value !== null && !Array.isArray(value)) {
    return `${fieldName} must be an array`;
  }
  return null;
}

function isObject(value, fieldName) {
  if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value) || value === null)) {
    return `${fieldName} must be an object`;
  }
  return null;
}

function validate(rules, data) {
  const errors = [];
  for (const [field, validators] of Object.entries(rules)) {
    const value = data[field];
    for (const validator of validators) {
      const error = validator(value, field);
      if (error) {
        errors.push(error);
        break;
      }
    }
  }
  return errors.length > 0 ? errors : null;
}

module.exports = {
  required, isString, isNumber, isBoolean, isDate, isEmail,
  isEnum, isMongoId, minLength, maxLength, min, max,
  isArray, isObject, validate,
};
