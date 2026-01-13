import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'Users' })
export class User {
  @PrimaryColumn('uuid', { name: 'UserID' })
  userId: string;

  @Column({ name: 'UserName', type: 'varchar', length: 100, nullable: true })
  username?: string;

  @Column({
    name: 'UserFullName',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  fullName?: string;

  @Column({ name: 'UserEmail', type: 'varchar', length: 150, nullable: true })
  email?: string;

  @Column({ name: 'UserDoB', type: 'date', nullable: true })
  dob?: string;

  @Column({ name: 'UserMobile', type: 'varchar', length: 20, nullable: true })
  mobile?: string;

  @Column({ name: 'UserGender', type: 'varchar', length: 20, nullable: true })
  gender?: string;

  @Column({
    name: 'UserIsActive',
    type: 'boolean',
    nullable: true,
    default: () => 'true',
  })
  status?: boolean;

  @Column({ name: 'UserStateID', type: 'varchar', length: 50, nullable: true })
  userStateId?: string;

  @Column({
    name: 'UserDistrictID',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  userDistrictId?: string;

  @Column({ name: 'UserBlockID', type: 'varchar', length: 50, nullable: true })
  userBlockId?: string;

  @Column({
    name: 'UserVillageID',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  userVillageId?: string;

  @Column({
    name: 'UserPreferredModeOfLearning',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  userPreferredModeOfLearning?: string;

  @Column({
    name: 'UserMotherName',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  userMotherName?: string;

  @Column({
    name: 'UserWorkDomain',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  userWorkDomain?: string;

  @Column({
    name: 'UserFatherName',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  userFatherName?: string;

  @Column({
    name: 'UserSpouseName',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  userSpouseName?: string;

  @Column({
    name: 'UserPhoneType',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  userPhoneType?: string;

  @Column({
    name: 'UserWhatDoYouWantToBecome',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  userWhatDoYouWantToBecome?: string;

  @Column({ name: 'UserClass', type: 'varchar', length: 50, nullable: true })
  userClass?: string;

  @Column({
    name: 'UserPreferredLanguage',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  userPreferredLanguage?: string;

  @Column({
    name: 'UserParentPhone',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  userParentPhone?: string;

  @Column({
    name: 'UserGuardianRelation',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  userGuardianRelation?: string;

  @Column({
    name: 'UserSubjectTaught',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  userSubjectTaught?: string;

  @Column({
    name: 'UserMaritalStatus',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  userMaritalStatus?: string;

  @Column({ name: 'UserGrade', type: 'varchar', length: 50, nullable: true })
  userGrade?: string;

  @Column({ name: 'UserTrainingCheck', type: 'boolean', nullable: true })
  userTrainingCheck?: boolean;

  @Column({ name: 'UserDropOutReason', type: 'text', nullable: true })
  userDropOutReason?: string;

  @Column({ name: 'UserOwnPhoneCheck', type: 'boolean', nullable: true })
  userOwnPhoneCheck?: boolean;

  @Column({
    name: 'UserEnrollmentNumber',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  userEnrollmentNumber?: string;

  @Column({
    name: 'UserDesignation',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  userDesignation?: string;

  @Column({ name: 'UserBoard', type: 'varchar', length: 100, nullable: true })
  userBoard?: string;

  @Column({ name: 'UserSubject', type: 'varchar', length: 150, nullable: true })
  userSubject?: string;

  @Column({
    name: 'UserMainSubject',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  userMainSubject?: string;

  @Column({ name: 'UserMedium', type: 'varchar', length: 100, nullable: true })
  userMedium?: string;

  @Column({
    name: 'UserGuardianName',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  userGuardianName?: string;

  @Column({
    name: 'CreatedAt',
    type: 'timestamp',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt?: Date;

  @Column({
    name: 'UpdatedAt',
    type: 'timestamp',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt?: Date;

  @Column({ name: 'CreatedBy', type: 'varchar', length: 100, nullable: true })
  createdBy?: string;

  @Column({ name: 'UpdatedBy', type: 'varchar', length: 100, nullable: true })
  updatedBy?: string;

  @Column({
    name: 'UserNumOfChildrenWorkingWith',
    type: 'text',
    nullable: true,
  })
  userNumOfChildrenWorkingWith?: string;

  @Column({
    name: 'JobFamily',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  jobFamily?: string;

  @Column({
    name: 'PSU',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  psu?: string;

  @Column({
    name: 'GroupMembership',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  groupMembership?: string;

  @Column({ name: 'EMPManager', type: 'text', nullable: true })
  empManager?: string;

  @Column({ name: 'ERPUserID', type: 'text', nullable: true })
  erpUserId?: string;

  @Column({
    name: 'IsManager',
    type: 'boolean',
    nullable: true,
    default: false,
  })
  isManager?: boolean;

  @Column({ name: 'UserLastLogin', type: 'timestamptz', nullable: true })
  userLastLogin?: Date;

  @Column({ name: 'UserCustomField', type: 'jsonb', nullable: true })
  userCustomField?: any;

  @Column({ name: 'UserAccessToWhatsApp', type: 'text', nullable: true })
  userAccessToWhatsApp?: string;

  @Column({ name: 'UserProgram', type: 'text', nullable: true })
  userProgram?: string;

  @Column({ name: 'UserDateOfJoining', type: 'date', nullable: true })
  userDateOfJoining?: Date;

  @Column({ name: 'UserTeacherID', type: 'text', nullable: true })
  userTeacherID?: string;

  @Column({ name: 'UserCEFRLevel', type: 'text', nullable: true })
  userCEFRLevel?: string;

  @Column({ name: 'UserSubprograms', type: 'text', nullable: true })
  userSubprograms?: string;

  @Column({ name: 'UserOldTeacherID', type: 'text', nullable: true })
  userOldTeacherID?: string;

  @Column({ name: 'UserRole', type: 'text', nullable: true })
  userRole?: string;

  @Column({ name: 'UserClusterId', type: 'text', nullable: true })
  userClusterId?: string;

  @Column({ name: 'UserSupervisors', type: 'text', nullable: true })
  userSupervisors?: string;

  @Column({ name: 'UserDateOfLeaving', type: 'date', nullable: true })
  userDateOfLeaving?: Date;

  @Column({ name: 'UserReasonForLeaving', type: 'text', nullable: true })
  userReasonForLeaving?: string;

  @Column({ name: 'UserDepartment', type: 'text', nullable: true })
  userDepartment?: string;
}
