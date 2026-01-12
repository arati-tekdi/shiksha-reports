const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dbConfig = require('./db');

// Setup file logging
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFileName = `user-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
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

logger.log('=== Loading user-migration.js ===');
logger.log(`Log file: ${logFilePath}`);

/**
 * Mapping of fieldId (UUIDs) to column names in the centralised_report.users table
 * Based on the actual fieldId UUIDs from your database
 */
const FIELD_ID_TO_COLUMN_MAPPING = {
  // Location hierarchy fields (based on CohortSummaryReport.js)
  //'6469c3ac-8c46-49d7-852a-00f9589737c5': 'UserStateID',        // State (value: '27')
  //'b61edfc6-3787-4079-86d3-37262bf23a9e': 'UserDistrictID',     // District (value: '515') 
  //'4aab68ae-8382-43aa-a45a-e9b239319857': 'UserBlockID',        // Block (value: '7081')
  //'8e9bb321-ff99-4e2e-9269-61e863dd0c54': 'UserVillageID',      // Village (value: '648170')
  
  // User profile fields (matching exact column names from destination table DDL)
	'7b43db0a-f4c3-4c77-919f-622509ca7add':'UserPreferredModeOfLearning', 
	//'60f48fbf-d5e9-4a85-aa84-0739e727153c':'UserMotherName',
	'2914814c-2a0f-4422-aff8-6bd3b09d3069':'UserWorkDomain',
	//'f3fac0c3-bc8b-4260-8b56-1608fd31c237':'UserFatherName',
	'0dd4cf0b-b774-439a-9997-5437cd78bfcd':'UserSpouseName',
	'a8d3d878-9b92-4231-b25c-b22726985238':'UserWhatDoYouWantToBecome',
	'9a4ad601-023b-467f-bbbe-bda1885f87c7':'UserClass',
	'4b9d798d-e8f2-4ae5-b177-a57655aa5d1c':'UserPreferredLanguage',
	'7ecaa845-901a-4ac7-a136-eed087f3b85b':'UserParentPhone',
	'3a7bf305-6bac-4377-bf09-f38af866105c':'UserGuardianRelation',
	'abb7f3fe-f7fa-47be-9d28-5747dd3159f2':'UserSubjectTaught',
	'ff472647-6c40-42e6-b200-dc74b241e915':'UserMaritalStatus',
	'5a2dbb89-bbe6-4aa8-b541-93e01ab07b70':'UserGrade',
	'0be5a8c6-92e9-4b7c-ac01-345131b06118':'UserTrainingCheck',
	'4f48571b-88fd-43b9-acb3-91afda7901ac':'UserDropOutReason',
	'd119d92f-fab7-4c7d-8370-8b40b5ed23dc':'UserOwnPhoneCheck',
	'e2f1fcbc-a76a-4b51-a092-ae4823bc45fd':'UserEnrollmentNumber',
	'4fc098c5-bec5-4afc-a15d-093805b05119':'UserDesignation',
	'f93c0ac3-f827-4794-9457-441fa1057b42':'UserBoard',
	'69a9dba2-e05e-40cd-a39c-047b9b676b5c':'UserSubject',
  '935bfb34-9be7-4676-b9cc-cec1ec4c0a2c':'UserMainSubject',
  '7b214a17-5a07-4ee0-bedc-271429862d30':'UserMedium',
  
  // New field mappings added as requested
  'da594b2e-c645-4a96-af15-6e2d24587c9a':'UserPhoneType',                    // phone_type_accessible
  'a4c2dace-e052-4e78-b6ad-9ffcc035c578':'UserNumOfChildrenWorkingWith',      // number_of_children_in_your_group
  
  // JobFamily, PSU, GroupMembership mapped to proper columns
  'a736e2f0-4f9b-4249-8fe5-1ff36754dc97': 'JobFamily',                      // JOB_FAMILY
  '432eb6dd-a92b-444f-ae75-42f604ad9a18': 'PSU',                            // PSU
  '29c36dd1-315c-46d9-bf6a-f1858ae71c33': 'GroupMembership',
  '8e8ab9b7-8ce0-4e6e-bf7e-0477a80734c8': 'IsManager',
  '27589b6d-6ece-457a-8d50-d15a3db02bf6': 'EMPManager',
  '93de5cc5-9437-4ca7-95f3-3b2f31b24093': 'ERPUserID',  // EMP_GROUP / GROUP_MEMBERSHIP

  //shiksha custom fields
  '9ce5c9c0-6400-42d4-9c14-407a76a47eb0': 'UserGrade', //exists
  '679f4a27-09f9-4f78-85a0-9fe8bfd3ef18': 'UserFatherName', //exists
  'd3644b9e-e9df-4f08-ae7b-1a6b4413fedf': 'UserMotherName', //exists
  '53a44ba9-c8ed-43db-9fee-c2c81ae707b9': 'UserAccessToWhatsApp',
  '5fce49b6-cd23-44f5-b87b-4ae0cbe2e328': 'UserProgram',
  '08ab0a4e-4a72-498b-ad43-38fcb5e47586': 'UserGender',
  'cec6c953-71b6-4c53-98b8-582aaa6008b5': 'UserDateOfJoining',
  'f9f17574-4227-4ba3-a485-f8b1269ff086': 'UserTeacherID',
  'e2395f11-a53d-4fb6-ab89-eae6367156f5': 'UserCEFRLevel',
  '074643e8-8d53-4f14-956b-f7d0216f63e7': 'UserSubprograms',
  '434fcadb-8508-42a9-bbed-03be19e8dfdb': 'UserOldTeacherID',
  '4e4864d3-7049-49d0-b52a-4c9fbe7774b8': 'UserRole',
  '5cfacade-9d56-4a1e-b4e9-cc8e8c6b04c5': 'UserVillageId',
  'c3357b23-1394-48a9-afc5-7589873365ae': 'UserClusterId',
  '26c55f7f-c691-440d-8c7f-88480c72f07b': 'UserSupervisors',
  '2f7e6930-0bc2-4e69-8bd4-dde205fa5471': 'UserVillageID', //exists
  '62340eaa-40fb-48b9-ba90-dcaa78be778e': 'UserDistrictID', //exists
  '800265b1-9058-482a-94f4-726197e1dfe4': 'UserStateID',  //exists
  '1e3e76e2-7f77-4fd7-a79f-abe5c33d4d08': 'UserBlockID', //exists
  '3209e9e8-08dd-4d7f-a88f-1892d3fb7440': 'UserGender', 
  '4fa37e71-bbd6-4dd1-9523-510edf63afb7': 'UserDateOfLeaving',
  '11fe3a6b-3b32-43e4-bc50-1fc72bf5dd54': 'UserReasonForLeaving',
  '0d501559-3bb2-44ed-8e33-850f6ed22666': 'UserDepartment'
};

/**
 * Mapping of FieldName (original names) to destination column names
 * Allows mapping even if we only know the field names
 */

// Boolean destination columns we should coerce "yes/no" to true/false
const BOOLEAN_DEST_COLUMNS = new Set([
  'UserOwnPhoneCheck',
  'UserTrainingCheck',
  'IsManager',  // IsManager is likely a boolean field
]);

async function migrateUsers() {
  logger.log('=== STARTING USER MIGRATION ===');
  const sourceClient = new Client(dbConfig.source);
  const destClient = new Client(dbConfig.destination);

  try {
    await connectToDBs(sourceClient, destClient);

    // Step 1: Migrate core user data
    await migrateCoreUserData(sourceClient, destClient);
    
    // Step 2: Migrate field values to custom columns
    await migrateFieldValues(sourceClient, destClient);

    logger.log('[USER MIGRATION] User migration completed successfully');
  } catch (error) {
    logger.error('[USER MIGRATION] Error during user migration: ' + error.message);
    logger.error(error.stack);
  } finally {
    await closeDBs(sourceClient, destClient);
    logger.log('=== COMPLETED USER MIGRATION ===');
    logger.close();
  }
}

async function connectToDBs(sourceClient, destClient) {
  await sourceClient.connect();
  logger.log('[USER MIGRATION] Connected to source database');
  
  await destClient.connect();
  logger.log('[USER MIGRATION] Connected to destination database');
}

async function closeDBs(sourceClient, destClient) {
  await sourceClient.end();
  logger.log('[USER MIGRATION] Disconnected from source database');
  
  await destClient.end();
  logger.log('[USER MIGRATION] Disconnected from destination database');
}

/**
 * Gets the first value from a text array, handling various formats and data type conversion
 * @param {any} values - The values field from FieldValues table
 * @param {string} columnName - The destination column name for type conversion
 * @returns {string|boolean|number|null} - The converted value or null
 */
function getFirstValue(values, columnName = null) {
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
  
  // Handle boolean fields
  if (columnName && BOOLEAN_DEST_COLUMNS.has(columnName)) {
    const normalized = String(value).toLowerCase();
    if (['yes','true','1'].includes(normalized)) return true;
    if (['no','false','0'].includes(normalized)) return false;
    return null;
  }
  
  // Handle numeric fields for location IDs
  if (columnName && (columnName.includes('StateID') || columnName.includes('DistrictID') || columnName.includes('BlockID') || columnName.includes('VillageID'))) {
    const numValue = parseInt(value);
    return isNaN(numValue) ? null : numValue;
  }
  
  return value;
}

/**
 * Migrates core user data from source Users table to destination users table
 * @param {Client} sourceClient - The client for the source database
 * @param {Client} destClient - The client for the destination database
 */
async function migrateCoreUserData(sourceClient, destClient) {
  logger.log('[USER MIGRATION] Starting core user data migration...');
  
  // Get all users
  const usersQuery = `
    SELECT u."userId", u.username, u."name", u.email, u.mobile, u.dob, u."createdAt", u."updatedAt", u."createdBy", u."updatedBy", u.status,
           u.district, u.state, u."firstName", u."middleName", u."lastName", u.gender, u."enrollmentId"
    FROM public."Users" u;
  `;
//   const usersQuery = `
//   SELECT u."userId", u.username, u."name", u.email, u.mobile, u.dob, u."createdAt", u."updatedAt", u."createdBy", u."updatedBy", u.status,
//          u.district, u.state, u."firstName", u."middleName", u."lastName", u.gender, u."enrollmentId"
//   FROM public."Users" u
//   LEFT JOIN public."UserTenantMapping" utm ON u."userId" = utm."userId" WHERE utm."tenantId" = '914ca990-9b45-4385-a06b-05054f35d0b9';
//   ;
// `;
  
  const usersResult = await sourceClient.query(usersQuery);
  logger.log(`[USER MIGRATION] Found ${usersResult.rows.length} users to migrate.`);
  
  for (const user of usersResult.rows) {
    await processCoreUser(destClient, user);
    // After processing core user, migrate their field values
    await migrateUserFieldValues(sourceClient, destClient, user.userId);
    logger.log('[USER MIGRATION] 🛑 STOPPING AFTER ONE USER FOR TESTING');
    // break; // Stop after first user for testing
  }
  
  logger.log('[USER MIGRATION] ✅ Finished core user data migration.');
}

