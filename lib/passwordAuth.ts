import bcrypt from 'bcryptjs';

export interface PasswordCheckResult {
  valid: boolean;
  needsRehash: boolean;
}

export async function verifyPassword(plain: string, stored: string): Promise<PasswordCheckResult> {
  if (!stored) return { valid: false, needsRehash: false };

  if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
    const valid = await bcrypt.compare(plain, stored);
    return { valid, needsRehash: false };
  }

  // Contraseña legada en texto plano
  const valid = stored === plain;
  return { valid, needsRehash: valid };
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
