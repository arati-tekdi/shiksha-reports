import { Injectable } from '@nestjs/common';
import { User } from '../../entities/user.entity';
import { DailyAttendanceReport } from '../../entities/daily-attendance-report.entity';
import {
  UserEventData,
  AttendanceEventData,
  AssessmentTrackingData,
  AssessmentScoreData,
  CourseEnrollmentData,
} from '../../types';

import { Cohort } from 'src/entities/cohort.entity';
import { DatabaseService } from 'src/services/database.service';

import { AttendanceTracker } from 'src/entities/attendance-tracker.entity';
import { AssessmentTracker } from 'src/entities/assessment-tracker.entity';
import { CourseTracker } from 'src/entities/course-tracker.entity';
import { ContentTracker } from 'src/entities/content-tracker.entity';
import { RegistrationTracker } from 'src/entities/registration-tracker.entity';
import { Course } from 'src/entities/course.entity';
import { QuestionSet } from 'src/entities/question-set.entity';
import { Content } from 'src/entities/content.entity';
import { Project } from 'src/entities/project.entity';
import { ProjectTask } from 'src/entities/projectTask.entity';
import { ProjectTaskTracking } from 'src/entities/projectTaskTracking.entity';
import {
  ExternalCourseData,
  ExternalQuestionSetData,
  ExternalContentData,
} from 'src/types/cron.types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TransformService {
  constructor(private readonly dbService: DatabaseService) {}

  async transformUserData(data: UserEventData) {
    try {
      // const tenant = data.tenantData?.[0] ?? {}; // Commented out as it's not used

      // Extract custom field values from the new Kafka message structure
      const extractCustomField = (label: string) => {
        if (!data.customFields || !Array.isArray(data.customFields)) {
          return null;
        }
        const field = data?.customFields.find((f: any) => f?.label === label);

        if (
          !field ||
          !field.selectedValues ||
          !Array.isArray(field.selectedValues) ||
          field.selectedValues.length === 0
        ) {
          return null;
        }

        const selectedValue = field.selectedValues[0];

        // Handle different types of selectedValues
        if (typeof selectedValue === 'string') {
          return selectedValue;
        } else if (
          typeof selectedValue === 'object' &&
          selectedValue !== null
        ) {
          // Return the 'value' property if it exists, otherwise 'id'
          return selectedValue.id;
        }

        return null;
      };

      // Helper function to extract custom field by fieldId
      const extractCustomFieldById = (fieldId: string) => {
        if (!data.customFields || !Array.isArray(data.customFields)) {
          return null;
        }
        const field = data?.customFields.find(
          (f: any) => f?.fieldId === fieldId,
        );

        if (
          !field ||
          !field.selectedValues ||
          !Array.isArray(field.selectedValues) ||
          field.selectedValues.length === 0
        ) {
          return null;
        }

        const selectedValue = field.selectedValues[0];

        // Handle different types of selectedValues
        if (typeof selectedValue === 'string') {
          return selectedValue;
        } else if (
          typeof selectedValue === 'object' &&
          selectedValue !== null
        ) {
          // Return the 'value' property if it exists, otherwise 'id'
          return selectedValue.value || selectedValue.id || null;
        }

        return null;
      };

      // Helper function to convert yes/no to boolean
      const convertToBoolean = (value: string | null) => {
        if (value === null) return null;
        return value.toLowerCase() === 'yes';
      };

      // Convert status string (active/inactive) to boolean
      const convertStatusToBoolean = (status: string | null | undefined) => {
        if (!status) return null;
        return status.toLowerCase() === 'active';
      };

      // Helper function to convert string to Date
      const convertToDate = (value: string | null) => {
        if (!value) return null;
        try {
          const date = new Date(value);
          return isNaN(date.getTime()) ? null : date;
        } catch {
          return null;
        }
      };

      const transformedData: Partial<User> & Record<string, any> = {
        // Basic user fields - mapping to entity property names (not column names)
        userId: data.userId,
        username: data.username,
        fullName:
          `${data.firstName || ''} ${data.middleName ? data.middleName + ' ' : ''}${data.lastName || ''}`.trim() || undefined,
        email: data.email,
        mobile: data.mobile?.toString(),
        dob: data.dob,
        gender: data.gender,
        status: convertStatusToBoolean(data.status),
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined,

        // Add enrollmentId from main data
        // same key in shiksha
        //userEnrollmentNumber: data.enrollmentId,

        // Location fields from custom fields
        stateId: extractCustomField('STATE'),
        districtId: extractCustomField('DISTRICT'),
        blockId: extractCustomField('BLOCK'),
        villageId: extractCustomField('VILLAGE'),

        // Additional custom fields mapped to entity properties
        // same key in shiksha
        //userFatherName: extractCustomField('FATHER_NAME'),
        userGuardianName: extractCustomField('NAME_OF_GUARDIAN'),
        // same key in shiksha
        //userGuardianRelation: extractCustomField('RELATION_WITH_GUARDIAN'),
        // same key in shiksha
        //userParentPhone: extractCustomField('PARENT_GUARDIAN_PHONE_NO'),
        // same key in shiksha
        //userClass: extractCustomField(
        //  'HIGHEST_EDCATIONAL_QUALIFICATION_OR_LAST_PASSED_GRADE',
        //),
        // same key in shiksha
        //userMaritalStatus: extractCustomField('MARITAL_STATUS'),
        // same key in shiksha
        //userWhatDoYouWantToBecome: extractCustomField(
        //  'WHAT_DO_YOU_WANT_TO_BECOME',
        //),
        // same key in shiksha
        //userDropOutReason: extractCustomField(
        //  'REASON_FOR_DROP_OUT_FROM_SCHOOL',
        //),
        // same key in shiksha
        //userWorkDomain: extractCustomField('WHAT_IS_YOUR_PRIMARY_WORK'),
        preferredModeOfLearning: extractCustomField(
          'WHAT_IS_YOUR_PREFERRED_MODE_OF_LEARNING',
        ),

        // Additional fields from new structure
        centerId: extractCustomField('CENTER'),
        phoneTypeAccessible: extractCustomField('TYPE_OF_PHONE_ACCESSIBLE'),
        familyMemberDetails: extractCustomField('FAMILY_MEMBER_DETAILS'),

        // Boolean fields
        // same key in shiksha
        //userOwnPhoneCheck: convertToBoolean(
        //  extractCustomField('DOES_THIS_PHONE_BELONG_TO_YOU'),
        //),

        // ERP and Manager fields (extracted by fieldId)
        erpUserId: extractCustomFieldById(
          '93de5cc5-9437-4ca7-95f3-3b2f31b24093',
        ),
        isManager: convertToBoolean(extractCustomFieldById(
          '8e8ab9b7-8ce0-4e6e-bf7e-0477a80734c8',
        ),),
        empManager: extractCustomFieldById(
          '27589b6d-6ece-457a-8d50-d15a3db02bf6',
        ),
        // JobFamily, PSU, GroupMembership mapped to proper columns
        jobFamily: extractCustomField('JOB_FAMILY'),
        psu: extractCustomField('PSU'),
        // same key in shiksha
        //groupMembership: extractCustomField('EMP_GROUP'),

        // Additional fields extracted by fieldId for shiksha
        userPreferredModeOfLearning: extractCustomFieldById(
          '7b43db0a-f4c3-4c77-919f-622509ca7add',
        ),
        userWorkDomain: extractCustomFieldById(
          '2914814c-2a0f-4422-aff8-6bd3b09d3069',
        ),
        userSpouseName: extractCustomFieldById(
          '0dd4cf0b-b774-439a-9997-5437cd78bfcd',
        ),
        userWhatDoYouWantToBecome: extractCustomFieldById(
          'a8d3d878-9b92-4231-b25c-b22726985238',
        ),
        userClass: extractCustomFieldById(
          '9a4ad601-023b-467f-bbbe-bda1885f87c7',
        ),
        userPreferredLanguage: extractCustomFieldById(
          '4b9d798d-e8f2-4ae5-b177-a57655aa5d1c',
        ),
        userParentPhone: extractCustomFieldById(
          '7ecaa845-901a-4ac7-a136-eed087f3b85b',
        ),
        userGuardianRelation: extractCustomFieldById(
          '3a7bf305-6bac-4377-bf09-f38af866105c',
        ),
        userSubjectTaught: extractCustomFieldById(
          'abb7f3fe-f7fa-47be-9d28-5747dd3159f2',
        ),
        userMaritalStatus: extractCustomFieldById(
          'ff472647-6c40-42e6-b200-dc74b241e915',
        ),
        userGrade: extractCustomFieldById(
          '5a2dbb89-bbe6-4aa8-b541-93e01ab07b70',
        ),
        userTrainingCheck: convertToBoolean(
          extractCustomFieldById('0be5a8c6-92e9-4b7c-ac01-345131b06118'),
        ),
        userDropOutReason: extractCustomFieldById(
          '4f48571b-88fd-43b9-acb3-91afda7901ac',
        ),
        userOwnPhoneCheck: convertToBoolean(
          extractCustomFieldById('d119d92f-fab7-4c7d-8370-8b40b5ed23dc'),
        ),
        userEnrollmentNumber: extractCustomFieldById(
          'e2f1fcbc-a76a-4b51-a092-ae4823bc45fd',
        ),
        userDesignation: extractCustomFieldById(
          '4fc098c5-bec5-4afc-a15d-093805b05119',
        ),
        userBoard: extractCustomFieldById(
          'f93c0ac3-f827-4794-9457-441fa1057b42',
        ),
        userSubject: extractCustomFieldById(
          '69a9dba2-e05e-40cd-a39c-047b9b676b5c',
        ),
        userMainSubject: extractCustomFieldById(
          '935bfb34-9be7-4676-b9cc-cec1ec4c0a2c',
        ),
        userMedium: extractCustomFieldById(
          '7b214a17-5a07-4ee0-bedc-271429862d30',
        ),
        userPhoneType: extractCustomFieldById(
          'da594b2e-c645-4a96-af15-6e2d24587c9a',
        ),
        userNumOfChildrenWorkingWith: extractCustomFieldById(
          'a4c2dace-e052-4e78-b6ad-9ffcc035c578',
        ),
        groupMembership: extractCustomFieldById(
          '29c36dd1-315c-46d9-bf6a-f1858ae71c33',
        ),
        userFatherName: extractCustomFieldById(
          '679f4a27-09f9-4f78-85a0-9fe8bfd3ef18',
        ),
        userMotherName: extractCustomFieldById(
          'd3644b9e-e9df-4f08-ae7b-1a6b4413fedf',
        ),
        userAccessToWhatsApp: extractCustomFieldById(
          '53a44ba9-c8ed-43db-9fee-c2c81ae707b9',
        ),
        userProgram: extractCustomFieldById(
          '5fce49b6-cd23-44f5-b87b-4ae0cbe2e328',
        ),
        userGender: extractCustomFieldById(
          '08ab0a4e-4a72-498b-ad43-38fcb5e47586',
        ),
        userDateOfJoining: convertToDate(
          extractCustomFieldById('cec6c953-71b6-4c53-98b8-582aaa6008b5'),
        ),
        userTeacherID: extractCustomFieldById(
          'f9f17574-4227-4ba3-a485-f8b1269ff086',
        ),
        userCEFRLevel: extractCustomFieldById(
          'e2395f11-a53d-4fb6-ab89-eae6367156f5',
        ),
        userSubprograms: extractCustomFieldById(
          '074643e8-8d53-4f14-956b-f7d0216f63e7',
        ),
        userOldTeacherID: extractCustomFieldById(
          '434fcadb-8508-42a9-bbed-03be19e8dfdb',
        ),
        userRole: extractCustomFieldById(
          '4e4864d3-7049-49d0-b52a-4c9fbe7774b8',
        ),
        userVillageId: extractCustomFieldById(
          'e4de6f2a-f4b3-4f66-b1be-fcbe8ff607d3',
        ) || extractCustomFieldById(
          '5cfacade-9d56-4a1e-b4e9-cc8e8c6b04c5',
        ) || extractCustomFieldById(
          '2f7e6930-0bc2-4e69-8bd4-dde205fa5471',
        ),
        userClusterId: extractCustomFieldById(
          'c3357b23-1394-48a9-afc5-7589873365ae',
        ),
        userSupervisors: extractCustomFieldById(
          '26c55f7f-c691-440d-8c7f-88480c72f07b',
        ),
        
        userDistrictId: extractCustomFieldById(
          'd4ad6f2a-f4b3-4f66-b1be-fcbe8ff607f3',
        ) || extractCustomFieldById(
          '62340eaa-40fb-48b9-ba90-dcaa78be778e',
        ),
        userStateId: extractCustomFieldById(
          '800265b1-9058-482a-94f4-726197e1dfe4',
        ) ||  extractCustomFieldById(
          'b4ad6f2a-f4b3-4f66-b1be-fcbe8ff607e3',
        ),
        userBlockId: extractCustomFieldById(
          '1e3e76e2-7f77-4fd7-a79f-abe5c33d4d08',
        ) || extractCustomFieldById(
          'e4bc6f2a-f4b3-4f66-b1be-fcbe8ff607f3',
        ),
        userDateOfLeaving: convertToDate(
          extractCustomFieldById('4fa37e71-bbd6-4dd1-9523-510edf63afb7'),
        ),
        userReasonForLeaving: extractCustomFieldById(
          '11fe3a6b-3b32-43e4-bc50-1fc72bf5dd54',
        ),
        userDepartment: extractCustomFieldById(
          '0d501559-3bb2-44ed-8e33-850f6ed22666',
        ),
      };
      console.log(transformedData,"");
      return transformedData;
    } catch (error) {
      console.error('Error transforming user data:', error);
      throw error;
    }
  }

  async transformCohortMemberData(data: UserEventData) {
    try {
      const userId = data.userId;
      const cohortMembers = [];

      if (data.cohorts && Array.isArray(data.cohorts)) {
        for (const cohort of data.cohorts) {
          const cohortMember = {
            UserID: userId,
            CohortID: cohort.batchId,
            MemberStatus: cohort.cohortMemberStatus || 'active',
            AcademicYearID: cohort.academicYearId,
            CohortMemberID: cohort.cohortMemberId,
          };
          cohortMembers.push(cohortMember);
        }
      }

      return cohortMembers;
    } catch (error) {
      console.error('Error transforming cohort member data:', error);
      throw error;
    }
  }

  async transformCohortData(data: any): Promise<Partial<Cohort>> {
    try {
      // Extract custom field values from the new Kafka message structure
      const extractCustomField = (label: string) => {
        if (!data.customFields || !Array.isArray(data.customFields)) {
          return null;
        }

        const field = data?.customFields.find((f: any) => f?.label === label);
        if (
          !field ||
          !field.selectedValues ||
          !Array.isArray(field.selectedValues) ||
          field.selectedValues.length === 0
        ) {
          return null;
        }

        const selectedValue = field.selectedValues[0];

        // Handle different types of selectedValues
        if (typeof selectedValue === 'string') {
          return selectedValue;
        } else if (
          typeof selectedValue === 'object' &&
          selectedValue !== null
        ) {
          // Return the 'id' property for cohort fields
          return selectedValue.id;
        }

        return null;
      };

      // Extract custom field by fieldId
      const extractCustomFieldById = (fieldId: string) => {
        if (!data.customFields || !Array.isArray(data.customFields)) {
          return null;
        }

        const field = data.customFields.find((f: any) => f.fieldId === fieldId);
        if (
          !field ||
          !field.selectedValues ||
          !Array.isArray(field.selectedValues) ||
          field.selectedValues.length === 0
        ) {
          return null;
        }

        const selectedValue = field.selectedValues[0];

        // Return the value property for the type determination
        if (typeof selectedValue === 'object' && selectedValue !== null) {
          return selectedValue.value || selectedValue.id || null;
        } else if (typeof selectedValue === 'string') {
          return selectedValue;
        }

        return null;
      };

      // Determine the correct type based on event type and conditions
      let correctedType = data.type;

      if (data.type === 'COHORT') {
        // For COHORT_CREATED events, find the TYPE_OF_CENTER field
        const typeOfCenter = extractCustomFieldById(
          '000a7469-2721-4c7b-8180-52812a0f6fe7',
        );

        if (typeOfCenter === 'remote') {
          correctedType = 'RemoteCenter';
        } else if (typeOfCenter === 'regular') {
          correctedType = 'RegularCenter';
        } else {
          // Keep original type if no matching custom field found
          console.warn(
            `Unknown type of center: ${typeOfCenter}, keeping original type: ${data.type}`,
          );
        }
      } else if (data.type === 'BATCH' && data.parentId) {
        // For COHORT_UPDATED events with BATCH type, check parent cohort
        try {
          const parentCohort = await this.dbService.findCohort(data.parentId);

          if (parentCohort) {
            if (parentCohort.type === 'RemoteCenter') {
              correctedType = 'RemoteBatch';
            } else if (parentCohort.type === 'RegularCenter') {
              correctedType = 'RegularBatch';
            } else {
              console.warn(
                `Parent cohort has unknown type: ${parentCohort.type}, keeping original type: ${data.type}`,
              );
            }
          } else {
            console.warn(
              `Parent cohort with ID ${data.parentId} not found, keeping original type: ${data.type}`,
            );
          }
        } catch (error) {
          console.error(
            `Error fetching parent cohort ${data.parentId}:`,
            error,
          );
          // Keep original type if error occurs
        }
      }

      const transformedData: Partial<Cohort> & Record<string, any> = {
        cohortId: data.cohortId,
        tenantId: data.tenantId,
        cohortName: data.name,
        createdOn: data.createdAt ? new Date(data.createdAt) : undefined,
        parentId: data.parentId,
        type: correctedType,
        status: data.status,

        // Location fields from custom fields
        // same key in shiksha
        //coStateId: extractCustomField('STATE'),
        // same key in shiksha
        //coDistrictId: extractCustomField('DISTRICT'),
        // same key in shiksha
        //coBlockId: extractCustomField('BLOCK'),
        // same key in shiksha
        //coVillageId: extractCustomField('VILLAGE'),

        // Educational fields
        // same key in shiksha
        //coBoard: extractCustomField('BOARD'),
        // same key in shiksha
        //coGrade: extractCustomField('GRADE'),
        // same key in shiksha
        //coMedium: extractCustomField('MEDIUM'),
        // same key in shiksha
        //coSubject: extractCustomField('SUBJECT'),

        // Additional fields
        // same key in shiksha
        //coGoogleMapLink: extractCustomField('GOOGLE_MAP_LINK'),
        // same key in shiksha
        //coIndustry: extractCustomField('INDUSTRY'),

        // Additional fields extracted by fieldId for shiksha
        coBoard: extractCustomFieldById('f93c0ac3-f827-4794-9457-441fa1057b42'),
        coSubject: extractCustomFieldById(
          '69a9dba2-e05e-40cd-a39c-047b9b676b5c',
        ),
        coGrade: extractCustomFieldById('5a2dbb89-bbe6-4aa8-b541-93e01ab07b70'),
        coMedium: extractCustomFieldById(
          '7b214a17-5a07-4ee0-bedc-271429862d30',
        ),
        coIndustry: extractCustomFieldById(
          'e5277d7b-e7ef-4a11-9a54-a8e6e7975383',
        ),
        coGoogleMapLink: extractCustomFieldById(
          'e9f8acbb-b10d-4b46-9584-f5ec453c250e',
        ),
        coProgram: extractCustomFieldById(
          '5fce49b6-cd23-44f5-b87b-4ae0cbe2e328',
        ),
        coCluster: extractCustomFieldById(
          'c3357b23-1394-48a9-afc5-7589873365ae',
        ),
        coLongitude: extractCustomFieldById(
          'fe466e4e-193b-4d01-863d-cf861d8d5bf5',
        ),
        coLatitude: extractCustomFieldById(
          'fd466e4e-193b-4d01-863d-cf861d8d5bf4',
        ),
        coSchoolType: extractCustomFieldById(
          'c4ad6f2a-f4b3-4f66-b1be-fcbe8ff607e3',
        ),
        // Multiple field IDs mapping to same location columns - using first occurrence
        coDistrictId: extractCustomFieldById(
          'd4ad6f2a-f4b3-4f66-b1be-fcbe8ff607f3',
        ) || extractCustomFieldById(
          '62340eaa-40fb-48b9-ba90-dcaa78be778e',
        ),
        coStateId: extractCustomFieldById(
          'b4ad6f2a-f4b3-4f66-b1be-fcbe8ff607e3',
        ) || extractCustomFieldById(
          '800265b1-9058-482a-94f4-726197e1dfe4',
        ),
        coBlockId: extractCustomFieldById(
          '1e3e76e2-7f77-4fd7-a79f-abe5c33d4d08',
        ) || extractCustomFieldById(
          'e4bc6f2a-f4b3-4f66-b1be-fcbe8ff607f3',
        ),
        coVillageId: extractCustomFieldById(
          'e4de6f2a-f4b3-4f66-b1be-fcbe8ff607d3',
        ) || extractCustomFieldById(
          '5cfacade-9d56-4a1e-b4e9-cc8e8c6b04c5',
        ) || extractCustomFieldById(
          '2f7e6930-0bc2-4e69-8bd4-dde205fa5471',
        ),
      };

      console.log(
        `[TransformService] Cohort ${data.cohortId}: Original type "${data.type}" -> Corrected type "${correctedType}"`,
      );

      return transformedData;
    } catch (error) {
      console.error('Error transforming cohort data:', error);
      throw error;
    }
  }

  async transformCourseData(data: CourseEnrollmentData) {
    return data;
  }

  async transformAttendanceData(data: any): Promise<{
    attendanceData: Partial<AttendanceTracker>;
    dayColumn: string;
    attendanceValue: string;
  }> {
    try {
      // Parse the attendance date
      const attendanceDate = new Date(data.attendanceDate);
      const year = attendanceDate.getFullYear();
      const month = attendanceDate.getMonth() + 1; // getMonth() returns 0-11
      const day = attendanceDate.getDate();

      // Format day as two-digit string for column mapping
      const dayColumn = `day${day.toString().padStart(2, '0')}`;

      const dayAttendance = {
        scope: data.scope,
        remark: data.remark,
        lateMark: data.lateMark,
        latitude: data.latitude,
        longitude: data.longitude,
        attendance: data.attendance,
        absentReason: data.absentReason,
        validLocation: data.validLocation,
        ...data.metaData,
      };

      const transformedData: Partial<AttendanceTracker> = {
        tenantId: data.tenantId,
        context: data.context,
        contextId: data.contextId,
        userId: data.userId,
        year,
        month,
        [dayColumn]: dayAttendance,
      };
      return {
        attendanceData: transformedData,
        dayColumn: dayColumn,
        attendanceValue: data.attendance,
      };
    } catch (error) {
      console.error('Error transforming attendance data:', error);
      throw error;
    }
  }

  // Keep the old method for backward compatibility if needed
  async transformDailyAttendanceData(data: AttendanceEventData) {
    try {
      const transformedData: Partial<DailyAttendanceReport> = {
        attendanceId: data.attendanceId,
        userId: data.userId,
        cohortId: data.contextId || data.cohortId,
        context: data.context,
        date: data.attendanceDate ? new Date(data.attendanceDate) : new Date(),
        status: data.attendance || data.status,
        metadata: data.metaData || data.metadata,
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
      };
      return transformedData;
    } catch (error) {
      console.error('Error transforming daily attendance data:', error);
      throw error;
    }
  }

  async transformAssessmentTrackerData(data: AssessmentTrackingData): Promise<{
    assessmentData: Partial<AssessmentTracker>;
    scoreDetails: AssessmentScoreData[];
  }> {
    try {
      // Debug the incoming data to identify which field has the problematic value

      const transformedData: Partial<AssessmentTracker> = {
        assessTrackingId: data.assessmentTrackingId,
        assessmentId: data.contentId || data.courseId,
        courseId: data.courseId,
        assessmentName: data.assessmentName,
        userId: data.userId,
        tenantId: data.tenantId,
        totalMaxScore: data.totalMaxScore,
        totalScore: data.totalScore,
        timeSpent: parseFloat(String(data.timeSpent)),
        assessmentSummary: JSON.stringify(data.assessmentSummary),
        attemptId: data.attemptId, // Use attemptId from source data
        assessmentType: data.assessmentType,
        evaluatedBy: (data as any).evaluatedBy || undefined,
      };

      const scoreDetails = data.scores || [];

      return {
        assessmentData: transformedData,
        scoreDetails: scoreDetails,
      };
    } catch (error) {
      console.error('Error transforming assessment tracker data:', error);
      throw error;
    }
  }

  async transformCourseTrackerData(
    data: any,
    courseName: string,
  ): Promise<Partial<CourseTracker>> {
    try {
      const transformedData: Partial<CourseTracker> = {
        userId: data.userId,
        tenantId: data.tenantId,
        courseId: data.courseId,
        courseName: courseName,
        courseTrackingStatus: data.status,
        certificateId: data.certificateId || null,
        courseTrackingStartDate: data.createdOn
          ? new Date(data.createdOn)
          : undefined,
        courseTrackingEndDate: data.completedOn
          ? new Date(data.completedOn)
          : undefined,
      };

      return transformedData;
    } catch (error) {
      console.error('Error transforming course tracker data:', error);
      throw error;
    }
  }

  async transformContentTrackerData(
    data: any,
    contentName: string,
  ): Promise<Partial<ContentTracker>> {
    try {
      // Determine content tracking status based on details array
      let contentTrackingStatus = 'inprogress'; // default
      let totalTimeSpent = 0;

      if (data.details && Array.isArray(data.details)) {
        // Calculate total time spent
        totalTimeSpent = data.details.reduce((total, detail) => {
          return total + (detail.duration || 0);
        }, 0);

        // Determine status based on eid values
        const hasStart = data.details.some((detail) => detail.eid === 'START');
        const hasEnd = data.details.some((detail) => detail.eid === 'END');

        if (hasEnd) {
          contentTrackingStatus = 'completed';
        } else if (hasStart) {
          contentTrackingStatus = 'started';
        }
      }

      const transformedData: Partial<ContentTracker> = {
        contentTrackerId: data.contentTrackingId,
        userId: data.userId,
        tenantId: data.tenantId,
        contentId: data.contentId,
        courseId: data.courseId,
        contentName: contentName,
        contentType: data.contentType,
        contentTrackingStatus: contentTrackingStatus,
        timeSpent: totalTimeSpent, // Round to nearest integer
        createdAt: data.createdOn ? new Date(data.createdOn) : new Date(),
        updatedAt: data.updatedOn ? new Date(data.updatedOn) : new Date(),
      };

      return transformedData;
    } catch (error) {
      throw error;
    }
  }

  async transformRegistrationTrackerData(
    data: UserEventData,
  ): Promise<Partial<RegistrationTracker>[]> {
    try {
      const registrationTrackers: Partial<RegistrationTracker>[] = [];

      // Extract platform registration date from user creation
      const platformRegnDate = data.createdAt
        ? new Date(data.createdAt)
        : new Date();

      // Process each tenant data to create registration tracker entries
      if (data.tenantData && Array.isArray(data.tenantData)) {
        for (const tenant of data.tenantData) {
          // Check if roles array exists and is an array
          if (tenant.roles && Array.isArray(tenant.roles)) {
            for (const role of tenant.roles) {
              const registrationTracker: Partial<RegistrationTracker> = {
                userId: data.userId,
                roleId: role.roleId,
                tenantId: tenant.tenantId,
                platformRegnDate: platformRegnDate,
                tenantRegnDate: platformRegnDate, // Same as platform date for new registrations
                isActive: true,
                // Include reason if provided (from tenant, role, or data level)
                reason:
                  (tenant as any).reason ||
                  (role as any).reason ||
                  (data as any).reason ||
                  undefined,
              };
              registrationTrackers.push(registrationTracker);
            }
          }
        }
      }

      return registrationTrackers;
    } catch (error) {
      console.error('Error transforming registration tracker data:', error);
      throw error;
    }
  }

  /**
   * Transform external course data to Course entity format
   */
  async transformExternalCourseData(
    data: ExternalCourseData,
  ): Promise<Partial<Course>> {
    try {
      // Validate required fields
      if (!data.identifier) {
        throw new Error('Course identifier is required');
      }

      // Transform date fields
      const transformDate = (
        dateValue: string | Date | null | undefined,
      ): Date | null => {
        if (!dateValue) return null;

        if (typeof dateValue === 'string') {
          const parsed = new Date(dateValue);
          return isNaN(parsed.getTime()) ? null : parsed;
        }

        if (dateValue instanceof Date) {
          return isNaN(dateValue.getTime()) ? null : dateValue;
        }

        return null;
      };

      // Transform text fields to handle arrays and objects
      const transformText = (value: any): string | null => {
        if (!value) return null;

        if (typeof value === 'string') return value;
        if (typeof value === 'number') return value.toString();
        if (Array.isArray(value)) return value.join(', ');
        if (typeof value === 'object') return JSON.stringify(value);

        return null;
      };

      const transformedData: Partial<Course> = {
        identifier: data.identifier,
        name: data.name || null,
        author: data.author || null,
        primaryuser: data.primaryuser || null,
        contentlanguage: data.contentlanguage || null,
        status: data.status || null,
        targetagegroup: data.targetagegroup || null,
        childnodes: transformText(data.childnodes),
        keywords: transformText(data.keywords),
        channel: data.channel || null,
        lastpublishedon: transformDate(data.lastpublishedon),
        createdby: data.createdby || null,
        program: data.program || null,
        audience: data.audience || null,
        description: data.description || null,
      };
      return transformedData;
    } catch (error) {
      console.error('Error transforming course data:', error, {
        identifier: data.identifier,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Transform external question set data to QuestionSet entity format
   */
  // async transformQuestionSetData(data: ExternalQuestionSetData): Promise<Partial<QuestionSet>> {
  //   try {
  //     // Validate required fields
  //     if (!data.identifier) {
  //       throw new Error('QuestionSet identifier is required');
  //     }

  //     // Transform date fields
  //     const transformDate = (dateValue: string | Date | null | undefined): Date | null => {
  //       if (!dateValue) return null;
        
  //       if (typeof dateValue === 'string') {
  //         const parsed = new Date(dateValue);
  //         return isNaN(parsed.getTime()) ? null : parsed;
  //       }
        
  //       if (dateValue instanceof Date) {
  //         return isNaN(dateValue.getTime()) ? null : dateValue;
  //       }
        
  //       return null;
  //     };

  //     // Transform text fields to handle arrays and objects
  //     const transformText = (value: any): string | null => {
  //       if (!value) return null;
        
  //       if (typeof value === 'string') return value;
  //       if (typeof value === 'number') return value.toString();
  //       if (Array.isArray(value)) return value.join(', ');
  //       if (typeof value === 'object') return JSON.stringify(value);
        
  //       return null;
  //     };

  //     // Handle different field name variations from API
  //     const getFieldValue = (primaryField: any, alternativeField?: any): any => {
  //       return primaryField || alternativeField || null;
  //     };

  //     const transformedData: Partial<QuestionSet> = {
  //       identifier: data.identifier,
  //       name: data.name || null,
  //       childNodes: transformText(getFieldValue(data.childNodes)),
  //       createdOn: transformDate(getFieldValue(data.createdOn)),
  //       program: transformText(getFieldValue(data.program)),
  //       assessmentType: data.assessmentType || null,
  //       contentLanguage: transformText(getFieldValue(data.contentLanguage, data.language)),
  //     };

  //     return transformedData;
  //   } catch (error) {
  //     console.error('Error transforming question set data:', error, {
  //       identifier: data.identifier,
  //       error: error.message,
  //     });
  //     throw error;
  //   }
  // }

  // ...existing code...
  /**
   * Transform external question set data to QuestionSet entity format
   */
  async transformQuestionSetData(data: ExternalQuestionSetData): Promise<Partial<QuestionSet>> {
    try {
      // Validate required fields
      if (!data.identifier) {
        throw new Error('QuestionSet identifier is required');
      }

      // Transform date fields
      const transformDate = (
        dateValue: string | Date | null | undefined,
      ): Date | null => {
        if (!dateValue) return null;

        if (typeof dateValue === 'string') {
          const parsed = new Date(dateValue);
          return isNaN(parsed.getTime()) ? null : parsed;
        }

        if (dateValue instanceof Date) {
          return isNaN(dateValue.getTime()) ? null : dateValue;
        }

        return null;
      };

      // Transform text fields to handle arrays and objects
      const transformText = (value: any): string | null => {
        if (value === undefined || value === null) return null;

        if (typeof value === 'string') return value;
        if (typeof value === 'number') return value.toString();
        if (Array.isArray(value)) return value.join(', ');
        if (typeof value === 'object') return JSON.stringify(value);

        return null;
      };

      // Handle different field name variations from API
      const getFieldValue = (primaryField: any, alternativeField?: any): any => {
        return primaryField ?? alternativeField ?? null;
      };

      const transformedData = {
        identifier: data.identifier,
        name: data.name || null,
        childNodes: transformText(getFieldValue(data.childNodes)),
        createdOn: transformDate(getFieldValue(data.createdOn)),
        program: transformText(getFieldValue(data.program)),
        assessmentType: data.assessmentType || null,
        contentLanguage: transformText(getFieldValue(data.contentLanguage, data.language)),
        // Added status mapping (supports variations like data.status or data.workflowStatus)
        status: data.status,
      };

      return transformedData;
    } catch (error) {
      console.error('Error transforming question set data:', error, {
        identifier: (data && (data as any).identifier) || undefined,
        error: error.message,
      });
      throw error;
    }
  }
// ...existing code...

  /**
   * Transform external content data to Content entity format
   */
  async transformContentData(
    data: ExternalContentData,
  ): Promise<Partial<Content>> {
    try {
      // Validate required fields
      if (!data.identifier) {
        throw new Error('Content identifier is required');
      }

      // Transform date fields
      const transformDate = (
        dateValue: string | Date | null | undefined,
      ): Date | null => {
        if (!dateValue) return null;

        if (typeof dateValue === 'string') {
          const parsed = new Date(dateValue);
          return isNaN(parsed.getTime()) ? null : parsed;
        }

        if (dateValue instanceof Date) {
          return isNaN(dateValue.getTime()) ? null : dateValue;
        }

        return null;
      };

      // Transform text fields to handle arrays and objects
      const transformText = (value: any): string | null => {
        if (!value) return null;

        if (typeof value === 'string') return value;
        if (typeof value === 'number') return value.toString();
        if (Array.isArray(value)) return value.join(', ');
        if (typeof value === 'object') return JSON.stringify(value);

        return null;
      };

      const transformedData: Partial<Content> = {
        identifier: data.identifier,
        name: data.name || null,
        author: data.author || null,
        primaryCategory: data.primaryCategory || null,
        channel: data.channel || null,
        status: data.status || null,
        contentType: data.contentType || null,
        contentLanguage: transformText(data.contentLanguage),
        domains: transformText(data.domains),
        subdomains: transformText(data.subdomains),
        subjects: transformText(data.subjects),
        targetAgeGroup: transformText(data.targetAgeGroup),
        audience: transformText(data.audience),
        program: transformText(data.program),
        keywords: transformText(data.keywords),
        description: data.description || null,
        createdBy: data.createdBy || null,
        lastPublishedOn: transformDate(data.lastPublishedOn),
        createdOn: transformDate(data.createdOn),
      };

      return transformedData;
    } catch (error) {
      console.error('Error transforming content data:', error, {
        identifier: data.identifier,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Transform project data from Kafka event to Project entity format
   */
  async transformProjectData(data: any): Promise<Partial<Project>> {
    try {
      // Validate required fields
      if (!data.solution?.solutionId) {
        throw new Error('Solution ID is required');
      }
      if (!data.projectTemplate) {
        throw new Error('Project template is required');
      }

      // Helper to safely parse dates
      const parseDate = (dateValue: any): Date | null => {
        if (!dateValue) return null;
        try {
          const parsed = new Date(dateValue);
          return isNaN(parsed.getTime()) ? null : parsed;
        } catch (error) {
          console.warn(`Failed to parse date: ${dateValue}`);
          return null;
        }
      };

      const transformedData: Partial<Project> = {
        // ProjectId <- solutionId
        ProjectId: data.solution.solutionId,

        // ProjectName <- projectTemplate.title
        ProjectName: data.projectTemplate.title || null,

        // Board <- projectTemplate.metaData.board
        Board: data.projectTemplate.metaData?.board || null,

        // Medium <- projectTemplate.metaData.medium
        Medium: data.projectTemplate.metaData?.medium || null,

        // Subject <- projectTemplate.metaData.subject
        Subject: data.projectTemplate.metaData?.subject || null,

        // Grade <- projectTemplate.metaData.class
        Grade: data.projectTemplate.metaData?.class || null,

        // Type <- projectTemplate.metaData.type
        Type: data.projectTemplate.metaData?.type || null,

        // StartDate <- program.startDate
        StartDate: parseDate(data.program?.startDate),

        // EndDate <- program.endDate
        EndDate: parseDate(data.program?.endDate),

        // CreatedBy <- null (as per mapping)
        CreatedBy: null,

        // TenantId and AcademicYear are default - no need to handle
      };

      console.log(
        `[TransformService] Transformed project data: ProjectId=${transformedData.ProjectId}, ProjectName=${transformedData.ProjectName}`,
      );

      return transformedData;
    } catch (error) {
      console.error('Error transforming project data:', error);
      throw error;
    }
  }

  /**
   * Transform project tasks data from Kafka event to ProjectTask entity format
   */
  async transformProjectTasksData(data: any): Promise<Partial<ProjectTask>[]> {
    try {
      // Validate required fields
      if (!data.solution?.solutionId) {
        throw new Error('Solution ID is required for project tasks');
      }
      if (
        !data.projectTemplateTasks ||
        !Array.isArray(data.projectTemplateTasks)
      ) {
        throw new Error('Project template tasks array is required');
      }

      const projectId = data.solution.solutionId;
      const tasks = data.projectTemplateTasks;

      // Build a map of externalId -> _id for parent lookups
      const externalIdToIdMap: Record<string, string> = {};
      tasks.forEach((task: any) => {
        if (task.externalId && task._id) {
          externalIdToIdMap[task.externalId] = task._id;
        }
      });

      // Helper to safely parse dates
      const parseDate = (dateValue: any): Date | null => {
        if (!dateValue) return null;
        try {
          const parsed = new Date(dateValue);
          return isNaN(parsed.getTime()) ? null : parsed;
        } catch (error) {
          console.warn(`Failed to parse date: ${dateValue}`);
          return null;
        }
      };

      // Transform each task
      const transformedTasks: Partial<ProjectTask>[] = tasks.map(
        (task: any) => {
          // Determine ParentId by looking up the _id of the parent task
          let parentId: string | null = null;
          if (task.parentTaskId) {
            // parentTaskId contains the externalId of the parent
            parentId = externalIdToIdMap[task.parentTaskId] || null;
          }

          const transformedTask: Partial<ProjectTask> = {
            // ProjectTaskId <- task._id
            ProjectTaskId: task._id,

            // ProjectId <- solutionId
            ProjectId: projectId,

            // TaskName <- task.name
            TaskName: task.name || null,

            // ParentId <- _id of the parent task (looked up via parentTaskId -> externalId mapping)
            ParentId: parentId,

            // StartDate <- task.startDate
            StartDate: parseDate(task.startDate),

            // EndDate <- task.endDate
            EndDate: parseDate(task.endDate),

            // LearningResource <- task.learningResources (as JSON)
            LearningResource: task.learningResources || null,

            // CreatedBy <- null
            CreatedBy: null,

            // UpdatedBy <- null
            UpdatedBy: null,

            // CreatedAt and UpdatedAt will use database defaults
          };

          return transformedTask;
        },
      );

      console.log(
        `[TransformService] Transformed ${transformedTasks.length} project tasks for ProjectId=${projectId}`,
      );

      return transformedTasks;
    } catch (error) {
      console.error('Error transforming project tasks data:', error);
      throw error;
    }
  }

  /**
   * Transform project task update data from direct message to ProjectTask entity format
   * Handles both parent tasks and nested children
   */
  async transformProjectTaskUpdateData(
    data: any,
  ): Promise<Partial<ProjectTask>[]> {
    try {
      // Validate required fields
      if (!data.solutionId) {
        throw new Error('Solution ID is required for project task update');
      }
      if (!data.tasks || !Array.isArray(data.tasks)) {
        throw new Error('Tasks array is required');
      }

      const projectId = data.solutionId;
      const allTasks: Partial<ProjectTask>[] = [];

      console.log(
        `[TransformService] Processing project task update for ProjectId=${projectId}, total parent tasks=${data.tasks.length}`,
      );

      // Helper to safely parse dates (handles DD-MM-YYYY format)
      const parseDate = (dateValue: any): Date | null => {
        if (!dateValue) return null;
        try {
          // Check if it's a DD-MM-YYYY format string
          if (typeof dateValue === 'string' && dateValue.includes('-')) {
            const parts = dateValue.split('-');
            if (parts.length === 3) {
              const day = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10);
              const year = parseInt(parts[2], 10);

              // Validate the parts
              if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                // Create date with month-1 (JavaScript months are 0-indexed)
                const parsed = new Date(year, month - 1, day);
                return isNaN(parsed.getTime()) ? null : parsed;
              }
            }
          }

          // Fallback to standard Date parsing
          const parsed = new Date(dateValue);
          return isNaN(parsed.getTime()) ? null : parsed;
        } catch (error) {
          return null;
        }
      };

      // Process each parent task and its children
      for (const task of data.tasks) {
        // Skip tasks without referenceId
        if (!task.referenceId) {
          console.warn(
            `[TransformService] Skipping task without referenceId: ${task.name || task._id}`,
          );
          continue;
        }

        // Extract dates from metaInformation if available, otherwise from task directly
        const startDate = parseDate(
          task.metaInformation?.startDate || task.startDate,
        );
        const endDate = parseDate(
          task.metaInformation?.endDate || task.endDate,
        );

        // Transform parent task
        const parentTask: Partial<ProjectTask> = {
          ProjectTaskId: task.referenceId, // Use referenceId for matching
          ProjectId: projectId,
          TaskName: task.name || null,
          ParentId: null, // Parent tasks have no parent
          StartDate: startDate,
          EndDate: endDate,
          LearningResource: task.learningResources || null,
          CreatedBy: task.createdBy || null,
          UpdatedBy: task.updatedBy || null,
        };
        allTasks.push(parentTask);

        // Process children if they exist
        if (task.children && Array.isArray(task.children)) {
          for (const child of task.children) {
            // Skip children without referenceId
            if (!child.referenceId) {
              console.warn(
                `[TransformService] Skipping child task without referenceId: ${child.name || child._id}`,
              );
              continue;
            }

            // Extract dates from child's metaInformation
            const childStartDate = parseDate(
              child.metaInformation?.startDate || child.startDate,
            );
            const childEndDate = parseDate(
              child.metaInformation?.endDate || child.endDate,
            );

            const childTask: Partial<ProjectTask> = {
              ProjectTaskId: child.referenceId, // Use referenceId for matching
              ProjectId: projectId,
              TaskName: child.name || null,
              ParentId: task.referenceId, // Reference parent by referenceId
              StartDate: childStartDate,
              EndDate: childEndDate,
              LearningResource: child.learningResources || null,
              CreatedBy: child.createdBy || null,
              UpdatedBy: child.updatedBy || null,
            };
            allTasks.push(childTask);
          }
        }
      }

      console.log(
        `[TransformService] Transformed ${allTasks.length} tasks (including children) for ProjectId=${projectId}`,
      );

      return allTasks;
    } catch (error) {
      console.error('Error transforming project task update data:', error);
      throw error;
    }
  }

  /**
   * Transform project sync data to ProjectTaskTracking records
   * Only processes tasks with status === 'completed'
   */
  async transformProjectTaskTrackingData(
    data: any,
  ): Promise<Partial<ProjectTaskTracking>[]> {
    try {
      // Validate required fields
      if (!data.solutionId) {
        throw new Error('Solution ID is required for project task tracking');
      }
      if (!data.tasks || !Array.isArray(data.tasks)) {
        throw new Error('Tasks array is required');
      }

      const projectId = data.solutionId;
      const cohortId = data.entityId || null;
      const trackingRecords: Partial<ProjectTaskTracking>[] = [];

      console.log(
        `[TransformService] Processing project task tracking for ProjectId=${projectId}, total tasks=${data.tasks.length}`,
      );

      // Iterate through each task
      for (const task of data.tasks) {
        // Check if parent task is completed
        if (task.status?.toLowerCase() === 'completed' && task.referenceId) {
          const trackingRecord: Partial<ProjectTaskTracking> = {
            ProjectTaskTrackingId: uuidv4(), // Generate unique ID
            ProjectId: projectId,
            ProjectTaskId: task.referenceId, // Use referenceId as the task identifier
            CohortId: cohortId,
            CreatedBy: task.updatedBy || null,
            UpdatedBy: task.updatedBy || null,
          };

          trackingRecords.push(trackingRecord);

          console.log(
            `[TransformService] Added parent task: ${task.name} (referenceId=${task.referenceId})`,
          );
        }

        // Check children tasks if they exist
        if (task.children && Array.isArray(task.children)) {
          for (const child of task.children) {
            if (
              child.status?.toLowerCase() === 'completed' &&
              child.referenceId
            ) {
              const childTrackingRecord: Partial<ProjectTaskTracking> = {
                ProjectTaskTrackingId: uuidv4(), // Generate unique ID
                ProjectId: projectId,
                ProjectTaskId: child.referenceId, // Use child's referenceId
                CohortId: cohortId,
                CreatedBy: child.updatedBy || null,
                UpdatedBy: child.updatedBy || null,
              };

              trackingRecords.push(childTrackingRecord);

              console.log(
                `[TransformService] Added child task: ${child.name} (referenceId=${child.referenceId})`,
              );
            }
          }
        }
      }

      console.log(
        `[TransformService] Transformed ${trackingRecords.length} completed task tracking records for ProjectId=${projectId}`,
      );

      return trackingRecords;
    } catch (error) {
      console.error('Error transforming project task tracking data:', error);
      throw error;
    }
  }
}
