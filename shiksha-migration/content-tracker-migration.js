const { Client } = require('pg');
const axios = require('axios');
const dbConfig = require('./db');

console.log('=== Loading content-tracker-migration.js ===');

const BATCH_SIZE = 100; // Process 100 records at a time
const START_FROM_BATCH = 1; // Start from batch 103 (skipping first 102 batches)
const contentNameCache = new Map();
const userTenantCache = new Map();

function isUUID(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// Batch fetch content names with retry logic
async function fetchContentNames(contentIds) {
  const uniqueIds = [...new Set(contentIds)].filter(id => id && !contentNameCache.has(id));
  if (uniqueIds.length === 0) return;

  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds

  const headers = { 'Accept': 'application/json' };
  if (process.env.CONTENT_READ_COOKIE) headers.Cookie = process.env.CONTENT_READ_COOKIE;

  // Helper function to delay execution
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Helper function to fetch single content with retry
  async function fetchContentWithRetry(contentId, retryCount = 0) {
    try {
      //const url = `https://interface.prathamdigital.org/interface/v1/api/content/v1/read/${contentId}?fields=name`;
      const url = `${process.env.MIDDLEWARE_SERVICE_BASE_URL}api/content/v1/read/${contentId}?fields=name`;
      const res = await axios.get(url, { 
        headers,
        timeout: 5000, // 5 second timeout
      });
      const name = res?.data?.result?.content?.name || 'Unknown';
      contentNameCache.set(contentId, name);
      return true;
    } catch (e) {
      if (retryCount < MAX_RETRIES && (
          e.code === 'ETIMEDOUT' || 
          e.code === 'ECONNREFUSED' || 
          e.code === 'ECONNRESET' ||
          e.message.includes('network') ||
          e.message.includes('timeout')
      )) {
        console.warn(`[CONTENT TRACKER] Retry ${retryCount + 1}/${MAX_RETRIES} for content ${contentId} after error: ${e.message}`);
        await delay(RETRY_DELAY * (retryCount + 1)); // Exponential backoff
        return fetchContentWithRetry(contentId, retryCount + 1);
      }
      
      console.warn(`[CONTENT TRACKER] Content read API error for ${contentId} after ${retryCount} retries:`, e.message);
      contentNameCache.set(contentId, 'Unknown');
      return false;
    }
  }

  // Process in smaller chunks to avoid overwhelming the server
  const CHUNK_SIZE = 5;
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(contentId => fetchContentWithRetry(contentId)));
    
    if (i + CHUNK_SIZE < uniqueIds.length) {
      await delay(500); // Small delay between chunks
    }
  }
}

async function fetchCourseData(courseId) {
  if (!courseId) return {};
  try {
    const url = `${process.env.MIDDLEWARE_SERVICE_BASE_URL}api/course/v1/hierarchy/${courseId}?mode=edit`;
    const res = await axios.get(url, { headers: { 'Content-Type': 'application/json' } });
    if (res.data.result && res.data.result.content) return res.data.result.content;
  } catch (e) {
    console.warn('[CONTENT TRACKER] Course API error', e.message);
  }
  return {};
}

// getTenantId is replaced by batch processing in getTenantIds function

// Batch fetch tenant IDs
async function getTenantIds(sourceClient, userIds) {
  const uniqueIds = [...new Set(userIds)].filter(id => id && !userTenantCache.has(id));
  if (uniqueIds.length === 0) return;

  try {
    const res = await sourceClient.query(
      'SELECT "userId", "tenantId" FROM public.usertenantmapping WHERE "userId" = ANY($1)',
      [uniqueIds]
    );
    
    res.rows.forEach(row => {
      userTenantCache.set(row.userId, row.tenantid || row.tenantId);
    });
    
    // Set default tenant for users not found
    uniqueIds.forEach(userId => {
      if (!userTenantCache.has(userId)) {
        userTenantCache.set(userId, '10a9f829-3652-47d0-b17b-68c4428f9f89');
      }
    });
  } catch (e) {
    console.warn('[CONTENT TRACKER] Batch tenant fetch error:', e.message);
    uniqueIds.forEach(id => userTenantCache.set(id, '10a9f829-3652-47d0-b17b-68c4428f9f89'));
  }
}

