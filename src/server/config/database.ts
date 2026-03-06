import { DatabaseService } from '../services/database.service';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';

dotenv.config();

// Generate encryption key if not provided
function getEncryptionKey(): string {
  let key = process.env.ENCRYPTION_KEY;

  if (!key) {
    // Generate a random 32-byte key
    key = crypto.randomBytes(32).toString('hex');
    console.warn('WARNING: ENCRYPTION_KEY not set in .env. Using temporary key. Tokens will not persist across restarts.');
    console.warn(`Generated key: ${key}`);
    console.warn('Add this to your .env file: ENCRYPTION_KEY=' + key);
  }

  return key;
}

const dbPath = process.env.DATABASE_PATH || './data/database.sqlite';
const encryptionKey = getEncryptionKey();

let db: DatabaseService;
let dbInitialized = false;

export async function getDatabase(): Promise<DatabaseService> {
  if (!dbInitialized) {
    db = new DatabaseService(dbPath, encryptionKey);
    await db.initialize();
    dbInitialized = true;
  }
  return db;
}

export default getDatabase;
