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

export interface Plan {
  id: string;
  name: string;
  description: string;
  monthlyCredits: number;
  priceGbp: number;
  isActive: boolean;
}

export interface CreditSummary {
  balance: number;
  plan: { id: string; name: string; monthlyCredits: number } | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
}

export interface Child {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

export type BookingStatus = "CONFIRMED" | "CANCELLED" | "ATTENDED" | "NO_SHOW";

export interface Booking {
  id: string;
  status: BookingStatus;
  creditsSpent: number;
  createdAt: string;
  child: { id: string; firstName: string; lastName: string };
  session: {
    id: string;
    startsAt: string;
    endsAt: string;
    activity: { id: string; title: string; location: string };
  };
}

export interface AttendeeBooking {
  id: string;
  status: BookingStatus;
  child: { id: string; firstName: string; lastName: string };
  parent: { id: string; firstName: string; lastName: string; email: string };
}