async function processCoreUser(destClient, user) {
  try {
    logger.log(`[USER MIGRATION] Processing core user: ${user.userId}`);
    
    const insertQuery = `
      INSERT INTO public."Users"(
        "UserID", "UserName", "UserFullName", "UserEmail", "UserDoB", "UserGender",
        "CreatedAt", "UpdatedAt", "CreatedBy", "UpdatedBy", "UserEnrollmentNumber"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT ("UserID") DO UPDATE SET
        "UserName" = EXCLUDED."UserName",
        "UserFullName" = EXCLUDED."UserFullName",
        "UserEmail" = EXCLUDED."UserEmail",
        "UserDoB" = EXCLUDED."UserDoB",
        "UserGender" = EXCLUDED."UserGender",
        "UpdatedAt" = EXCLUDED."UpdatedAt",
        "UpdatedBy" = EXCLUDED."UpdatedBy",
        "UserEnrollmentNumber" = EXCLUDED."UserEnrollmentNumber"
      RETURNING "UserID"
    `;
    
    // Map source fields to destination fields
    const fullName = `${user.firstName || ''} ${user.middleName || ''} ${user.lastName || ''}`.trim() || user.name;
    
    const values = [
      user.userId,           // UserID
      user.username,         // UserName  
      fullName,              // UserFullName (combination of firstName, middleName, lastName or fallback to name)
      user.email,            // UserEmail
      user.dob,              // UserDoB
      user.gender,           // UserGender
      user.createdAt,        // CreatedAt
      user.updatedAt,        // UpdatedAt
      user.createdBy,        // CreatedBy
      user.updatedBy,        // UpdatedBy
      user.enrollmentId      // UserEnrollmentNumber
    ];
    
    const result = await destClient.query(insertQuery, values);
    if (result.rows && result.rows.length > 0) {
      logger.log(`[USER MIGRATION] ✅ Successfully inserted/updated core user: ${result.rows[0].UserID}`);
    }
    
  } catch (error) {
    logger.error(`[USER MIGRATION] Error processing core user ${user.userId}: ${error.message}`);
    logger.error(error.stack);
  }
}

