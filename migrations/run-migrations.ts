import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ConnectionConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: { rejectUnauthorized: boolean };
}

async function tryConnect(configs: { name: string; config: ConnectionConfig }[]): Promise<pg.Client> {
  let lastError: any = null;
  const caCertificate = process.env.SUPABASE_DB_CA_CERT?.replace(/\\n/g, '\n').trim();

  if (process.env.NODE_ENV === 'production' && !caCertificate) {
    throw new Error('SUPABASE_DB_CA_CERT is required in production to verify the Supabase TLS certificate.');
  }

  for (const { name, config } of configs) {
    console.log(`🔌 Attempting connection: ${name}...`);
    const client = new Client({
      ...config,
      ssl: { ca: caCertificate, rejectUnauthorized: true },
      connectionTimeoutMillis: 8000,
    });

    try {
      await client.connect();
      console.log(`✅ Connection established via ${name}!`);
      return client;
    } catch (err: any) {
      console.log(`⚠️  ${name} failed: ${err.message}`);
      lastError = err;
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }

  throw lastError;
}

async function runMigrations() {
  console.log('====================================================');
  console.log('   MASTER_BOY Database Migration Runner v2.0.0      ');
  console.log('====================================================\n');

  const migrationFiles = [
    '001_initial_schema.sql',
    '002_seed_data.sql',
    '003_advertisements_schema.sql',
    '004_runtime_storage.sql',
    '005_sort_catalog_and_disable_demo_profiles.sql',
    '006_georgian_alphabetical_city_order.sql',
    '007_remove_redundant_indexes.sql',
    '008_ai_provider_secrets.sql',
    '009_superadmin_provider_config_secrets.sql',
  ];

  // Verify all files exist
  for (const file of migrationFiles) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Migration file not found: ${filePath}`);
      process.exit(1);
    }
    const sql = fs.readFileSync(filePath, 'utf-8');
    const statementCount = sql.split(';').filter((s) => s.trim().length > 0).length;
    console.log(`📄 Found ${file} (${(sql.length / 1024).toFixed(1)} KB, ~${statementCount} statements)`);
  }

  // Get raw URL from argv or env
  const rawUrl =
    process.argv[2] ||
    process.env.DATABASE_URL;

  if (!rawUrl) { console.error('❌ DATABASE_URL is required.'); process.exit(1); }

  console.log('\n🔍 Target database URL detected.');

  // Parse connection URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (err: any) {
    console.error('❌ Invalid DATABASE_URL format. Expected a valid PostgreSQL connection URL.');
    process.exit(1);
  }

  const rawPassword = parsedUrl.password;
  const decodedPassword = decodeURIComponent(rawPassword);
  const username = parsedUrl.username || 'postgres';
  const hostname = parsedUrl.hostname;
  const port = parseInt(parsedUrl.port || '5432', 10);
  const database = parsedUrl.pathname.replace(/^\//, '') || 'postgres';
  const secureConnectionUrl = new URL(rawUrl);
  ['sslmode', 'sslrootcert', 'sslcert', 'sslkey'].forEach((key) => secureConnectionUrl.searchParams.delete(key));
  const normalizedConnectionString = secureConnectionUrl.toString();

  // Build candidate configurations
  const candidateConfigs: { name: string; config: ConnectionConfig }[] = [];

  // Check if this is a Supabase hostname (db.<project-ref>.supabase.co)
  const supabaseMatch = hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);

  if (supabaseMatch) {
    const projectRef = supabaseMatch[1];
    console.log(`💡 Detected Supabase Project Reference: "${projectRef}"`);

    // 1. Supabase Session Pooler (IPv4 / IPv6 compatible, port 5432)
    candidateConfigs.push({
      name: `Supabase Session Pooler (aws-0-eu-west-2.pooler.supabase.com:5432, user: postgres.${projectRef}, decoded pw)`,
      config: {
        host: 'aws-0-eu-west-2.pooler.supabase.com',
        port: 5432,
        user: `postgres.${projectRef}`,
        password: decodedPassword,
        database,
      },
    });

    // 2. Supabase Transaction Pooler (port 6543)
    candidateConfigs.push({
      name: `Supabase Transaction Pooler (aws-0-eu-west-2.pooler.supabase.com:6543, user: postgres.${projectRef}, decoded pw)`,
      config: {
        host: 'aws-0-eu-west-2.pooler.supabase.com',
        port: 6543,
        user: `postgres.${projectRef}`,
        password: decodedPassword,
        database,
      },
    });

    // 3. Direct Connection to Supabase db host (port 6543 / 5432)
    candidateConfigs.push({
      name: `Direct Supabase Host (db.${projectRef}.supabase.co:6543, user: postgres)`,
      config: {
        host: hostname,
        port: 6543,
        user: username,
        password: decodedPassword,
        database,
      },
    });

    candidateConfigs.push({
      name: `Direct Supabase Host (db.${projectRef}.supabase.co:5432, user: postgres)`,
      config: {
        host: hostname,
        port: 5432,
        user: username,
        password: decodedPassword,
        database,
      },
    });

    // Also test with raw unescaped password if different
    if (rawPassword !== decodedPassword) {
      candidateConfigs.push({
        name: `Supabase Session Pooler (port 5432 with raw password string)`,
        config: {
          host: 'aws-0-eu-west-2.pooler.supabase.com',
          port: 5432,
          user: `postgres.${projectRef}`,
          password: rawPassword,
          database,
        },
      });
    }
  } else {
    // Standard PostgreSQL connection
    candidateConfigs.push({
      name: `Direct PostgreSQL URL (decoded password)`,
      config: {
        connectionString: normalizedConnectionString,
      },
    });
  }

  let client: pg.Client;
  try {
    client = await tryConnect(candidateConfigs);
  } catch (err: any) {
    console.error('\n❌ Could not connect to PostgreSQL database.');
    console.error(`💥 Details: ${err.message}\n`);

    if (err.message.includes('password authentication failed') || err.message.includes('SASL authentication failed')) {
      console.log('🔑 [ავტორიზაციის შეცდომა / Authentication Failed]');
      console.log('Supabase-ში მომხმარებლის (postgres) პაროლი არ ემთხვევა მითითებულ პაროლს.');
      console.log('გთხოვთ შეამოწმოთ ან დაარესეტოთ პაროლი Supabase Dashboard-ში:');
      console.log('👉 https://supabase.com/dashboard/project/ojnaztajdhxqfvaqcmos/settings/database');
      console.log('👉 დააჭირეთ "Reset database password"-ს, შეიყვანეთ ახალი პაროლი და მოგვაწოდეთ განახლებული URL.');
    }
    process.exit(1);
  }

  try {
    // Check DB info
    const infoRes = await client.query('SELECT NOW() as current_time, current_database() as db_name, version()');
    console.log(`\n📦 Connected to database: "${infoRes.rows[0].db_name}" at ${infoRes.rows[0].current_time}`);
    console.log(`   Engine: ${infoRes.rows[0].version.split(',')[0]}`);

    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Keep the internal migration tracker out of the public client API on fresh installs too.
    await client.query(`
      ALTER TABLE public._migrations ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS migration_tracker_deny_client_access ON public._migrations;
      CREATE POLICY migration_tracker_deny_client_access
        ON public._migrations FOR ALL TO anon, authenticated
        USING (false) WITH CHECK (false);
    `);

    // Get list of already executed migrations
    const executedRes = await client.query('SELECT filename FROM _migrations');
    const executedSet = new Set(executedRes.rows.map((r: any) => r.filename));

    console.log('\n🚀 Applying migration scripts in sequence...');

    for (const file of migrationFiles) {
      if (executedSet.has(file)) {
        console.log(`⏭️  Skipping ${file} (already executed previously)`);
        continue;
      }

      console.log(`⏳ Applying ${file}...`);
      const filePath = path.join(__dirname, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      // Execute migration
      await client.query(sql);

      // Record in _migrations
      await client.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING', [file]);
      console.log(`✅ Successfully applied and verified ${file}`);
    }

    // Verify key tables were created
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log('\n📋 Public tables currently in database:');
    for (const row of tablesRes.rows) {
      console.log(`   - ${row.table_name}`);
    }

    console.log('\n🎉 ALL MIGRATIONS COMPLETED SUCCESSFULLY! Database is ready.');
  } catch (err: any) {
    console.error('\n❌ Error applying migration:', err.message);
    if (err.position) {
      console.error(`   At statement position: ${err.position}`);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations().catch(console.error);
