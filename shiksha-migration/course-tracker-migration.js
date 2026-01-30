const { Client } = require('pg');
const dbConfig = require('./db');
const axios = require('axios');

console.log('=== Loading course-tracker-migration.js ===');

function isUUID(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getCourseName(courseId) {
  try {
    const baseUrl = process.env.MIDDLEWARE_SERVICE_BASE_URL;
    console.log(baseUrl,courseId);
    if (!baseUrl) {
      console.warn('[COURSE TRACKER] MIDDLEWARE_SERVICE_BASE_URL not configured, using default name');
      return 'Unknown Course';
    }

    const url = new URL(
      `api/course/v1/hierarchy/${courseId}?mode=edit`,
      baseUrl,
    );

    const headers = {
      'Content-Type': 'application/json',
    };

    let contentResponse = await axios.get(url.toString(), {
      headers,
      timeout: 10000, // 10 second timeout
    });
    console.log("course name --->>>>", contentResponse.data.result.content.name);
    // Extract course name from response
    return contentResponse.data.result.content.name || 'Unknown Course';
  } catch (error) {
    console.error(
      '[COURSE TRACKER] Error fetching course name for courseId:',
      courseId,
      error.message,
    );
    return 'Unknown Course'; // Fallback to default name
  }
}

async function migrateCourseTracker() {
  console.log('=== STARTING COURSE TRACKER MIGRATION ===');
  const sourceClient = new Client(dbConfig.assessment_source); // Using same source as assessment
  const destClient = new Client(dbConfig.assessment_destination); // Using same destination as assessment

  try {
    await sourceClient.connect();
    console.log('[COURSE TRACKER] Connected to source database');
    await destClient.connect();
    console.log('[COURSE TRACKER] Connected to destination database');

    // Pull user-course certificate rows
    const query = `
      SELECT 
        ucc."usercertificateId",
        ucc."userId",
        ucc."tenantId",
        ucc."courseId" AS course_id_raw,
        ucc."certificateId",
        ucc.status,
        ucc."createdOn",
        ucc."completedOn"
      FROM public.user_course_certificate ucc
      WHERE ucc."userId" IS NOT NULL 
        AND ucc."tenantId" IS NOT NULL
        AND ucc."courseId" IS NOT NULL`;

    const res = await sourceClient.query(query);
    console.log(`[COURSE TRACKER] Found ${res.rows.length} candidate rows.`);

    let processed = 0;
    for (const row of res.rows) {
      await upsertCourseTracker(destClient, row);
      processed += 1;
      console.log(`[COURSE TRACKER] Processed ${processed}/${res.rows.length} - User: ${row.userId}, Course: ${row.course_name || 'Unknown'}`);
      // For testing one item, uncomment below
    }

    console.log(`[COURSE TRACKER] ✅ COURSE DATA UPDATED SUCCESSFULLY! Processed ${processed} records`);
  } catch (err) {
    console.error('[COURSE TRACKER] Critical error:', err);
  } finally {
    await sourceClient.end();
    await destClient.end();
    console.log('[COURSE TRACKER] Disconnected from databases');
  }
}

async function upsertCourseTracker(destClient, row) {
  console.log("row --->>>>");
  const userId = row.userId;
  const tenantId = row.tenantId; // Required field, already filtered in query

  // CourseID: Use as string directly
  const courseId = row.course_id_raw;
  
  if (!courseId) {
    console.warn('[COURSE TRACKER] Skipping row - CourseID is missing', { userId, courseIdRaw: row.course_id_raw });
    return;
  }
console.log("courseId --->>>>",courseId);
  // Fetch course name from API
  const courseName = await getCourseName(courseId);
  console.log("courseName --->>>>",courseName);
  const status = row.status || 'unknown';
  
  // CertificateID: Use as string directly
  const certificateId = row.certificateId || null;
  
  const startDate = row.createdOn || null;
  const endDate = row.completedOn || null;

  // Check if (UserID, CourseID) exists
  const existing = await destClient.query(
    'SELECT "CourseTrackerID" FROM public."CourseTracker" WHERE "UserID"=$1 AND "CourseID"=$2 LIMIT 1',
    [userId, courseId]
  );

  if (existing.rows.length > 0) {
    const updateSql = `
      UPDATE public."CourseTracker"
      SET "CourseTrackingStatus"=$3,
          "CertificateID"=$4,
          "CourseTrackingStartDate"=$5,
          "CourseTrackingEndDate"=$6,
          "CourseName"=$7
      WHERE "UserID"=$1 AND "CourseID"=$2
    `;
    await destClient.query(updateSql, [userId, courseId, status, certificateId, startDate, endDate, courseName]);
    return;
  }

  const insertSql = `
    INSERT INTO public."CourseTracker" (
      "CourseTrackerID", "UserID", "TenantID", "CourseID", "CourseName",
      "CourseTrackingStatus", "CertificateID", "CourseTrackingStartDate", "CourseTrackingEndDate"
    ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
  `;
  await destClient.query(insertSql, [userId, tenantId, courseId, courseName, status, certificateId, startDate, endDate]);
}

if (require.main === module) {
  console.log('Running course-tracker-migration.js directly');
  migrateCourseTracker().catch(err => {
    console.error('CourseTracker migration failed with unhandled error:', err);
    process.exit(1);
  });
}

module.exports = { migrateCourseTracker };