/**
 * Fetch a map of fieldId -> fieldName for a set of fieldIds
 */
async function fetchFieldNamesByIds(sourceClient, fieldIds) {
  const idArray = Array.from(new Set(fieldIds));
  if (idArray.length === 0) return {};

  // Try common table/column names
  const candidateQueries = [
    'SELECT "fieldId", "name" as "fieldName" FROM public."Fields" WHERE "fieldId" = ANY($1::uuid[])',
    'SELECT "fieldId", "fieldName" FROM public."Fields" WHERE "fieldId" = ANY($1::uuid[])',
    'SELECT "fieldId", "name" as "fieldName" FROM public."Field" WHERE "fieldId" = ANY($1::uuid[])',
  ];

  for (const sql of candidateQueries) {
    try {
      const res = await sourceClient.query(sql, [idArray]);
      if (res.rows && res.rows.length > 0) {
        const map = {};
        for (const r of res.rows) {
          if (r.fieldid && r.fieldname) {
            map[r.fieldid] = r.fieldname;
          } else if (r.fieldId && r.fieldName) {
            map[r.fieldId] = r.fieldName;
          }
        }
        if (Object.keys(map).length > 0) return map;
      }
    } catch (e) {
      // ignore and try next
    }
  }
  return {};
}

/**
 * Migrates field values for a specific user from source FieldValues table to centralised_report.users columns
 * @param {Client} sourceClient - The client for the source database
 * @param {Client} destClient - The client for the destination database
 * @param {string} userId - The specific user ID to migrate field values for
 */
