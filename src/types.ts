export type Role = "parent" | "child";

export type ChoreStatus = "pending" | "in_progress" | "submitted" | "redo" | "approved";

export type RepeatInterval = "none" | "daily" | "weekly" | "monthly";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ChoreSchedule = {
  weekdays: Weekday[];
  hour: number;
  minute: number;
  timezone?: string;
};

export type WeeklyConsistency = {
  weekKey: string;
  completedDays: string[];
  goalDays: number;
  bonusPoints: number;
  bonusAwarded: boolean;
};

export type Profile = {
  uid: string;
  displayName: string;
  familyCode: string;
  role: Role;
  points?: number;
  pushToken?: string;
  pinnedRewardId?: string | null;
  weeklyConsistency?: WeeklyConsistency;
};

export type FamilyReminderSettings = {
  morningReminderHour: number;
  morningReminderMinute: number;
  finalReminderLeadMinutes: number;
};

export type FamilySettings = {
  familyCode: string;
  reminderSettings: FamilyReminderSettings;
  updatedAt?: any;
  updatedByUid?: string | null;
  updatedByName?: string | null;
};

export type Chore = {
  id: string;
  title: string;
  assignedTo: string;
  assignedToUid?: string | null;
  isBounty?: boolean;
  familyCode: string;
  status: ChoreStatus;
  description?: string;
  photoUrls?: string[];
  completedBy?: string;
  completedByUid?: string | null;
  createdAt?: any;
  completedAt?: any;
  dueAt?: any;
  feedback?: string;
  steps?: string[];
  repeat: RepeatInterval;
  points: number;
  archived?: boolean;
  archivedAt?: any;
  sourceChoreId?: string;
  templateId?: string | null;
  scheduledDate?: string | null;
  required?: boolean;
};

export type ChoreTemplate = {
  id: string;
  title: string;
  description?: string;
  points: number;
  assignedTo: string;
  assignedToUid?: string | null;
  isBounty?: boolean;
  required: boolean;
  familyCode: string;
  steps?: string[];
  schedule: ChoreSchedule;
  nextDueAt?: unknown;
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
  createdByUid?: string;
  createdByName?: string;
};

export type Reward = {
  id: string;
  title: string;
  points: number;
  familyCode: string;
};

export type RedemptionStatus = "pending" | "approved" | "denied";

export type Redemption = {
  id: string;
  rewardId: string;
  rewardTitle: string;
  points: number;
  requesterUid: string;
  requesterName: string;
  familyCode: string;
  status: RedemptionStatus;
  createdAt?: any;
  decidedAt?: any;
  decidedByUid?: string;
  decidedByName?: string;
};

export type PointsLogSource = "manual_adjustment" | "chore_approved" | "redemption" | "weekly_consistency_bonus";

export type PointsLog = {
  id: string;
  familyCode: string;
  memberUid: string;
  memberName: string;
  pointsDelta: number;
  note?: string;
  createdAt?: any;
  createdByUid?: string;
  createdByName?: string;
  source?: PointsLogSource;
  choreId?: string;
};
