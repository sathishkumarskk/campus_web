export type UserRole = 'student' | 'admin';
export type VerificationMethod = 'domain_email' | 'admin_id_review' | null;

export interface NotificationPrefs {
  flat_requests: boolean;
  flatmate_matches: boolean;
  book_requests: boolean;
  messages: boolean;
}

export interface PrivacyPrefs {
  show_profile_in_flatmates: boolean;
  show_semester: boolean;
  allow_connection_requests: boolean;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  age: number | null;
  gender: 'male' | 'female' | 'non_binary' | 'prefer_not_to_say' | null;
  college_name: string;
  college_domain: string | null;
  course: string;
  department: string;
  semester: number | null;
  city: string;
  bio: string;
  avatar_url: string | null;
  avatar_storage_path: string | null;
  college_verified: boolean;
  verification_method: VerificationMethod;
  role: UserRole;
  is_suspended: boolean;
  suspension_reason: string | null;
  notification_prefs: NotificationPrefs;
  privacy_prefs: PrivacyPrefs;
  created_at: string;
  updated_at: string;
}

export interface ProfilePrivateContacts {
  user_id: string;
  phone_number: string;
  whatsapp_number: string;
  preferred_contact_hours: string;
  updated_at: string;
}

export type HuntStatus = 'seeking_flat_and_flatmate' | 'have_flat_need_flatmate' | 'not_looking';
export type DietPreference = 'vegetarian' | 'eggetarian' | 'non_vegetarian' | 'vegan';
export type SleepSchedule = 'early_riser' | 'night_owl' | 'flexible';
export type CleanlinessLevel = 'very_tidy' | 'tidy' | 'relaxed';
export type SmokingPreference = 'no' | 'outside_only' | 'yes';
export type AlcoholPreference = 'no' | 'socially' | 'yes';
export type StudyHabit = 'quiet_hours' | 'library_studier' | 'collaborative' | 'flexible';
export type GuestPolicy = 'no_overnight' | 'occasional' | 'weekends_ok' | 'open';

export interface StudentPreferences {
  user_id: string;
  hunt_status: HuntStatus;
  headline: string;
  budget_min: number;
  budget_max: number;
  preferred_city: string;
  preferred_localities: string[];
  move_in_date: string | null;
  diet: DietPreference;
  sleep_schedule: SleepSchedule;
  cleanliness: CleanlinessLevel;
  smoking: SmokingPreference;
  alcohol: AlcoholPreference;
  study_habit: StudyHabit;
  guest_policy: GuestPolicy;
  hobbies: string[];
  book_interests: string[];
  updated_at: string;
}

export interface CollegeVerificationRequest {
  id: string;
  user_id: string;
  college_name: string;
  college_email: string | null;
  student_roll_number: string;
  id_card_storage_path: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_id: string | null;
  review_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  user?: Profile;
}

export type PropertyType = 'apartment' | 'independent_house' | 'pg_hostel' | 'studio';
export type RoomType = 'private_room' | 'shared_room' | 'entire_flat' | 'studio_1rk';
export type GenderPreference = 'any' | 'male_only' | 'female_only';
export type AccommodationStatus = 'draft' | 'published' | 'occupied' | 'removed';

export interface AccommodationImage {
  id: string;
  listing_id: string;
  storage_path: string;
  public_url: string;
  display_order: number;
  created_at: string;
}

export interface AccommodationListing {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  property_type: PropertyType;
  room_type: RoomType;
  gender_preference: GenderPreference;
  rent_monthly: number;
  deposit_amount: number;
  city: string;
  locality: string;
  address_line: string;
  nearby_college: string;
  distance_km: number | null;
  transport_note: string;
  available_from: string;
  spots_total: number;
  spots_available: number;
  amenities: string[];
  house_rules: string[];
  status: AccommodationStatus;
  created_at: string;
  updated_at: string;
  owner?: Profile;
  images?: AccommodationImage[];
}

