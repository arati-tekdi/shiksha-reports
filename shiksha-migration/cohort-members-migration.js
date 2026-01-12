const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dbConfig = require('./db');

// Setup file logging
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFileName = `cohort-members-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
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

logger.log('=== Loading cohort-members-migration.js ===');
logger.log(`Log file: ${logFilePath}`);

async function migrateCohortMembers() {
  logger.log('=== STARTING COHORT MEMBERS MIGRATION ===');
  const sourceClient = new Client(dbConfig.source);
  const destClient = new Client(dbConfig.destination);

  try {
    await sourceClient.connect();
    logger.log('[COHORT MEMBERS] Connected to source database');
    await destClient.connect();
    logger.log('[COHORT MEMBERS] Connected to destination database');

    const query = `
      SELECT 
        cm."cohortMembershipId",
        cm."cohortId",
        cm."userId",
        cm.status,
        cm."cohortAcademicYearId",
        cay."academicYearId"
      FROM public."CohortMembers" cm
      LEFT JOIN public."CohortAcademicYear" cay
        ON cm."cohortAcademicYearId" = cay."cohortAcademicYearId"
    `;

    const res = await sourceClient.query(query);
    logger.log(`[COHORT MEMBERS] Found ${res.rows.length} cohort member records to migrate.`);

    for (const row of res.rows) {
      await upsertCohortMember(sourceClient, destClient, row);
      logger.log('[COHORT MEMBERS] 🛑 Stopping after one record for testing');
      // break;
      // Uncomment to test single record
      // logger.log('[COHORT MEMBERS] 🛑 Stopping after one record for testing');
      // break;
    }

    logger.log('[COHORT MEMBERS] Migration completed successfully');
  } catch (err) {
    logger.error('[COHORT MEMBERS] Critical error: ' + err.message);
    logger.error(err.stack);
  } finally {
    await sourceClient.end();
    await destClient.end();
    logger.log('[COHORT MEMBERS] Disconnected from databases');
    logger.log('=== COMPLETED COHORT MEMBERS MIGRATION ===');
    logger.close();
  }
}

/**
 * Gets the first value from a text array, handling various formats
 * @param {any} values - The values field from FieldValues table
 * @returns {string|number|null} - The converted value or null
 */
function getFirstValue(values) {
  if (!values) return null;
  
  let value;
  // If it's already a string, use it
  if (typeof values === 'string') {
    value = values;
  }
  // If it's an array, get the first element
  else if (Array.isArray(values) && values.length > 0) {
    value = values[0];
  } else {
    return null;
  }
  
  return value;
}

async function upsertCohortMember(sourceClient, destClient, row) {
  try {
    // Fetch field value for slots before inserting
    const slotsFieldId = 'f3658b23-1394-48a9-afc5-7589874465af';
    let slotValue = null;
    
    try {
      const fieldValuesQuery = `
        SELECT fv.value
        FROM public."FieldValues" fv
        WHERE fv."itemId" = $1 AND fv."fieldId" = $2
      `;
      
      const fieldValuesResult = await sourceClient.query(fieldValuesQuery, [row.cohortMembershipId, slotsFieldId]);
      
      if (fieldValuesResult.rows && fieldValuesResult.rows.length > 0) {
        slotValue = getFirstValue(fieldValuesResult.rows[0].value);
        logger.log(`[COHORT MEMBERS] Found slot value for CohortMemberID=${row.cohortMembershipId}: ${slotValue}`);
      } else {
        logger.log(`[COHORT MEMBERS] No slot field value found for CohortMemberID=${row.cohortMembershipId}`);
      }
    } catch (e) {
      logger.error(`[COHORT MEMBERS] Error fetching slot field value for CohortMemberID=${row.cohortMembershipId}: ${e.message}`);
      // Continue with null slot value
    }
    
    const insert = `
      INSERT INTO public."CohortMember" (
        "CohortMemberID", "CohortID", "UserID", "MemberStatus", "AcademicYearID", "Slot"
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT ("CohortMemberID") DO UPDATE SET
        "CohortID" = EXCLUDED."CohortID",
        "UserID" = EXCLUDED."UserID",
        "MemberStatus" = EXCLUDED."MemberStatus",
        "AcademicYearID" = EXCLUDED."AcademicYearID",
        "Slot" = EXCLUDED."Slot"
    `;

    const values = [
      row.cohortMembershipId,
      row.cohortId,
      row.userId,
      row.status || null,
      row.academicYearId || null,
      slotValue,
    ];

    await destClient.query(insert, values);
    logger.log(`[COHORT MEMBERS] ✅ Upserted CohortMemberID=${row.cohortMembershipId} with Slot=${slotValue}`);
    
  } catch (e) {
    logger.error(`[COHORT MEMBERS] Error upserting CohortMemberID=${row.cohortMembershipId}: ${e.message}`);
    logger.error(e.stack);
  }
}


if (require.main === module) {
  logger.log('Running cohort-members-migration.js directly');
  migrateCohortMembers().catch(err => {
    logger.error('CohortMembers migration failed with unhandled error: ' + err.message);
    logger.error(err.stack);
    logger.close();
    process.exit(1);
  });
}

module.exports = { migrateCohortMembers };