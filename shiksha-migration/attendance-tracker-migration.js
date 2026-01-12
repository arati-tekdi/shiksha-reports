const { Client } = require('pg');
const dbConfig = require('./db');

console.log('=== Loading attendance-tracker-migration.js ===');

function pad2(n) {
  return String(n).padStart(2, '0');
}

async function migrateAttendanceTracker() {
  const startTime = Date.now();
  console.log('=== STARTING ATTENDANCE TRACKER MIGRATION ===');
  const sourceClient = new Client(dbConfig.attendance_source); // Using same source as assessment
  const destClient = new Client(dbConfig.attendance_destination); // Using same destination as assessment

  try {
    console.log('[ATND] Attempting to connect to source database...');
    await sourceClient.connect();
    console.log('[ATND] ✓ Connected to source database');
    
    console.log('[ATND] Attempting to connect to destination database...');
    await destClient.connect();
    console.log('[ATND] ✓ Connected to destination database');

    // Pull all attendance rows with precomputed year, month, day
    console.log('[ATND] Querying source database for attendance records...');
    const queryStartTime = Date.now();
    const res = await sourceClient.query(`
      SELECT 
        a."attendanceDate"::date AS attendance_date,
        EXTRACT(YEAR FROM a."attendanceDate")::int AS year_num,
        EXTRACT(MONTH FROM a."attendanceDate")::int AS month_num,
        TO_CHAR(a."attendanceDate", 'DD') AS day_str,
        a.attendance,
        a."userId",
        a."tenantId",
        a."contextId",
        a.context,
        a.remark,
        a.latitude,
        a.longitude,
        a.scope,
        a."lateMark",
        a."absentReason",
        a."validLocation",
        a."metaData"
      FROM public."Attendance" a
      WHERE a."attendanceDate" IS NOT NULL 
        AND a."userId" IS NOT NULL
    `);
    const queryDuration = Date.now() - queryStartTime;
    console.log(`[ATND] ✓ Fetched ${res.rows.length} rows in ${queryDuration}ms`);

    // Group by (tenantId, context, contextId, userId, Year, Month)
    console.log('[ATND] Grouping attendance records by (tenantId, context, contextId, userId, year, month)...');
    const groupingStartTime = Date.now();
    const groups = new Map();
    let skippedRows = 0;
    for (const r of res.rows) {
      const year = r.year_num;
      const month = r.month_num;
      const dayCol = r.day_str; // already zero-padded ('01'-'31')
      if (!year || !month || !dayCol) {
        skippedRows++;
        continue;
      }
      const key = [r.tenantId || '', r.context || '', r.contextId || '', r.userId || '', year, month].join('|');
      if (!groups.has(key)) {
        groups.set(key, {
          tenantId: r.tenantId || null,
          context: r.context || null,
          contextId: r.contextId || null,
          userId: r.userId,
          year,
          month,
          days: {}
        });
      }
      const g = groups.get(key);
      
      // Parse metaData if it's a string, otherwise use it directly
      let metaDataObj = {};
      if (r.metaData) {
        try {
          metaDataObj = typeof r.metaData === 'string' ? JSON.parse(r.metaData) : r.metaData;
        } catch (parseError) {
          console.log(`[ATND] Warning: Failed to parse metaData for day ${dayCol}, using empty object. Error:`, parseError.message);
          metaDataObj = {};
        }
      }
      
      // Create main object with all fields, spreading metaData
      const attendanceData = {
        attendance: r.attendance || null,
        remark: r.remark || null,
        latitude: r.latitude || null,
        longitude: r.longitude || null,
        scope: r.scope || null,
        lateMark: r.lateMark || null,
        absentReason: r.absentReason || null,
        validLocation: r.validLocation || null,
        ...metaDataObj  // Spread metaData keys into main object
      };
      
      // Store as JSON object in days
      g.days[dayCol] = attendanceData;
    }
    const groupingDuration = Date.now() - groupingStartTime;
    console.log(`[ATND] ✓ Grouped into ${groups.size} unique groups in ${groupingDuration}ms`);
    if (skippedRows > 0) {
      console.log(`[ATND] ⚠ Skipped ${skippedRows} rows due to missing year/month/day data`);
    }
    if (groups.size === 0 && res.rows.length > 0) {
      console.log('[ATND] ⚠ Warning: No groups created but rows were fetched. Sample row for debugging:', res.rows[0]);
    }

    console.log(`[ATND] Starting upsert process for ${groups.size} groups...`);
    const upsertStartTime = Date.now();
    let processed = 0;
    let updated = 0;
    let inserted = 0;
    for (const [, g] of groups) {
      const result = await upsertOne(destClient, g);
      if (result === 'updated') {
        updated++;
      } else if (result === 'inserted') {
        inserted++;
      }
      processed += 1;
      if (processed % 100 === 0) {
        console.log(`[ATND] Progress: ${processed}/${groups.size} groups processed (${updated} updated, ${inserted} inserted)`);
      }
      // For single-record testing, uncomment:
      // console.log('[ATND] 🛑 Stopping after one group for testing');
      // break;
    }
    const upsertDuration = Date.now() - upsertStartTime;
    const totalDuration = Date.now() - startTime;
    console.log(`[ATND] ✓ Upsert completed in ${upsertDuration}ms`);
    console.log(`[ATND] Summary: ${processed} groups processed (${updated} updated, ${inserted} inserted)`);
    console.log(`[ATND] === MIGRATION COMPLETED IN ${totalDuration}ms ===`);
  } catch (e) {
    console.error('[ATND] ✗ Fatal error occurred:', e);
    console.error('[ATND] Error stack:', e.stack);
    throw e;
  } finally {
    console.log('[ATND] Closing database connections...');
    await sourceClient.end();
    console.log('[ATND] ✓ Source connection closed');
    await destClient.end();
    console.log('[ATND] ✓ Destination connection closed');
    console.log('[ATND] All connections closed');
  }
}

