export type Role = "parent" | "child";

export type ChoreStatus = "pending" | "in_progress" | "submitted" | "redo" | "approved";

export type RepeatInterval = "none" | "daily" | "weekly" | "monthly";

export type Profile = {
  uid: string;
  displayName: string;
  familyCode: string;
  role: Role;
  points?: number;
  pushToken?: string;
};

export type Chore = {
  id: string;
  title: string;
  assignedTo: string;
  assignedToUid?: string;
  familyCode: string;
  status: ChoreStatus;
  description?: string;
  photoUrls?: string[];
  completedBy?: string;
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

export type PointsLogSource = "manual_adjustment" | "chore_approved";

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