async function migrateUserFieldValues(sourceClient, destClient, userId) {
  logger.log(`[USER MIGRATION] Starting field values migration for user: ${userId}...`);
  
  // Get field values for this specific user
  const fieldValuesQuery = `
    SELECT fv."itemId" as "userId", fv."fieldId", fv.value
    FROM public."FieldValues" fv
    WHERE fv."itemId" = $1;
  `;
  
  const fieldValuesResult = await sourceClient.query(fieldValuesQuery, [userId]);
  logger.log(`[USER MIGRATION] Found ${fieldValuesResult.rows.length} field value records for user ${userId}.`);
  
  if (fieldValuesResult.rows.length === 0) {
    logger.log(`[USER MIGRATION] No field values found for user ${userId}, skipping field values migration.`);
    return;
  }
  
  // Log all fieldIds found for debugging
  const allFieldIds = fieldValuesResult.rows.map(row => row.fieldId);
  logger.log(`[USER MIGRATION] All fieldIds found for user ${userId}: ${JSON.stringify(allFieldIds)}`);
  
  // Check if the new fieldIds are present
  const newFieldIds = [
    '8e8ab9b7-8ce0-4e6e-bf7e-0477a80734c8',
    '27589b6d-6ece-457a-8d50-d15a3db02bf6',
    '93de5cc5-9437-4ca7-95f3-3b2f31b24093'
  ];
  const foundNewFieldIds = allFieldIds.filter(id => 
    newFieldIds.some(newId => String(id).toLowerCase() === newId.toLowerCase())
  );
  if (foundNewFieldIds.length > 0) {
    logger.log(`[USER MIGRATION] 🎯 Found ${foundNewFieldIds.length} of the 3 new fieldIds: ${JSON.stringify(foundNewFieldIds)}`);
  } else {
    logger.log(`[USER MIGRATION] ⚠️ None of the 3 new fieldIds found in data for user ${userId}`);
  }

  // Process field values strictly by fieldId mapping
  const userFieldValues = {};
  
  for (const row of fieldValuesResult.rows) {
    const { fieldId, value } = row;
    
    // Normalize fieldId to handle case sensitivity (PostgreSQL might return lowercase UUIDs)
    const normalizedFieldId = fieldId ? String(fieldId).toLowerCase() : null;
    const originalFieldId = fieldId;
    
    // Try exact match first, then normalized (lowercase) match
    let columnName = FIELD_ID_TO_COLUMN_MAPPING[fieldId];
    if (!columnName && normalizedFieldId) {
      // Try to find by normalized (lowercase) key
      const matchingKey = Object.keys(FIELD_ID_TO_COLUMN_MAPPING).find(
        key => String(key).toLowerCase() === normalizedFieldId
      );
      if (matchingKey) {
        columnName = FIELD_ID_TO_COLUMN_MAPPING[matchingKey];
        logger.log(`[USER MIGRATION] 🔄 Matched fieldId ${originalFieldId} (normalized) to column: ${columnName}`);
      }
    }
    
    if (!columnName) {
      // Log unmapped fieldIds for debugging (especially the new ones)
      const newFieldIds = [
        '8e8ab9b7-8ce0-4e6e-bf7e-0477a80734c8',
        '27589b6d-6ece-457a-8d50-d15a3db02bf6',
        '93de5cc5-9437-4ca7-95f3-3b2f31b24093'
      ];
      const normalizedNewFieldIds = newFieldIds.map(id => id.toLowerCase());
      
      if (normalizedNewFieldIds.includes(normalizedFieldId)) {
        logger.warn(`[USER MIGRATION] ⚠️ WARNING: New fieldId ${originalFieldId} (normalized: ${normalizedFieldId}) not found in mapping!`);
        logger.log(`[USER MIGRATION] Available mapping keys (first 5): ${JSON.stringify(Object.keys(FIELD_ID_TO_COLUMN_MAPPING).slice(0, 5))}`);
      }
      continue;
    }
    
    logger.log(`[USER MIGRATION] ✅ Processing fieldId ${originalFieldId} -> ${columnName}, value: ${JSON.stringify(value)}`);
    const convertedValue = getFirstValue(value, columnName);
    logger.log(`[USER MIGRATION] Converted value for ${columnName}: ${JSON.stringify(convertedValue)}`);
    
    // Handle multiple field IDs mapping to the same column
    // Prefer non-null values - if column already has a value and new value is null, keep existing
    // If both have values, the last one processed will be used (or we could prefer non-null)
    if (userFieldValues.hasOwnProperty(columnName) && userFieldValues[columnName] !== null && convertedValue === null) {
      logger.log(`[USER MIGRATION] ⚠️ Column ${columnName} already has value ${JSON.stringify(userFieldValues[columnName])}, keeping existing value (new value is null)`);
      // Keep existing value
    } else if (userFieldValues.hasOwnProperty(columnName) && userFieldValues[columnName] !== null && convertedValue !== null) {
      logger.log(`[USER MIGRATION] ⚠️ Multiple field IDs map to ${columnName}: existing=${JSON.stringify(userFieldValues[columnName])}, new=${JSON.stringify(convertedValue)}, using new value`);
      userFieldValues[columnName] = convertedValue;
    } else {
      // First value or replacing null with non-null
      userFieldValues[columnName] = convertedValue;
    }
  }
  
  // Update this user's record in the destination database
  if (Object.keys(userFieldValues).length > 0) {
    logger.log(`[USER MIGRATION] 📊 Summary for user ${userId}: Migrating ${Object.keys(userFieldValues).length} fields: ${JSON.stringify(Object.keys(userFieldValues))}`);
    // Check if the new fields are in the migration
    const newFieldColumns = ['IsManager', 'EMPManager', 'ERPUserID'];
    const migratedNewFields = Object.keys(userFieldValues).filter(col => newFieldColumns.includes(col));
    if (migratedNewFields.length > 0) {
      logger.log(`[USER MIGRATION] ✅ Successfully mapped new fields: ${JSON.stringify(migratedNewFields)}`);
    } else {
      logger.log(`[USER MIGRATION] ⚠️ New fields (IsManager, EMPManager, ERPUserID) not in migration for user ${userId}`);
    }
    await processUser(destClient, userId, userFieldValues);
  } else {
    logger.log(`[USER MIGRATION] No mappable field values found for user ${userId}.`);
  }
}

