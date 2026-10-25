import type {
  BookAvailabilityStatus,
  BookCondition,
  BookListingType,
  BookRequestStatus,
} from '../types/database';

export type BookRequestAction =
  | 'accept'
  | 'decline'
  | 'schedule_handover'
  | 'confirm_handover'
  | 'cancel';

export const CONDITION_METADATA: Record<
  BookCondition,
  { label: string; score: number; description: string }
> = {
  new: { label: 'Like New', score: 5, description: 'Crisp pages, zero markings' },
  good: { label: 'Good condition', score: 4, description: 'Clean cover, minimal notes' },
  fair: { label: 'Fair condition', score: 3, description: 'Light shelf wear, readable' },
  marked: { label: 'Highlighted / Marked', score: 2, description: 'Underlined notes inside' },
  worn: { label: 'Well Used', score: 1, description: 'Intact syllabus pages, heavy wear' },
};

export function isActiveBookReservationStatus(status: BookRequestStatus): boolean {
  return (
    status === 'accepted' ||
    status === 'reserved' ||
    status === 'handover_scheduled'
  );
}

export function canPerformBookRequestAction(params: {
  actorId: string;
  donorId: string;
  requesterId: string;
  currentStatus: BookRequestStatus;
  bookAvailability: BookAvailabilityStatus;
  action: BookRequestAction;
  donorConfirmed?: boolean;
  requesterConfirmed?: boolean;
}): { allowed: boolean; reason?: string } {
  const {
    actorId,
    donorId,
    requesterId,
    currentStatus,
    bookAvailability,
    action,
    donorConfirmed = false,
    requesterConfirmed = false,
  } = params;

  const isDonor = actorId === donorId;
  const isRequester = actorId === requesterId;

  if (!isDonor && !isRequester) {
    return { allowed: false, reason: 'Only authorized request participants can modify this request.' };
  }

  switch (action) {
    case 'accept': {
      if (!isDonor) {
        return { allowed: false, reason: 'Only the book donor can accept a request.' };
      }
      if (currentStatus !== 'pending') {
        return { allowed: false, reason: 'Only pending requests can be accepted.' };
      }
      if (bookAvailability !== 'available') {
        return { allowed: false, reason: 'This textbook already has an active reservation.' };
      }
      return { allowed: true };
    }

    case 'decline': {
      if (!isDonor) {
        return { allowed: false, reason: 'Only the book donor can decline a request.' };
      }
      if (currentStatus !== 'pending') {
        return { allowed: false, reason: 'Only pending requests can be declined.' };
      }
      return { allowed: true };
    }

    case 'schedule_handover': {
      if (!isActiveBookReservationStatus(currentStatus)) {
        return { allowed: false, reason: 'Book must be reserved before scheduling campus handover.' };
      }
      return { allowed: true };
    }

    case 'confirm_handover': {
      if (!isActiveBookReservationStatus(currentStatus)) {
        return { allowed: false, reason: 'Handover can only be confirmed on an active reserved book.' };
      }
      if (isDonor && donorConfirmed) {
        return { allowed: false, reason: 'You have already confirmed the handover.' };
      }
      if (isRequester && requesterConfirmed) {
        return { allowed: false, reason: 'You have already confirmed the handover.' };
      }
      return { allowed: true };
    }

    case 'cancel': {
      if (
        currentStatus === 'completed' ||
        currentStatus === 'declined' ||
        currentStatus === 'cancelled'
      ) {
        return { allowed: false, reason: 'This request is already closed.' };
      }
      return { allowed: true };
    }

    default:
      return { allowed: false, reason: 'Unsupported action.' };
  }
}

export function validateBookListingPayload(input: {
  title: string;
  author: string;
  department: string;
  semester: number;
  subject: string;
  condition: BookCondition;
  listing_type: BookListingType;
  exchange_terms?: string | null;
  city: string;
  college_name: string;
  preferred_pickup_spot: string;
}): string | null {
  if (!input.title || input.title.trim().length < 2) {
    return 'Please enter the textbook title (at least 2 characters).';
  }
  if (!input.author || input.author.trim().length < 2) {
    return 'Please enter the author name.';
  }
  if (!input.department || input.department.trim().length < 2) {
    return 'Please select or enter the academic department.';
  }
  if (!Number.isInteger(input.semester) || input.semester < 1 || input.semester > 12) {
    return 'Semester must be between 1 and 12.';
  }
  if (!input.subject || input.subject.trim().length < 2) {
    return 'Please enter the subject name.';
  }
  if (!input.city || input.city.trim().length < 2) {
    return 'Please enter the city.';
  }
  if (!input.college_name || input.college_name.trim().length < 2) {
    return 'Please enter your college/campus name.';
  }
  if (!input.preferred_pickup_spot || input.preferred_pickup_spot.trim().length < 2) {
    return 'Please specify a safe campus handover spot (e.g., Main Library, Hostel Gate, Canteen).';
  }
  if (input.listing_type === 'free_donation') {
    if (input.exchange_terms && input.exchange_terms.trim().length > 0) {
      return 'Free Donation listings must be 100% free without exchange conditions.';
    }
  } else if (input.listing_type === 'exchange') {
    if (!input.exchange_terms || input.exchange_terms.trim().length < 3) {
      return 'Exchange listings must clearly state the book or study material requested in swap.';
    }
    const lowerTerms = input.exchange_terms.toLowerCase();
    if (/₹|\brs\.?\s*\d|\brupees\b|\bcash\b|\bupi\b|\bgpay\b|\bpaytm\b/.test(lowerTerms)) {
      return 'Monetary payments are prohibited on BookBridge. Exchange terms may only request books/academic swaps.';
    }
  }
  return null;
}
