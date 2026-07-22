export interface AgeGroup {
  id: string;
  label: string;
  minAge: number;
  maxAge: number;
}

export interface Activity {
  id: string;
  providerId: string;
  title: string;
  description: string;
  category: string;
  location: string;
  capacity: number;
  creditCost: number;
  isActive: boolean;
  ageGroup: AgeGroup;
  createdAt: string;
  updatedAt: string;
}

export interface ClassSession {
  id: string;
  activityId: string;
  recurringScheduleId: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  isCancelled: boolean;
}
