const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dbConfig = require('./db');

// Setup file logging
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFileName = `registration-tracker-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
const logFilePath = path.join(logDir, logFileName);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// Logger utility that writes to both console and file
const logger = {
  log: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(message);
    logStream.write(logMessage + '\n');
  },
  error: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ERROR: ${message}`;
    console.error(message);
    logStream.write(logMessage + '\n');
  },
  warn: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] WARN: ${message}`;
    console.warn(message);
    logStream.write(logMessage + '\n');
  },
  close: () => {
    logStream.end();
  }
};

// Handle process exit to close log stream
process.on('exit', () => {
  logger.close();
});
process.on('SIGINT', () => {
  logger.close();
  process.exit();
});
process.on('SIGTERM', () => {
  logger.close();
  process.exit();
});

logger.log('=== Loading registration-tracker-migration.js ===');
logger.log(`Log file: ${logFilePath}`);

function isUUID(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function migrateRegistrationTracker() {
  logger.log('=== STARTING REGISTRATION TRACKER MIGRATION ===');
  const sourceClient = new Client(dbConfig.source);
  const destClient = new Client(dbConfig.destination);

  try {
    await sourceClient.connect();
    logger.log('[REG TRACKER] Connected to source database');
    await destClient.connect();
    logger.log('[REG TRACKER] Connected to destination database');

    // Join UserTenantMapping with UserRolesMapping to get complete registration data
    const query = `
      SELECT 
        utm."userId",
        utm."tenantId",
        utm."createdAt" AS tenant_regn_date,
        urm."roleId",
        urm."createdAt" AS role_assigned_date
      FROM public."UserTenantMapping" utm
      INNER JOIN public."UserRolesMapping" urm 
        ON utm."userId" = urm."userId" 
        AND utm."tenantId" = urm."tenantId"
      WHERE utm."userId" IS NOT NULL 
        AND utm."tenantId" IS NOT NULL
        AND urm."roleId" IS NOT NULL
    `;

    const res = await sourceClient.query(query);
    logger.log(`[REG TRACKER] Found ${res.rows.length} registration records.`);
    let processed = 0;
    for (const row of res.rows) {
      await upsertRegistrationTracker(destClient, row);
      processed += 1;
      logger.log(`[REG TRACKER] Processed ${processed}/${res.rows.length} - User: ${row.userId}, Role: ${row.roleId}, Tenant: ${row.tenantId}`);
      // For testing one item, uncomment below
      // break;
    }

    logger.log(`[REG TRACKER] ✅ REGISTRATION DATA UPDATED SUCCESSFULLY! Processed ${processed} records`);
  } catch (err) {
    logger.error('[REG TRACKER] Critical error: ' + err.message);
    logger.error(err.stack);
  } finally {
    await sourceClient.end();
    await destClient.end();
    logger.log('[REG TRACKER] Disconnected from databases');
    logger.log('=== COMPLETED REGISTRATION TRACKER MIGRATION ===');
    logger.close();
  }
}

async function upsertRegistrationTracker(destClient, row) {
  try {
    const userId = row.userId;
    const roleId = row.roleId;
    const tenantId = row.tenantId;

    if (!userId || !roleId || !tenantId) {
      logger.warn(`[REG TRACKER] Skipping row due to missing required fields - userId: ${userId}, roleId: ${roleId}, tenantId: ${tenantId}`);
      return;
    }

    // Use the earliest date as platform registration date (could be tenant or role assignment)
    const platformRegnDate = row.tenant_regn_date || row.role_assigned_date || null;
    const tenantRegnDate = row.tenant_regn_date || null;
    const isActive = true; // Default to active

    // Check if record exists based on (UserID, RoleID, TenantID)
    const existing = await destClient.query(
      'SELECT "REGID" FROM public."RegistrationTracker" WHERE "UserID"=$1 AND "RoleID"=$2 AND "TenantID"=$3 LIMIT 1',
      [userId, roleId, tenantId]
    );

    if (existing.rows.length > 0) {
      // Update existing record
      const updateSql = `
        UPDATE public."RegistrationTracker"
        SET "PlatformRegnDate"=$4,
            "TenantRegnDate"=$5,
            "IsActive"=$6
        WHERE "UserID"=$1 AND "RoleID"=$2 AND "TenantID"=$3
      `;
      await destClient.query(updateSql, [userId, roleId, tenantId, platformRegnDate, tenantRegnDate, isActive]);
      logger.log(`[REG TRACKER] ✅ Updated existing record - UserID: ${userId}, RoleID: ${roleId}, TenantID: ${tenantId}`);
      return;
    }

    // Insert new record
    const insertSql = `
      INSERT INTO public."RegistrationTracker" (
        "UserID", "RoleID", "TenantID", "PlatformRegnDate", "TenantRegnDate", "IsActive"
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;
    await destClient.query(insertSql, [userId, roleId, tenantId, platformRegnDate, tenantRegnDate, isActive]);
    logger.log(`[REG TRACKER] ✅ Inserted new record - UserID: ${userId}, RoleID: ${roleId}, TenantID: ${tenantId}`);
  } catch (error) {
    logger.error(`[REG TRACKER] Error upserting registration tracker - UserID: ${row.userId}, RoleID: ${row.roleId}, TenantID: ${row.tenantId} - ${error.message}`);
    logger.error(error.stack);
  }
}

if (require.main === module) {
  logger.log('Running registration-tracker-migration.js directly');
  migrateRegistrationTracker().catch(err => {
    logger.error('RegistrationTracker migration failed with unhandled error: ' + err.message);
    logger.error(err.stack);
    logger.close();
    process.exit(1);
  });
}

module.exports = { migrateRegistrationTracker };