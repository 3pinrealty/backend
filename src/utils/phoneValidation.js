const PHONE_REGEX = /^[0-9+\-()\s]{8,20}$/

const PHONE_VALIDATION_MESSAGE =
  'Enter a valid phone number (8–20 characters: digits, +, -, spaces, and parentheses only).'

function trimPhone(raw) {
  return String(raw ?? '').trim()
}

function isValidPhone(raw) {
  return PHONE_REGEX.test(trimPhone(raw))
}

module.exports = {
  PHONE_REGEX,
  PHONE_VALIDATION_MESSAGE,
  trimPhone,
  isValidPhone,
}
