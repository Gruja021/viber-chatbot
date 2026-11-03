import { encrypt, decrypt } from '../crypto';

describe('crypto', () => {
  it('round-trip: decrypt(encrypt(text)) returns original text', () => {
    const plaintext = 'secret database credentials {"host":"db.example.com"}';
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('two encryptions of the same text produce different output (random IV)', () => {
    const plaintext = 'same input';
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);
    expect(enc1.equals(enc2)).toBe(false);
  });

  it('tampered buffer throws an error', () => {
    const encrypted = encrypt('test data');
    // Flip a byte in the ciphertext portion (after IV + auth tag = 32 bytes)
    encrypted[32] = encrypted[32] ^ 0xff;
    expect(() => decrypt(encrypted)).toThrow();
  });

  it('handles empty string', () => {
    const encrypted = encrypt('');
    expect(decrypt(encrypted)).toBe('');
  });

  it('handles unicode text', () => {
    const plaintext = 'Šđčćž 日本語 emoji: 🎉';
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });
});
