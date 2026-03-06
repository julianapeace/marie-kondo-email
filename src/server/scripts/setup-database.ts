import getDatabase from '../config/database';

async function setup() {
  console.log('🗄️  Setting up database...\n');

  try {
    const db = await getDatabase();
    console.log('✅ Database schema created successfully!');
    console.log(`📁 Database location: ${process.env.DATABASE_PATH || './data/database.sqlite'}\n`);
    console.log('Database tables created:');
    console.log('  - users');
    console.log('  - emails');
    console.log('  - triage_queue');
    console.log('  - unsubscribe_methods');
    console.log('  - action_log');
    console.log('  - sender_stats');
    console.log('  - sessions\n');

    db.close();
    console.log('✅ Setup complete!\n');
  } catch (error) {
    console.error('❌ Error setting up database:', error);
    process.exit(1);
  }
}

setup();