async function ensureContentTrackerSchema(destClient) {
  // If ContentID/CourseID are uuid, alter them to varchar(255)
  const q = `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ContentTracker' AND column_name IN ('ContentID','CourseID')
  `;
  const res = await destClient.query(q);
  const toAlter = res.rows.filter(r => r.data_type && r.data_type.toLowerCase().includes('uuid'));
  if (toAlter.length > 0) {
    console.log('[CONTENT TRACKER] Altering column types for ContentID/CourseID to varchar(255)');
    await destClient.query('ALTER TABLE public."ContentTracker" ALTER COLUMN "CourseID" TYPE varchar(255) USING "CourseID"::text');
    console.log('[CONTENT TRACKER] ✓ Successfully altered CourseID column type to varchar(255)');
    await destClient.query('ALTER TABLE public."ContentTracker" ALTER COLUMN "ContentID" TYPE varchar(255) USING "ContentID"::text');
    console.log('[CONTENT TRACKER] ✓ Successfully altered ContentID column type to varchar(255)');
  }

  // Check and add unique constraint on ContentTrackerID if it doesn't exist
  try {
    const constraintCheck = await destClient.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_schema = 'public' 
        AND table_name = 'ContentTracker' 
        AND constraint_type = 'UNIQUE' 
        AND constraint_name = 'ContentTracker_ContentTrackerID_unique'
    `);

    if (constraintCheck.rows.length === 0) {
      console.log('[CONTENT TRACKER] Adding unique constraint on ContentTrackerID');
      await destClient.query('ALTER TABLE public."ContentTracker" ADD CONSTRAINT "ContentTracker_ContentTrackerID_unique" UNIQUE ("ContentTrackerID")');
      console.log('[CONTENT TRACKER] ✓ Successfully added unique constraint on ContentTrackerID');
    }
  } catch (e) {
    if (e.code === '42P01') {
      // Table doesn't exist yet, will be created by the application
      console.log('[CONTENT TRACKER] Table does not exist yet, skipping constraint check');
    } else {
      throw e;
    }
  }
}

async function processBatch(src, dst, batch) {
  try {
    // Prepare batch data for content names and tenant IDs
    const batchContentIds = batch.map(ct => ct.contentId).filter(Boolean);
    const batchUserIds = batch.map(ct => ct.userId).filter(Boolean);
    
    // Fetch content names and tenant IDs in parallel
    await Promise.all([
      fetchContentNames(batchContentIds),
      getTenantIds(src, batchUserIds)
    ]);

  // Bulk fetch content tracking details
  const trackingIds = batch.map(ct => ct.contentTrackingId);
  const detailsRes = await src.query(
    'SELECT "contentTrackingId", duration, "updatedOn", "createdOn", eid FROM public.content_tracking_details WHERE "contentTrackingId" = ANY($1)',
    [trackingIds]
  );

  // Process details by tracking ID
  const detailsByTracking = new Map();
  detailsRes.rows.forEach(detail => {
    if (!detailsByTracking.has(detail.contentTrackingId)) {
      detailsByTracking.set(detail.contentTrackingId, []);
    }
    detailsByTracking.get(detail.contentTrackingId).push(detail);
  });

  // Prepare batch upsert
  const values = batch.map((ct, idx) => {
    const details = detailsByTracking.get(ct.contentTrackingId) || [];
    let totalDuration = 0;
    let latestEid = null;
    let latestTs = 0;

    details.forEach(d => {
      totalDuration += Number(d.duration || 0);
      const ts = new Date(d.updatedOn || d.createdOn || 0).getTime();
      if (ts > latestTs) {
        latestTs = ts;
        latestEid = d.eid;
      }
    });

    const timeSpentInt = Math.min(2147483647, Math.max(0, Math.round(totalDuration || 0)));
    const status = latestEid || 'unknown';
    const contentName = contentNameCache.get(ct.contentId) || 'Unknown';
    const tenantId = userTenantCache.get(ct.userId);

    return `(
      $${idx * 9 + 1},
      $${idx * 9 + 2},
      $${idx * 9 + 3},
      $${idx * 9 + 4},
      $${idx * 9 + 5},
      $${idx * 9 + 6},
      $${idx * 9 + 7},
      $${idx * 9 + 8},
      $${idx * 9 + 9}
    )`;
  });

  const params = batch.flatMap(ct => [
    ct.contentTrackingId, // Use source contentTrackingId as ContentTrackerID
    ct.userId,
    userTenantCache.get(ct.userId),
    ct.contentId,
    ct.courseId,
    contentNameCache.get(ct.contentId) || 'Unknown',
    ct.contentType || 'content',
    detailsByTracking.get(ct.contentTrackingId)?.slice(-1)[0]?.eid || 'unknown',
    Math.min(2147483647, Math.max(0, Number(ct.timeSpent) || 0))
  ]);

  // First, fetch existing records to check their EIDs using WHERE IN for each component
  const userIds = batch.map(ct => ct.userId);
  const contentIds = batch.map(ct => ct.contentId);
  const tenantIds = batch.map(ct => userTenantCache.get(ct.userId));
  const courseIds = batch.map(ct => ct.courseId);

  const existingRecords = await dst.query(
    `SELECT "UserID", "ContentID", "TenantID", "CourseID", "ContentTrackingStatus" 
     FROM public."ContentTracker" 
     WHERE "UserID" = ANY($1)
     AND "ContentID" = ANY($2)
     AND "TenantID" = ANY($3)
     AND "CourseID" = ANY($4)`,
    [userIds, contentIds, tenantIds, courseIds]
  );

  // Create a map of existing records for quick lookup
  const existingMap = new Map();
  existingRecords.rows.forEach(record => {
    const key = `${record.UserID}-${record.ContentID}-${record.TenantID}-${record.CourseID}`;
    existingMap.set(key, record.ContentTrackingStatus);
  });

  // Filter out records that have the same EID and prepare updates for others
  const recordsToUpdate = [];
  const recordsToInsert = [];

  batch.forEach(ct => {
    const key = `${ct.userId}-${ct.contentId}-${userTenantCache.get(ct.userId)}-${ct.courseId}`;
    const existingEid = existingMap.get(key);
    const newEid = detailsByTracking.get(ct.contentTrackingId)?.slice(-1)[0]?.eid || 'unknown';

    if (existingMap.has(key)) {
      if (existingEid !== newEid) {
        recordsToUpdate.push({
          userId: ct.userId,
          contentId: ct.contentId,
          tenantId: userTenantCache.get(ct.userId),
          courseId: ct.courseId,
          newEid
        });
      }
      // Skip if EID is the same
    } else {
      recordsToInsert.push(ct);
    }
  });

  // Handle inserts and updates
  for (const record of batch) {
    const newEid = detailsByTracking.get(record.contentTrackingId)?.slice(-1)[0]?.eid || 'unknown';
    const params = [
      record.userId,
      userTenantCache.get(record.userId),
      record.contentId,
      record.courseId,
      contentNameCache.get(record.contentId) || 'Unknown',
      record.contentType || 'content',
      newEid,
      Math.min(2147483647, Math.max(0, Number(record.timeSpent) || 0))
    ];

    // Use upsert with ON CONFLICT DO UPDATE
    const upsertQuery = `
      INSERT INTO public."ContentTracker" (
        "ContentTrackerID",
        "UserID",
        "TenantID",
        "ContentID",
        "CourseID",
        "ContentName",
        "ContentType",
        "ContentTrackingStatus",
        "TimeSpent"
      )
      VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, $6, $7, $8
      )
      ON CONFLICT ("UserID", "ContentID", "TenantID", "CourseID")
      DO UPDATE SET
        "ContentTrackingStatus" = EXCLUDED."ContentTrackingStatus",
        "UpdatedAt" = CURRENT_TIMESTAMP
      WHERE "ContentTracker"."ContentTrackingStatus" != EXCLUDED."ContentTrackingStatus"
    `;

    await dst.query(upsertQuery, params);
  }

    let successCount = 0;
    let errorCount = 0;

    // Process each record individually to prevent entire batch failure
    for (const record of batch) {
      try {
        const newEid = detailsByTracking.get(record.contentTrackingId)?.slice(-1)[0]?.eid || 'unknown';
        const params = [
          record.userId,
          userTenantCache.get(record.userId),
          record.contentId,
          record.courseId,
          contentNameCache.get(record.contentId) || 'Unknown',
          record.contentType || 'content',
          newEid,
          Math.min(2147483647, Math.max(0, Number(record.timeSpent) || 0))
        ];

        const upsertQuery = `
          INSERT INTO public."ContentTracker" (
            "ContentTrackerID",
            "UserID",
            "TenantID",
            "ContentID",
            "CourseID",
            "ContentName",
            "ContentType",
            "ContentTrackingStatus",
            "TimeSpent"
          )
          VALUES (
            gen_random_uuid(),
            $1, $2, $3, $4, $5, $6, $7, $8
          )
          ON CONFLICT ("UserID", "ContentID", "TenantID", "CourseID")
          DO UPDATE SET
            "ContentTrackingStatus" = EXCLUDED."ContentTrackingStatus",
            "UpdatedAt" = CURRENT_TIMESTAMP
          WHERE "ContentTracker"."ContentTrackingStatus" != EXCLUDED."ContentTrackingStatus"
        `;

        await dst.query(upsertQuery, params);
        successCount++;
      } catch (err) {
        console.error(`[CONTENT TRACKER] Error processing record ${record.contentTrackingId}:`, err.message);
        errorCount++;
      }
    }

    console.log(`[CONTENT TRACKER] ✓ Batch complete: ${successCount} successful, ${errorCount} failed`);
  } catch (err) {
    console.error('[CONTENT TRACKER] Batch processing error:', err.message);
    // Continue with next batch instead of failing completely
  }
}

async function migrateContentTracker() {
  console.log('=== STARTING CONTENT TRACKER MIGRATION ===');
  const src = new Client(dbConfig.assessment_source);
  const dst = new Client(dbConfig.assessment_destination);

  try {
    await src.connect();
    await dst.connect();
    console.log('[CONTENT TRACKER] Connected to databases');

    await ensureContentTrackerSchema(dst);

    let offset = (START_FROM_BATCH - 1) * BATCH_SIZE; // Skip to batch 103
    let totalProcessed = 0;
    let batchNumber = START_FROM_BATCH;

    console.log(`[CONTENT TRACKER] Starting from batch ${START_FROM_BATCH} (offset: ${offset} records)`);

    while (true) {
      try {
        // Fetch records in chunks to prevent memory issues
        const trackRows = await src.query('SELECT * FROM public.content_tracking OFFSET $1 LIMIT $2', [offset, BATCH_SIZE]);
        
        if (trackRows.rows.length === 0) {
          break; // No more records to process
        }

        console.log(`[CONTENT TRACKER] Processing batch ${batchNumber} (${trackRows.rows.length} records)`);
        await processBatch(src, dst, trackRows.rows);

        offset += BATCH_SIZE;
        totalProcessed += trackRows.rows.length;
        batchNumber++;

        // Log progress
        console.log(`[CONTENT TRACKER] Progress: ${totalProcessed} records processed`);
      } catch (err) {
        console.error(`[CONTENT TRACKER] Error in batch ${batchNumber}:`, err.message);
        // Continue with next batch instead of failing
        offset += BATCH_SIZE;
        batchNumber++;
      }
    }

    console.log(`[CONTENT TRACKER] Migration completed. Total records processed: ${totalProcessed}`);
  } catch (e) {
    console.error('[CONTENT TRACKER] Database connection error:', e.message);
  } finally {
    try {
      await src.end();
      await dst.end();
      console.log('[CONTENT TRACKER] Disconnected from databases');
    } catch (err) {
      console.error('[CONTENT TRACKER] Error disconnecting:', err.message);
    }
  }
}

async function processOne(src, dst, ct) {
  const { contentTrackingId, userId, courseId, contentId, contentType, timeSpent } = ct;
  console.log(`[CONTENT TRACKER] Processing record - contentTrackingId: ${contentTrackingId}, userId: ${userId}, contentId: ${contentId}`);
  const tenantId = await getTenantId(src, userId) || '10a9f829-3652-47d0-b17b-68c4428f9f89';
  console.log(`[CONTENT TRACKER] Resolved tenantId: ${tenantId} for userId: ${userId}`);

  // aggregate details for status and duration
  const det = await src.query('SELECT * FROM public.content_tracking_details WHERE "contentTrackingId"=$1', [contentTrackingId]);
  let totalDuration = 0;
  let latestEid = null;
  let latestTs = 0;
  for (const d of det.rows) {
    totalDuration += Number(d.duration || 0);
    const ts = new Date(d.updatedOn || d.createdOn || 0).getTime();
    if (ts > latestTs) {
      latestTs = ts;
      latestEid = d.eid;
    }
  }
  const status = latestEid || 'unknown';
  const timeSpentInt = Math.min(2147483647, Math.max(0, Math.round(totalDuration || 0)));

  // Content name via content read API
  let contentName = (await fetchContentName(contentId)) || 'Unknown';

  // UPSERT by (UserID, ContentID)
  const exists = await dst.query('SELECT "ContentTrackerID" FROM public."ContentTracker" WHERE "UserID"=$1 AND "ContentID"=$2 LIMIT 1', [userId, contentId]);
  if (exists.rows.length) {
    const id = exists.rows[0].ContentTrackerID;
    console.log(`[CONTENT TRACKER] Updating existing record - ContentTrackerID: ${id}, UserID: ${userId}, ContentID: ${contentId}`);
    await dst.query(
      'UPDATE public."ContentTracker" SET "TenantID"=$2, "CourseID"=$3, "ContentName"=$4, "ContentType"=$5, "ContentTrackingStatus"=$6, "TimeSpent"=$7 WHERE "ContentTrackerID"=$1',
      [id, tenantId, courseId, contentName, contentType || 'content', status, timeSpentInt]
    );
    console.log(`[CONTENT TRACKER] ✓ Successfully updated ContentTracker record for UserID: ${userId}, ContentID: ${contentId}, Status: ${status}, TimeSpent: ${timeSpentInt}`);
  } else {
    console.log(`[CONTENT TRACKER] Creating new record - UserID: ${userId}, ContentID: ${contentId}, ContentName: ${contentName}`);
    await dst.query(
      'INSERT INTO public."ContentTracker" ("ContentTrackerID","UserID","TenantID","ContentID","CourseID","ContentName","ContentType","ContentTrackingStatus","TimeSpent") VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8)',
      [userId, tenantId, contentId, courseId, contentName, contentType || 'content', status, timeSpentInt]
    );
    console.log(`[CONTENT TRACKER] ✓ Successfully created new ContentTracker record for UserID: ${userId}, ContentID: ${contentId}, Status: ${status}, TimeSpent: ${timeSpentInt}`);
  }
}

if (require.main === module) {
  migrateContentTracker();
}

module.exports = { migrateContentTracker };