export type FlatRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface FlatRequest {
  id: string;
  listing_id: string;
  requester_id: string;
  owner_id: string;
  preferred_move_in: string;
  message: string;
  owner_response: string | null;
  status: FlatRequestStatus;
  created_at: string;
  updated_at: string;
  listing?: AccommodationListing;
  requester?: Profile;
  owner?: Profile;
}

export type ConnectionStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface FlatmateConnection {
  id: string;
  sender_id: string;
  receiver_id: string;
  intro_message: string;
  compatibility_score: number;
  status: ConnectionStatus;
  created_at: string;
  updated_at: string;
  sender?: Profile;
  receiver?: Profile;
}

export type BookCondition = 'new' | 'good' | 'fair' | 'marked' | 'worn';
export type BookListingType = 'free_donation' | 'exchange';
export type BookAvailabilityStatus = 'draft' | 'available' | 'reserved' | 'completed' | 'removed';

export interface BookListing {
  id: string;
  donor_id: string;
  title: string;
  author: string;
  edition: string;
  isbn: string;
  course_code: string;
  department: string;
  semester: number;
  subject: string;
  condition: BookCondition;
  condition_score: number;
  listing_type: BookListingType;
  exchange_terms: string | null;
  description: string;
  city: string;
  college_name: string;
  preferred_pickup_spot: string;
  photo_urls: string[];
  photo_paths: string[];
  availability_status: BookAvailabilityStatus;
  created_at: string;
  updated_at: string;
  donor?: Profile;
}

export type BookRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'reserved'
  | 'handover_scheduled'
  | 'completed'
  | 'cancelled';

export interface BookRequest {
  id: string;
  book_id: string;
  requester_id: string;
  donor_id: string;
  message: string;
  proposed_spot: string;
  proposed_time: string;
  agreed_exchange_note: string | null;
  status: BookRequestStatus;
  donor_confirmed: boolean;
  requester_confirmed: boolean;
  handover_scheduled_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  book?: BookListing;
  requester?: Profile;
  donor?: Profile;
}

export interface SavedItem {
  id: string;
  user_id: string;
  item_type: 'flat' | 'book';
  flat_id: string | null;
  book_id: string | null;
  created_at: string;
  flat?: AccommodationListing;
  book?: BookListing;
}

export interface Conversation {
  id: string;
  participant_one: string;
  participant_two: string;
  context_type: 'flatmate_connection' | 'flat_request' | 'book_request';
  context_id: string;
  context_title: string;
  last_message_preview: string;
  last_message_at: string;
  created_at: string;
  peer?: Profile;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export type NotificationCategory =
  | 'flat_request'
  | 'flatmate_match'
  | 'book_request'
  | 'handover'
  | 'message'
  | 'moderation'
  | 'verification';

export interface AppNotification {
  id: string;
  user_id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  action_path: string;
  is_read: boolean;
  created_at: string;
}

export interface UserBlock {
  id: string;
  blocker_id: string;
  blocked_id: string;
  reason: string;
  created_at: string;
  blocked_user?: Profile;
}

export type ReportTargetType = 'user' | 'flat_listing' | 'book_listing' | 'message';
export type ReportCategory =
  | 'broker_spam'
  | 'paid_book_violation'
  | 'fake_listing'
  | 'harassment'
  | 'unsafe_behavior'
  | 'inaccurate_info'
  | 'other';

export interface UserReport {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_user_id: string | null;
  target_flat_id: string | null;
  target_book_id: string | null;
  category: ReportCategory;
  description: string;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  resolution_notes: string | null;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
  reporter?: Profile;
  target_user?: Profile;
}

export type ModerationActionType =
  | 'approve_verification'
  | 'reject_verification'
  | 'remove_flat_listing'
  | 'restore_flat_listing'
  | 'remove_book_listing'
  | 'restore_book_listing'
  | 'suspend_user'
  | 'restore_user'
  | 'resolve_report'
  | 'dismiss_report';

export interface ModerationAction {
  id: string;
  admin_id: string;
  action_type: ModerationActionType;
  target_user_id: string | null;
  target_entity_id: string | null;
  reason: string;
  metadata: Record<string, unknown>;
  created_at: string;
  admin?: Profile;
}
