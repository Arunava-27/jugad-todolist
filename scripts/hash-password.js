// Generates a bcrypt hash for ADMIN_PASSWORD_HASH.
// Usage: node scripts/hash-password.js "your-password-here"
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.js "your-password"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log(hash);
