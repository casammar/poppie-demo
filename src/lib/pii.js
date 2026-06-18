function luhnCheck(numStr) {
  let sum = 0;
  let double = false;
  for (let i = numStr.length - 1; i >= 0; i--) {
    let digit = Number(numStr[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function isValidIPv4(ip) {
  return ip.split('.').every(o => Number(o) <= 255);
}

function redactCreditCards(text) {
  return text.replace(/\b(?:\d[ -]?){13,19}\b/g, match =>
    luhnCheck(match.replace(/[ -]/g, '')) ? '[REDACTED_CC]' : match
  );
}

function redactIPAddresses(text) {
  return text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, match =>
    isValidIPv4(match) ? '[REDACTED_IP]' : match
  );
}

export function redactPII(text) {
  if (typeof text !== 'string') return text;
  let result = text;
  result = result.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]');
  result = result.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');
  result = result.replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, '[REDACTED_PHONE]');
  result = redactCreditCards(result);
  result = redactIPAddresses(result);
  result = result.replace(
    /\b(?:my name is|i'm|i am|this is|call me)\s+([A-Za-z][a-z]+(?:\s[A-Za-z][a-z]+)?)/gi,
    (m, name) => /^[A-Z]/.test(name) ? m.replace(name, '[REDACTED_NAME]') : m
  );
  return result;
}

export function maskMessages(messages) {
  if (!Array.isArray(messages)) throw new TypeError('messages must be an array');
  return messages.map(m => {
    if (!m || typeof m !== 'object') throw new TypeError('invalid message entry');
    if (typeof m.content === 'string') {
      return { ...m, content: redactPII(m.content) };
    }
    if (Array.isArray(m.content)) {
      return {
        ...m,
        content: m.content.map(block =>
          block?.type === 'text' ? { ...block, text: redactPII(block.text) } : block
        ),
      };
    }
    return m;
  });
}