// Update-if-exists (by natural key), else insert
async function upsertOne(client, g) {
  const keyParams = [g.tenantId, g.context, g.contextId, g.userId, g.year, g.month];
  const dayCount = Object.keys(g.days).length;

  // Build dynamic SET for update with provided day columns only
  // Convert JSON objects to JSON strings for database storage
  const setFrags = [];
  const setVals = [];
  Object.entries(g.days).forEach(([col, val], idx) => {
    setFrags.push(`"${col}" = $${idx + 1}::jsonb`);
    // Convert object to JSON string if it's an object, otherwise use as is
    const jsonVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
    setVals.push(jsonVal);
  });

  if (setFrags.length > 0) {
    try {
      const updateSql = `
        UPDATE public."AttendanceTracker"
        SET ${setFrags.join(', ')}
        WHERE "TenantID" = $${setVals.length + 1}
          AND "Context" = $${setVals.length + 2}
          AND "ContextID" = $${setVals.length + 3}
          AND "UserID" = $${setVals.length + 4}
          AND "Year" = $${setVals.length + 5}
          AND "Month" = $${setVals.length + 6}
      `;
      const updParams = [...setVals, ...keyParams];
      const updRes = await client.query(updateSql, updParams);
      if (updRes.rowCount > 0) {
        // Updated successfully
        return 'updated';
      }
    } catch (updateError) {
      console.error(`[ATND] Error updating group (tenantId: ${g.tenantId}, userId: ${g.userId}, year: ${g.year}, month: ${g.month}):`, updateError);
      throw updateError;
    }
  }

  // Need to insert
  try {
    const dayCols = Object.keys(g.days).sort();
    const cols = ['"TenantID"', '"Context"', '"ContextID"', '"UserID"', '"Year"', '"Month"', ...dayCols.map(c => `"${c}"`)];
    // Convert JSON objects to JSON strings for database storage
    const vals = [
      g.tenantId, 
      g.context, 
      g.contextId, 
      g.userId, 
      g.year, 
      g.month, 
      ...dayCols.map(c => {
        const val = g.days[c];
        return typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
      })
    ];
    const placeholders = vals.map((_, i) => {
      // Use ::jsonb cast for day columns (indices 6 onwards)
      if (i >= 6) {
        return `$${i + 1}::jsonb`;
      }
      return `$${i + 1}`;
    });

    const insertSql = `
      INSERT INTO public."AttendanceTracker" (${cols.join(', ')})
      VALUES (${placeholders.join(', ')})
    `;
    await client.query(insertSql, vals);
    return 'inserted';
  } catch (insertError) {
    console.error(`[ATND] Error inserting group (tenantId: ${g.tenantId}, userId: ${g.userId}, year: ${g.year}, month: ${g.month}):`, insertError);
    throw insertError;
  }
}

if (require.main === module) {
  console.log('Running attendance-tracker-migration.js directly');
  migrateAttendanceTracker().catch(err => {
    console.error('Attendance tracker migration failed:', err);
    process.exit(1);
  });
}

module.exports = { migrateAttendanceTracker };