/**
 * Migrates field values from source FieldValues table to centralised_report.users columns
 * @param {Client} sourceClient - The client for the source database
 * @param {Client} destClient - The client for the destination database
 */
async function migrateFieldValues(sourceClient, destClient) {
  logger.log('[USER MIGRATION] Field values migration will be handled per user during core user processing.');
}

async function processUser(destClient, userId, fieldData) {
  try {
    if (Object.keys(fieldData).length === 0) {
      return; // Skip if no mapped fields for this user
    }
    
    logger.log(`[USER MIGRATION] Processing user: ${userId}`);
    
    // Build dynamic UPDATE query
    const setClause = [];
    const values = [userId]; // userId is always the first parameter
    let paramIndex = 2;
    
    for (const [columnName, value] of Object.entries(fieldData)) {
      setClause.push(`"${columnName}" = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
    
    const updateQuery = `
      UPDATE public."Users" 
      SET ${setClause.join(', ')}
      WHERE "UserID" = $1
    `;

    const result = await destClient.query(updateQuery, values);
    if (result.rowCount > 0) {
      logger.log(`[USER MIGRATION] ✅ Updated user ${userId} with ${Object.keys(fieldData).length} field values`);
    } else {
      logger.warn(`[USER MIGRATION] ⚠️ No user found with UserID: ${userId} in destination database`);
    }
    
    logger.log(`[USER MIGRATION] Completed processing user: ${userId}`);
  } catch (error) {
    logger.error(`[USER MIGRATION] Error processing user ${userId}: ${error.message}`);
    logger.error(error.stack);
  }
}

/**
 * NOTE: insertUserMeta function removed
 * JobFamily, PSU, and GroupMembership are now stored in proper columns 
 * (JobFamily, PSU, GroupMembership) instead of UserCustomField column.
 * See migrateUserFieldValues function for the implementation.
 */

// Run the migration only if this script is run directly (not imported)
if (require.main === module) {
  logger.log('Running user-migration.js directly');
  migrateUsers().catch(err => {
    logger.error('User migration failed: ' + err.message);
    logger.error(err.stack);
    logger.close();
    process.exit(1);
  });
} else {
  logger.log('user-migration.js loaded as a module');
}

module.exports = {
  migrateUsers
};