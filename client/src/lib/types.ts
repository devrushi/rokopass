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
  isSendFriendly: boolean;
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
    instagramUrl: string | null;
    facebookUrl: string | null;
    tiktokUrl: string | null;
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
  allergyInfo: string | null;
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
  child: { id: string; firstName: string; lastName: string; allergyInfo: string | null };
  parent: { id: string; firstName: string; lastName: string; email: string };
}

export interface PendingBooking {
  id: string;
  status: BookingStatus;
  creditsSpent: number;
  createdAt: string;
  child: { id: string; firstName: string; lastName: string; allergyInfo: string | null };
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
  dbsCertificateNumber: string | null;
  dbsCertificateExpiresAt: string | null;
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

export type PlanAudience = "PARENT" | "PROVIDER";

export interface AdminPlan {
  id: string;
  audience: PlanAudience;
  name: string;
  description: string;
  monthlyCredits: number | null;
  maxActiveActivities: number | null;
  priceGbp: number;
  stripePriceId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderPlan {
  id: string;
  name: string;
  description: string;
  maxActiveActivities: number | null;
  priceGbp: number;
}

export interface AdminParent {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  _count: { children: number; bookings: number };
}

export interface AdminChild {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  createdAt: string;
  parent: { id: string; firstName: string; lastName: string; email: string };
  _count: { bookings: number };
}

export interface AdminBooking {
  id: string;
  status: BookingStatus;
  creditsSpent: number;
  createdAt: string;
  child: { id: string; firstName: string; lastName: string };
  parent: { id: string; firstName: string; lastName: string; email: string };
  session: {
    id: string;
    startsAt: string;
    activity: { id: string; title: string; providerId: string };
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

export interface ParentAnalytics {
  balance: number;
  plan: { id: string; name: string; monthlyCredits: number } | null;
  currentPeriodEnd: string | null;
  creditsUsedLast30Days: number;
  spendingByCategory: { category: string; creditsSpent: number }[];
  childrenAttendance: {
    childId: string;
    firstName: string;
    lastName: string;
    attended: number;
    noShow: number;
    upcoming: number;
  }[];
  upcomingBookings: { id: string; activityTitle: string; childFirstName: string; startsAt: string }[];
}

export interface ProviderAnalytics {
  totalActivities: number;
  bookingsByStatus: Record<string, number>;
  attendanceRatePercent: number | null;
  avgCapacityUtilizationPercent: number | null;
  avgApprovalResponseMinutes: number | null;
  repeatBookingRatePercent: number | null;
  topActivities: { activityId: string; title: string; bookingsCount: number }[];
}

export interface AdminAnalytics {
  users: { parents: number; providers: number; admins: number };
  newSignupsLast30Days: { parents: number; providers: number };
  pendingProvidersCount: number;
  avgProviderApprovalHours: number | null;
  bookingsByStatus: Record<string, number>;
  activeSubscriptions: number;
  flaggedActivitiesCount: number;
  featuredActivitiesCount: number;
  auditLogVolumeLast30Days: number;
  topCategories: { category: string; activityCount: number }[];
}
