export function validateAccommodationPayload(input: {
  title: string;
  rent_monthly: number;
  deposit_amount: number;
  city: string;
  locality: string;
  nearby_college: string;
  available_from: string;
  spots_total: number;
  spots_available: number;
  distance_km?: number | null;
}): string | null {
  if (!input.title || input.title.trim().length < 5) {
    return 'Listing title must be at least 5 characters.';
  }
  if (!Number.isFinite(input.rent_monthly) || input.rent_monthly <= 0 || input.rent_monthly > 200000) {
    return 'Monthly rent must be between ₹1 and ₹2,00,000.';
  }
  if (!Number.isFinite(input.deposit_amount) || input.deposit_amount < 0) {
    return 'Security deposit cannot be negative.';
  }
  if (!input.city || input.city.trim().length < 2) {
    return 'City is required.';
  }
  if (!input.locality || input.locality.trim().length < 2) {
    return 'Locality / neighborhood is required.';
  }
  if (!input.nearby_college || input.nearby_college.trim().length < 2) {
    return 'Nearby college or university name is required.';
  }
  if (!input.available_from || Number.isNaN(Date.parse(input.available_from))) {
    return 'Please select a valid move-in availability date.';
  }
  if (
    !Number.isInteger(input.spots_total) ||
    input.spots_total < 1 ||
    input.spots_total > 10
  ) {
    return 'Total spots must be between 1 and 10.';
  }
  if (
    !Number.isInteger(input.spots_available) ||
    input.spots_available < 0 ||
    input.spots_available > input.spots_total
  ) {
    return 'Available spots must be between 0 and total spots.';
  }
  if (
    input.distance_km !== null &&
    input.distance_km !== undefined &&
    (input.distance_km < 0 || input.distance_km > 50)
  ) {
    return 'Distance to campus must be between 0 and 50 km.';
  }
  return null;
}

export function validateProfilePayload(input: {
  full_name: string;
  college_name: string;
  course: string;
  department: string;
  semester: number | null;
  city: string;
  age?: number | null;
}): string | null {
  if (!input.full_name || input.full_name.trim().length < 2) {
    return 'Full name must be at least 2 characters.';
  }
  if (!input.college_name || input.college_name.trim().length < 2) {
    return 'College / University name is required.';
  }
  if (!input.course || input.course.trim().length < 2) {
    return 'Course (e.g., B.Tech, M.Tech, B.Com) is required.';
  }
  if (!input.department || input.department.trim().length < 2) {
    return 'Department / Branch is required.';
  }
  if (input.semester !== null && (input.semester < 1 || input.semester > 12)) {
    return 'Semester must be between 1 and 12.';
  }
  if (!input.city || input.city.trim().length < 2) {
    return 'City is required.';
  }
  if (input.age !== null && input.age !== undefined && (input.age < 16 || input.age > 60)) {
    return 'Age must be between 16 and 60.';
  }
  return null;
}

export function validateReportPayload(input: {
  category: string;
  description: string;
}): string | null {
  if (!input.category) {
    return 'Please select a report category.';
  }
  if (!input.description || input.description.trim().length < 10) {
    return 'Please provide at least 10 characters describing the safety issue.';
  }
  return null;
}
