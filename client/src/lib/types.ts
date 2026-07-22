export interface AgeGroup {
  id: string;
  label: string;
  minAge: number;
  maxAge: number;
}

export type ActivityMediaType = "ACTIVITY_PHOTO" | "STAFF_PHOTO";

export interface ActivityMedia {
  id: string;
  type: ActivityMediaType;
  url: string;
  caption: string | null;
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
  isFlagged: boolean;
  isFeatured: boolean;
  ageGroup: AgeGroup;
  media: ActivityMedia[];
  createdAt: string;
  updatedAt: string;
}

export interface ActivityWithProviderContact extends Activity {
  provider: {
    id: string;
    firstName: string;
    lastName: string;
    whatsappNumber: string | null;
  };
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

export type BookingStatus =
  | "PENDING_APPROVAL"
  | "CONFIRMED"
  | "CANCELLED"
  | "REJECTED"
  | "ATTENDED"
  | "NO_SHOW";

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

export interface PendingBooking {
  id: string;
  status: BookingStatus;
  creditsSpent: number;
  createdAt: string;
  child: { id: string; firstName: string; lastName: string };
  parent: { id: string; firstName: string; lastName: string; email: string };
  session: {
    id: string;
    startsAt: string;
    activity: { id: string; title: string };
  };
}

export type ProviderVerificationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AdminProvider {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  verificationStatus: ProviderVerificationStatus;
  createdAt: string;
}

export interface AdminActivity extends Activity {
  provider: {
    id: string;
    firstName: string;
    lastName: string;
    verificationStatus: ProviderVerificationStatus | null;
  };
}

export interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  admin: { id: string; firstName: string; lastName: string };
}
