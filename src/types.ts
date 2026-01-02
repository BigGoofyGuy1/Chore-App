export type Role = "parent" | "child";

export type ChoreStatus = "pending" | "completed";

export type Profile = {
  displayName: string;
  familyCode: string;
  role: Role;
};

export type Chore = {
  id: string;
  title: string;
  assignedTo: string;
  familyCode: string;
  status: ChoreStatus;
  photoUrl?: string | null;
  completedBy?: string;
  createdAt?: unknown;
  completedAt?: unknown;
};
