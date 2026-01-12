const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dbConfig = require('./db');

// Setup file logging
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFileName = `cohort-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
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

logger.log('=== Loading cohort-migration.js ===');
logger.log(`Log file: ${logFilePath}`);

/*
 * TYPE TRANSFORMATION LOGIC:
 * 
 * Parent Cohorts (no ParentID):
 *   - 'regular' → 'regularCenter'
 *   - 'remote'  → 'remoteCenter'
 * 
 * Child Cohorts (have ParentID):
 *   - Look up parent's Type from SOURCE database FieldValues table using fieldId '000a7469-2721-4c7b-8180-52812a0f6fe7'
 *   - If parent type is 'regular' → child becomes 'regularBatch'
 *   - If parent type is 'remote'  → child becomes 'remoteBatch'
 * 
 * This replaces the database-side UPDATE logic with script-side transformation
 * and uses source database lookup for parent types.
 */

// Mapping of FieldValues.fieldId (UUIDs) to destination Cohort columns
const COHORT_FIELD_ID_TO_COLUMN = {
  // From your mapping list
  '000a7469-2721-4c7b-8180-52812a0f6fe7': 'Type',            // center_type => Type
 // '6469c3ac-8c46-49d7-852a-00f9589737c5': 'CoStateID',       // state => CoStateID
 // 'b61edfc6-3787-4079-86d3-37262bf23a9e': 'CoDistrictID',    // district => CoDistrictID
 // '4aab68ae-8382-43aa-a45a-e9b239319857': 'CoBlockID',       // block => CoBlockID
 // '8e9bb321-ff99-4e2e-9269-61e863dd0c54': 'CoVillageID',     // village => CoVillageID
  'f93c0ac3-f827-4794-9457-441fa1057b42': 'CoBoard',         // board => CoBoard
  '69a9dba2-e05e-40cd-a39c-047b9b676b5c': 'CoSubject',       // subject => CoSubject
  '5a2dbb89-bbe6-4aa8-b541-93e01ab07b70': 'CoGrade',         // grade => CoGrade
  '7b214a17-5a07-4ee0-bedc-271429862d30': 'CoMedium',        // medium => CoMedium
  'e5277d7b-e7ef-4a11-9a54-a8e6e7975383': 'CoIndustry',      // industry => CoIndustry
  'e9f8acbb-b10d-4b46-9584-f5ec453c250e': 'CoGoogleMapLink', // google_map_link => CoGoogleMapLink


  //shiksha custom fields
  '5fce49b6-cd23-44f5-b87b-4ae0cbe2e328': 'CoProgram',
  'c3357b23-1394-48a9-afc5-7589873365ae': 'CoCluster',
  'fe466e4e-193b-4d01-863d-cf861d8d5bf5': 'CoLongitude',
  'fd466e4e-193b-4d01-863d-cf861d8d5bf4': 'CoLatitude',
  'c4ad6f2a-f4b3-4f66-b1be-fcbe8ff607e3': 'CoSchoolType',
  // Multiple field IDs mapping to same location columns
  'd4ad6f2a-f4b3-4f66-b1be-fcbe8ff607f3': 'CoDistrictID', // district
  '62340eaa-40fb-48b9-ba90-dcaa78be778e': 'CoDistrictID', // district (duplicate)
  'b4ad6f2a-f4b3-4f66-b1be-fcbe8ff607e3': 'CoStateID', // state
  '800265b1-9058-482a-94f4-726197e1dfe4': 'CoStateID', // state (duplicate)
  'e4bc6f2a-f4b3-4f66-b1be-fcbe8ff607f3': 'CoBlockID', // block1
  '1e3e76e2-7f77-4fd7-a79f-abe5c33d4d08': 'CoBlockID', // block (duplicate)
  'e4de6f2a-f4b3-4f66-b1be-fcbe8ff607d3': 'CoVillageID', // village1
  '2f7e6930-0bc2-4e69-8bd4-dde205fa5471': 'CoVillageID', // village (duplicate)
};

// Temporary code->UUID mappings for the test cohort (replace with table lookups later)
const LOCATION_CODE_TO_UUID = {
  '6469c3ac-8c46-49d7-852a-00f9589737c5': { // state
    '24': 'cc737326-7d1f-4f4e-88cf-39f48df2c280',
  },
  'b61edfc6-3787-4079-86d3-37262bf23a9e': { // district
    '473': 'c168bb3c-4c2d-4321-b1b7-4c1c19dc54e7',
  },
  '4aab68ae-8382-43aa-a45a-e9b239319857': { // block
    '3613': '359e1a0a-d7c8-4e03-b022-938f0f6f7f83',
  },
  '8e9bb321-ff99-4e2e-9269-61e863dd0c54': { // village
    '737311': '8eb4f5c2-c0b9-4191-94e3-14c738246f82',
  },
};

const UUID_COLUMN_SET = new Set(['CoStateID','CoDistrictID','CoBlockID','CoVillageID']);
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstOrSelf(val) {
  if (val == null) return null;
  if (Array.isArray(val)) return val.length ? val[0] : null;
  return val;
}

function tryParseJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function getDigits(str) {
  return String(str).replace(/[^0-9]/g, '');
}

function extractUuidFromValueOrCode(raw, fieldId) {
  let v = firstOrSelf(raw);
  if (v == null) return null;

  // If numeric code, try code->uuid map
  const code = getDigits(v);
  if (code) {
    const map = LOCATION_CODE_TO_UUID[fieldId];
    if (map && map[code]) return map[code];
  }

  // Direct UUID string or JSON/object containing id
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (uuidRegex.test(trimmed)) return trimmed;
    const obj = tryParseJson(trimmed);
    if (obj && typeof obj === 'object') {
      const candidate = obj.id || obj.uuid || obj.value || obj.identifier;
      if (typeof candidate === 'string' && uuidRegex.test(candidate)) return candidate;
    }
    return null;
  }
  if (typeof v === 'object') {
    const candidate = v.id || v.uuid || v.value || v.identifier;
    if (typeof candidate === 'string' && uuidRegex.test(candidate)) return candidate;
    return null;
  }
  return null;
}

function coerceValueForColumn(rawValue, columnName, fieldId) {
  const v = firstOrSelf(rawValue);
  if (v == null) return null;

  // For location columns, store numeric code (destination expects numeric)
  if (UUID_COLUMN_SET.has(columnName)) {
    const digits = getDigits(v);
    const num = digits ? parseInt(digits, 10) : null;
    if (num == null || Number.isNaN(num)) {
      logger.log(`[COHORT MIGRATION][DEBUG] Could not resolve numeric code for ${columnName} from value: ${JSON.stringify(v)}`);
      return null;
    }
    return num;
  }

  if (typeof v === 'string') return v.trim();
  return v;
}

/**
 * Transform cohort Type value based on parent-child relationship
 * @param {string} originalType - The original type value from source
 * @param {boolean} hasParent - Whether this cohort has a parent
 * @param {string|null} parentType - The parent's type (for child cohorts)
 * @returns {string} - The transformed type value
 */
function transformCohortType(originalType, hasParent, parentType = null) {
  if (!originalType) return originalType;
  
  const type = originalType.toLowerCase().trim();
  
  if (!hasParent) {
    // Parent cohort (Center) transformation
    switch (type) {
      case 'regular':
        logger.log(`[COHORT MIGRATION] Transforming center type: ${originalType} -> regularCenter`);
        return 'regularCenter';
      case 'remote':
        logger.log(`[COHORT MIGRATION] Transforming center type: ${originalType} -> remoteCenter`);
        return 'remoteCenter';
      default:
        return originalType; // Keep original if not regular/remote
    }
  } else {
    // Child cohort (Batch) transformation - ignore original type, use parent type to determine batch type
    if (parentType) {
      const normalizedParentType = parentType.toLowerCase().trim();
      switch (normalizedParentType) {
        case 'regular':
          logger.log(`[COHORT MIGRATION] Child cohort becomes regularBatch based on parent type: ${normalizedParentType}`);
          return 'regularBatch';
        case 'remote':
          logger.log(`[COHORT MIGRATION] Child cohort becomes remoteBatch based on parent type: ${normalizedParentType}`);
          return 'remoteBatch';
        default:
          logger.log(`[COHORT MIGRATION] Parent type '${parentType}' not recognized, keeping original child type: ${originalType}`);
          return originalType; // Keep original if parent type is not recognized
      }
    } else {
      logger.log(`[COHORT MIGRATION] No parent type found for child cohort, keeping original type: ${originalType}`);
      return originalType; // Keep original if no parent type available
    }
  }
}

/**
 * Look up parent cohort's Type from source database using FieldValues table
 * @param {Client} sourceClient - Source database client
 * @param {string} parentId - Parent cohort ID
 * @returns {string|null} - Parent cohort's Type or null if not found
 */
async function lookupParentCohortTypeFromSource(sourceClient, parentId) {
  if (!parentId) {
    logger.log(`[COHORT MIGRATION] No parentId provided for lookup`);
    return null;
  }
  
  try {
    logger.log(`[COHORT MIGRATION] Looking up parent cohort type for parentId: ${parentId}`);
    
    // First verify the parent cohort exists in source
    const cohortQuery = `SELECT "cohortId" FROM public."Cohort" WHERE "cohortId" = $1`;
    const cohortResult = await sourceClient.query(cohortQuery, [parentId]);
    
    if (!cohortResult.rows || cohortResult.rows.length === 0) {
      logger.log(`[COHORT MIGRATION] Parent cohort ${parentId} not found in source Cohort table`);
      return null;
    }
    
    logger.log(`[COHORT MIGRATION] Parent cohort ${parentId} found in source, looking up FieldValues...`);

    // Look up parent's Type from FieldValues table using the Type fieldId
    const typeFieldId = '000a7469-2721-4c7b-8180-52812a0f6fe7';
    const fieldValuesQuery = `
      SELECT fv.value
      FROM public."FieldValues" fv
      WHERE fv."itemId" = $1 AND fv."fieldId" = $2
    `;
    
    const result = await sourceClient.query(fieldValuesQuery, [parentId, typeFieldId]);
    
    if (result.rows && result.rows.length > 0) {
      const rawValue = result.rows[0].value;
      logger.log(`[COHORT MIGRATION] Raw parent type value from FieldValues: ${JSON.stringify(rawValue)} (type: ${typeof rawValue})`);
      
      // Handle text[] array - extract first value
      const parentType = firstOrSelf(rawValue);
      logger.log(`[COHORT MIGRATION] Extracted parent type: ${parentType}`);
      
      return parentType ? parentType.toString().trim() : null;
    }
    
    logger.log(`[COHORT MIGRATION] No Type field value found in FieldValues for parent cohort ${parentId} with fieldId ${typeFieldId}`);
    return null;
  } catch (error) {
    logger.error(`[COHORT MIGRATION] Error looking up parent cohort type from source for ${parentId}: ${error.message}`);
    logger.error(error.stack);
    return null;
  }
}

async function migrateCohorts() {
  logger.log('=== STARTING COHORT MIGRATION ===');
  const sourceClient = new Client(dbConfig.source);
  const destClient = new Client(dbConfig.destination);

  try {
    await sourceClient.connect();
    logger.log('[COHORT MIGRATION] Connected to source database');
    await destClient.connect();
    logger.log('[COHORT MIGRATION] Connected to destination database');

    // Fetch core cohort rows from source
    const srcQuery = `
      SELECT c."cohortId", c."tenantId", c."name", c."createdAt", c."parentId"
      FROM public."Cohort" c
    `;
    const result = await sourceClient.query(srcQuery);
    logger.log(`[COHORT MIGRATION] Found ${result.rows.length} cohorts to migrate.`);

    for (const cohort of result.rows) {
      await upsertCoreCohort(destClient, cohort);
      await upsertCohortFieldValues(sourceClient, destClient, cohort.cohortId);
    //   logger.log('[COHORT MIGRATION] 🛑 Stopping after one cohort for testing');
    //   break;
    }

    logger.log('[COHORT MIGRATION] All cohorts processed.');
  } catch (err) {
    logger.error('[COHORT MIGRATION] Critical error: ' + err.message);
    logger.error(err.stack);
  } finally {
    await sourceClient.end();
    await destClient.end();
    logger.log('[COHORT MIGRATION] Disconnected from databases');
    logger.log('=== COMPLETED COHORT MIGRATION ===');
    logger.close();
  }
}

async function upsertCoreCohort(destClient, cohort) {
  // ParentID in destination is uuid. Source parentId is varchar; only set if valid uuid
  const parentId = (() => {
    const v = cohort.parentId;
    if (!v) return null;
    return uuidRegex.test(String(v)) ? v : null;
  })();

  const insert = `
    INSERT INTO public."Cohort" (
      "CohortID", "TenantID", "CohortName", "CreatedOn", "ParentID"
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT ("CohortID") DO UPDATE SET
      "TenantID" = EXCLUDED."TenantID",
      "CohortName" = EXCLUDED."CohortName",
      "CreatedOn" = EXCLUDED."CreatedOn",
      "ParentID" = EXCLUDED."ParentID"
  `;

  const values = [
    cohort.cohortId,
    cohort.tenantId || null,
    cohort.name || null,
    cohort.createdAt || null,
    parentId,
  ];

  await destClient.query(insert, values);
  logger.log(`[COHORT MIGRATION] Core upsert done for CohortID=${cohort.cohortId}`);
}

async function upsertCohortFieldValues(sourceClient, destClient, cohortId) {
  logger.log(`[COHORT MIGRATION] Starting field values migration for cohort: ${cohortId}`);
  
  // Get cohort parent information from SOURCE database first
  const cohortQuery = `SELECT "parentId" FROM public."Cohort" WHERE "cohortId" = $1`;
  const cohortRes = await sourceClient.query(cohortQuery, [cohortId]);
  const parentId = cohortRes.rows.length > 0 ? cohortRes.rows[0].parentId : null;
  const hasParent = !!parentId;

  logger.log(`[COHORT MIGRATION] Cohort ${cohortId} hasParent: ${hasParent}, parentId: ${parentId}`);

  // Look up parent type from SOURCE database if this is a child cohort
  let parentType = null;
  if (hasParent) {
    parentType = await lookupParentCohortTypeFromSource(sourceClient, parentId);
    logger.log(`[COHORT MIGRATION] Child cohort ${cohortId} has parent ${parentId} with type: ${parentType}`);
  }

  // Fetch FieldValues for this cohort
  const fvQuery = `
    SELECT fv."fieldId", fv.value
    FROM public."FieldValues" fv
    WHERE fv."itemId" = $1
  `;
  const fvRes = await sourceClient.query(fvQuery, [cohortId]);
  logger.log(`[COHORT MIGRATION] Found ${fvRes.rows.length} field values for cohort ${cohortId}`);
  
  const updates = {};
  let hasTypeField = false;
  
  for (const row of fvRes.rows) {
    const fieldId = row.fieldId;
    const columnName = COHORT_FIELD_ID_TO_COLUMN[fieldId];
    if (!columnName) continue;

    let coerced = coerceValueForColumn(row.value, columnName, fieldId);
    
    // Apply Type transformation if this is the Type column
    if (columnName === 'Type') {
      hasTypeField = true;
      const originalValue = coerced;
      coerced = transformCohortType(coerced, hasParent, parentType);
      logger.log(`[COHORT MIGRATION] Type transformation for cohort ${cohortId}: ${originalValue} -> ${coerced} (hasParent: ${hasParent}, parentType: ${parentType})`);
    }
    
    updates[columnName] = coerced;
    logger.log(`[COHORT MIGRATION][DEBUG] fieldId=${fieldId} -> ${columnName} = ${JSON.stringify(coerced)}`);
  }

  // For child cohorts (batches), if no Type field was found but we have parent type, still apply transformation
  if (hasParent && !hasTypeField && parentType) {
    const batchType = transformCohortType('', hasParent, parentType);
    if (batchType && batchType !== '') {
      updates['Type'] = batchType;
      logger.log(`[COHORT MIGRATION] No Type field found for child cohort ${cohortId}, but applying batch type based on parent: ${batchType}`);
    }
  }

  if (Object.keys(updates).length === 0) {
    logger.log(`[COHORT MIGRATION] No updates to apply for cohort ${cohortId}`);
    return;
  }

  // Build dynamic UPDATE
  const setFragments = [];
  const params = [cohortId];
  let idx = 2;
  for (const [col, val] of Object.entries(updates)) {
    setFragments.push(`"${col}" = $${idx}`);
    params.push(val);
    idx += 1;
  }

  const updateSql = `
    UPDATE public."Cohort"
    SET ${setFragments.join(', ')}
    WHERE "CohortID" = $1
  `;

  await destClient.query(updateSql, params);
  logger.log(`[COHORT MIGRATION] Field values updated for CohortID=${cohortId} with updates: ${JSON.stringify(Object.keys(updates))}`);
}

if (require.main === module) {
  logger.log('Running cohort-migration.js directly');
  migrateCohorts().catch(err => {
    logger.error('Cohort migration failed with unhandled error: ' + err.message);
    logger.error(err.stack);
    logger.close();
    process.exit(1);
  });
}

module.exports = { migrateCohorts };


// for batch type update run this query
// UPDATE "Cohort" AS child
// SET "Type" = CASE
//     WHEN parent."Type" = 'regularCenter' THEN 'regularBatch'
//     WHEN parent."Type" = 'remoteCenter'  THEN 'remoteBatch'
//     ELSE child."Type"
// END
// FROM "Cohort" AS parent
// WHERE child."ParentID" = parent."CohortID";