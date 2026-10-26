function privateKeyFromEnv(name) {
  const raw = process.env[name];
  if (!raw) {
    throw new Error(`Missing ${name} in .env`);
  }

  const value = raw.trim();
  const key = value.startsWith("0x") ? value : `0x${value}`;

  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(`${name} must be a 32-byte private key, with or without 0x prefix`);
  }

  return key;
}

module.exports = { privateKeyFromEnv };
