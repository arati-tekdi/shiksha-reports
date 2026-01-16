import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'Cohort' })
export class Cohort {
  @PrimaryColumn('uuid', { name: 'CohortID' })
  cohortId: string;

  @Column({ name: 'TenantID', type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ name: 'CohortName', type: 'text', nullable: true })
  cohortName?: string;

  @Column({
    name: 'CreatedOn',
    type: 'timestamp',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdOn?: Date;

  @Column({ name: 'ParentID', type: 'uuid', nullable: true })
  parentId?: string;

  @Column({ name: 'Type', type: 'text', nullable: true })
  type?: string;

  @Column({ name: 'CoStateID', type: 'numeric', nullable: true })
  coStateId?: number;

  @Column({ name: 'CoDistrictID', type: 'numeric', nullable: true })
  coDistrictId?: number;

  @Column({ name: 'CoBlockID', type: 'numeric', nullable: true })
  coBlockId?: number;

  @Column({ name: 'CoVillageID', type: 'numeric', nullable: true })
  coVillageId?: number;

  @Column({ name: 'CoBoard', type: 'text', nullable: true })
  coBoard?: string;

  @Column({ name: 'CoSubject', type: 'text', nullable: true })
  coSubject?: string;

  @Column({ name: 'CoGrade', type: 'text', nullable: true })
  coGrade?: string;

  @Column({ name: 'CoMedium', type: 'text', nullable: true })
  coMedium?: string;

  @Column({ name: 'CoIndustry', type: 'text', nullable: true })
  coIndustry?: string;

  @Column({ name: 'CoGoogleMapLink', type: 'text', nullable: true })
  coGoogleMapLink?: string;

  @Column({ name: 'Status', type: 'text', nullable: true, default: 'active' })
  status?: string;

  @Column({
    name: 'createdAt',
    type: 'timestamptz',
    nullable: false,
    default: () => 'now()',
  })
  createdAt: Date;

  @Column({
    name: 'updatedAt',
    type: 'timestamptz',
    nullable: false,
    default: () => 'now()',
  })
  updatedAt: Date;

  @Column({ name: 'CoProgram', type: 'text', nullable: true })
  coProgram?: string;

  @Column({ name: 'CoCluster', type: 'text', nullable: true })
  coCluster?: string;

  @Column({ name: 'CoLongitude', type: 'text', nullable: true })
  coLongitude?: string;

  @Column({ name: 'CoLatitude', type: 'text', nullable: true })
  coLatitude?: string;

  @Column({ name: 'CoSchoolType', type: 'text', nullable: true })
  coSchoolType?: string;
}
