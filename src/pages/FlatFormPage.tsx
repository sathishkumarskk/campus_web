import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  deleteStoragePaths,
  formatSupabaseError,
  supabase,
  uploadAssetToBucket,
  validateUploadFile,
} from '../lib/supabase';
import { validateAccommodationPayload } from '../lib/validators';
import type {
  AccommodationImage,
  AccommodationListing,
  AccommodationStatus,
  GenderPreference,
  PropertyType,
  RoomType,
} from '../types/database';
import { SafetyBanner } from '../components/SafetyBanner';

const AMENITY_OPTIONS = [
  'High-speed Wi-Fi',
  'Attached Bath',
  'Cook Available',
  'AC',
  'Washing Machine',
  'Bike Parking',
  'Fully Furnished',
  '24/7 Power Backup',
  'Security Guard',
  'Study Desk',
  'RO Water',
  'Balcony',
];

const HOUSE_RULE_OPTIONS = [
  'No Smoking Inside',
  'Vegetarian Kitchen',
  'Quiet Study Hours After 11 PM',
  'Daytime Guests Welcome',
  'No Broker / Direct Split',
  'Shared Electricity & Wi-Fi Split',
];

interface DraftPhotoItem {
  id?: string;
  storagePath: string;
  publicUrl: string;
}

export function FlatFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const [loadingExisting, setLoadingExisting] = useState<boolean>(isEditMode);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploadingPhotos, setUploadingPhotos] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('apartment');
  const [roomType, setRoomType] = useState<RoomType>('private_room');
  const [genderPreference, setGenderPreference] = useState<GenderPreference>('any');
  const [rentMonthly, setRentMonthly] = useState<string>('7500');
  const [depositAmount, setDepositAmount] = useState<string>('15000');
  const [city, setCity] = useState<string>(profile?.city || 'Chennai');
  const [locality, setLocality] = useState<string>('');
  const [addressLine, setAddressLine] = useState<string>('');
  const [nearbyCollege, setNearbyCollege] = useState<string>(profile?.college_name || '');
  const [distanceKm, setDistanceKm] = useState<string>('');
  const [transportNote, setTransportNote] = useState<string>('');
  const [availableFrom, setAvailableFrom] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [spotsTotal, setSpotsTotal] = useState<string>('1');
  const [spotsAvailable, setSpotsAvailable] = useState<string>('1');
  const [amenities, setAmenities] = useState<string[]>(['High-speed Wi-Fi']);
  const [houseRules, setHouseRules] = useState<string[]>(['No Broker / Direct Split']);
  const [customRuleInput, setCustomRuleInput] = useState<string>('');
  const [status, setStatus] = useState<AccommodationStatus>('published');

  const [photos, setPhotos] = useState<DraftPhotoItem[]>([]);
  const [removedPhotoPaths, setRemovedPhotoPaths] = useState<string[]>([]);

  useEffect(() => {
    if (!isEditMode || !id || !user) return;

    let active = true;
    (async () => {
      setLoadingExisting(true);
      const { data, error: fetchErr } = await supabase
        .from('accommodation_listings')
        .select('*, images:accommodation_images(*)')
        .eq('id', id)
        .maybeSingle();

      if (!active) return;

      if (fetchErr || !data) {
        showToast({
          variant: 'error',
          title: 'Accommodation listing not found',
        });
        navigate('/flats');
        return;
      }

      const listing = data as AccommodationListing;
      if (listing.owner_id !== user.id) {
        showToast({
          variant: 'error',
          title: 'Unauthorized',
          description: 'You can only edit accommodation listings you created.',
        });
        navigate(`/flats/${listing.id}`);
        return;
      }

      setTitle(listing.title);
      setDescription(listing.description);
      setPropertyType(listing.property_type);
      setRoomType(listing.room_type);
      setGenderPreference(listing.gender_preference);
      setRentMonthly(String(listing.rent_monthly));
      setDepositAmount(String(listing.deposit_amount));
      setCity(listing.city);
      setLocality(listing.locality);
      setAddressLine(listing.address_line || '');
      setNearbyCollege(listing.nearby_college);
      setDistanceKm(
        listing.distance_km !== null && listing.distance_km !== undefined
          ? String(listing.distance_km)
          : ''
      );
      setTransportNote(listing.transport_note || '');
      setAvailableFrom(listing.available_from);
      setSpotsTotal(String(listing.spots_total));
      setSpotsAvailable(String(listing.spots_available));
      setAmenities(listing.amenities || []);
      setHouseRules(listing.house_rules || []);
      setStatus(listing.status === 'removed' ? 'draft' : listing.status);

      const orderedImages = [...(listing.images || [])]
        .sort((a: AccommodationImage, b: AccommodationImage) => a.display_order - b.display_order)
        .map((img: AccommodationImage) => ({
          id: img.id,
          storagePath: img.storage_path,
          publicUrl: img.public_url,
        }));
      setPhotos(orderedImages);
      setLoadingExisting(false);
    })();

    return () => {
      active = false;
    };
  }, [id, isEditMode, navigate, showToast, user]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !user) return;

    if (photos.length + fileList.length > 8) {
      setError('You can upload up to 8 photographs per listing.');
      return;
    }

    setError(null);
    setUploadingPhotos(true);
    try {
      const files: File[] = Array.from(fileList);
      for (const file of files) {
        const validationErr = validateUploadFile(file, false);
        if (validationErr) throw new Error(validationErr);
      }

      const uploaded: DraftPhotoItem[] = [];
      for (const file of files) {
        const res = await uploadAssetToBucket({
          bucket: 'accommodations',
          userId: user.id,
          file,
        });
        uploaded.push({
          storagePath: res.storagePath,
          publicUrl: res.publicUrl,
        });
      }
      setPhotos((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(formatSupabaseError(err, 'Photograph upload failed.'));
    } finally {
      setUploadingPhotos(false);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = (index: number) => {
    const target = photos[index];
    if (!target) return;
    setRemovedPhotoPaths((prev) => [...prev, target.storagePath]);
    setPhotos((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleMovePhoto = (index: number, direction: -1 | 1) => {
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= photos.length) return;
    setPhotos((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(nextIdx, 0, moved);
      return copy;
    });
  };

  const toggleItem = (list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    if (list.includes(value)) {
      setter(list.filter((item) => item !== value));
    } else {
      setter([...list, value]);
    }
  };

  const handleAddCustomRule = () => {
    const trimmed = customRuleInput.trim();
    if (!trimmed) return;
    if (!houseRules.includes(trimmed)) {
      setHouseRules((prev) => [...prev, trimmed]);
    }
    setCustomRuleInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      navigate('/auth?redirect=/flats/new');
      return;
    }

    const parsedRent = Number(rentMonthly);
    const parsedDeposit = Number(depositAmount || '0');
    const parsedTotal = Number(spotsTotal);
    const parsedAvailable = Number(spotsAvailable);
    const parsedDistance = distanceKm.trim() === '' ? null : Number(distanceKm);

    const validationError = validateAccommodationPayload({
      title,
      rent_monthly: parsedRent,
      deposit_amount: parsedDeposit,
      city,
      locality,
      nearby_college: nearbyCollege,
      available_from: availableFrom,
      spots_total: parsedTotal,
      spots_available: parsedAvailable,
      distance_km: parsedDistance,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        owner_id: user.id,
        title: title.trim(),
        description: description.trim(),
        property_type: propertyType,
        room_type: roomType,
        gender_preference: genderPreference,
        rent_monthly: parsedRent,
        deposit_amount: parsedDeposit,
        city: city.trim(),
        locality: locality.trim(),
        address_line: addressLine.trim(),
        nearby_college: nearbyCollege.trim(),
        distance_km: parsedDistance,
        transport_note: transportNote.trim(),
        available_from: availableFrom,
        spots_total: parsedTotal,
        spots_available: parsedAvailable,
        amenities,
        house_rules: houseRules,
        status,
      };

      let savedListingId = id || '';

      if (isEditMode && id) {
        const { error: updateErr } = await supabase
          .from('accommodation_listings')
          .update(payload)
          .eq('id', id)
          .eq('owner_id', user.id);

        if (updateErr) throw new Error(formatSupabaseError(updateErr));
        savedListingId = id;

        // Sync accommodation_images rows cleanly
        const { error: clearImgErr } = await supabase
          .from('accommodation_images')
          .delete()
          .eq('listing_id', id);
        if (clearImgErr) throw new Error(formatSupabaseError(clearImgErr));
      } else {
        const { data: created, error: insertErr } = await supabase
          .from('accommodation_listings')
          .insert(payload)
          .select('id')
          .single();

        if (insertErr || !created) {
          throw new Error(formatSupabaseError(insertErr, 'Could not create listing.'));
        }
        savedListingId = (created as { id: string }).id;
      }

      if (photos.length > 0) {
        const imageRows = photos.map((photo, idx) => ({
          listing_id: savedListingId,
          storage_path: photo.storagePath,
          public_url: photo.publicUrl,
          display_order: idx,
        }));
        const { error: imgErr } = await supabase.from('accommodation_images').insert(imageRows);
        if (imgErr) throw new Error(formatSupabaseError(imgErr));
      }

      if (removedPhotoPaths.length > 0) {
        await deleteStoragePaths('accommodations', removedPhotoPaths);
      }

      showToast({
        variant: 'success',
        title: isEditMode ? 'Accommodation Listing Updated' : 'Accommodation Listing Saved',
        description:
          status === 'published'
            ? 'Your listing is now live on FlatMate.'
            : `Saved with status "${status}".`,
      });
      navigate(`/flats/${savedListingId}`);
    } catch (err) {
      setError(formatSupabaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingExisting) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <div className="h-48 rounded-2xl bg-surface-container animate-pulse" />
        <div className="h-64 rounded-2xl bg-surface-container animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-5 space-y-5">
      <div className="flex items-center justify-between">
        <Link to="/flats" className="text-label-md text-primary font-semibold flex items-center gap-1">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>Back to Flats</span>
        </Link>
      </div>

      <div>
        <h1 className="text-headline-md text-on-surface font-bold">
          {isEditMode ? 'Edit Accommodation Listing' : 'Post a Student Room or Flat'}
        </h1>
        <p className="text-body-sm text-on-surface-variant mt-1">
          Share genuine rent, deposit, and house rules directly with verified college peers. Zero
          brokerage fees allowed.
        </p>
      </div>

      <SafetyBanner mode="housing" />

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Core Details */}
        <section className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-4">
          <h2 className="text-title-md font-semibold text-on-surface">1. Property &amp; Room Scope</h2>

          <div>
            <label className="block text-label-sm text-on-surface mb-1">Listing Title *</label>
            <input
              type="text"
              required
              minLength={5}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Spacious 3BHK Private Room in Velachery"
              className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-label-sm text-on-surface mb-1">Property Type</label>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value as PropertyType)}
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              >
                <option value="apartment">Apartment / Flat</option>
                <option value="independent_house">Independent House</option>
                <option value="studio">Studio / 1RK</option>
                <option value="pg_hostel">Student PG / Hostel</option>
              </select>
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">Room Configuration</label>
              <select
                value={roomType}
                onChange={(e) => setRoomType(e.target.value as RoomType)}
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              >
                <option value="private_room">Private Room</option>
                <option value="shared_room">Shared Room</option>
                <option value="entire_flat">Entire Flat</option>
                <option value="studio_1rk">Studio / 1RK</option>
              </select>
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">Gender Preference</label>
              <select
                value={genderPreference}
                onChange={(e) => setGenderPreference(e.target.value as GenderPreference)}
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              >
                <option value="any">Any Gender</option>
                <option value="male_only">Male Students Only</option>
                <option value="female_only">Female Students Only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-label-sm text-on-surface mb-1">
              Room &amp; Flatmates Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe existing student flatmates, ventilation, kitchen setup, utility splits, and nearby metro/bus stops..."
              className="w-full p-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </section>

        {/* Rent, Deposit & Availability */}
        <section className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-4">
          <h2 className="text-title-md font-semibold text-on-surface">
            2. Rent, Deposit &amp; Availability
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                Monthly Rent (₹) *
              </label>
              <input
                type="number"
                required
                min={500}
                max={200000}
                value={rentMonthly}
                onChange={(e) => setRentMonthly(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface tabular-nums"
              />
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                Refundable Deposit (₹) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface tabular-nums"
              />
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">Available From *</label>
              <input
                type="date"
                required
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">Listing Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AccommodationStatus)}
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              >
                <option value="published">Published (Live)</option>
                <option value="draft">Save as Draft</option>
                <option value="occupied">Occupied / Filled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                Total Student Spots in Room/Flat *
              </label>
              <input
                type="number"
                required
                min={1}
                max={10}
                value={spotsTotal}
                onChange={(e) => setSpotsTotal(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface tabular-nums"
              />
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                Spots Currently Vacant *
              </label>
              <input
                type="number"
                required
                min={0}
                max={10}
                value={spotsAvailable}
                onChange={(e) => setSpotsAvailable(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface tabular-nums"
              />
            </div>
          </div>
        </section>

        {/* Location & Campus Commute */}
        <section className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-4">
          <h2 className="text-title-md font-semibold text-on-surface">
            3. Location &amp; Campus Proximity
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-label-sm text-on-surface mb-1">City *</label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g., Chennai, Bengaluru, Pune"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                Locality / Neighborhood *
              </label>
              <input
                type="text"
                required
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
                placeholder="e.g., Velachery, Adyar, Koramangala"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                Nearest College / University *
              </label>
              <input
                type="text"
                required
                value={nearbyCollege}
                onChange={(e) => setNearbyCollege(e.target.value)}
                placeholder="e.g., Anna University Guindy Campus"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                Approximate Distance to Campus (km, optional)
              </label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={50}
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                placeholder="Leave blank if unsure"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                Street / Landmark Reference (optional)
              </label>
              <input
                type="text"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="e.g., Near Vijayanagar Bus Terminus"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                Commute / Transit Note (optional)
              </label>
              <input
                type="text"
                value={transportNote}
                onChange={(e) => setTransportNote(e.target.value)}
                placeholder="e.g., 10 min walk to In-gate / Direct 5B bus"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
            </div>
          </div>
        </section>

        {/* Amenities & House Rules */}
        <section className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-4">
          <h2 className="text-title-md font-semibold text-on-surface">
            4. Amenities &amp; House Rules
          </h2>

          <div>
            <span className="block text-label-sm text-on-surface mb-2">Included Amenities</span>
            <div className="flex flex-wrap gap-2">
              {AMENITY_OPTIONS.map((item) => {
                const selected = amenities.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleItem(amenities, setAmenities, item)}
                    className={`px-3 py-1.5 rounded-lg text-label-sm transition-colors ${
                      selected
                        ? 'bg-primary text-on-primary font-semibold'
                        : 'bg-surface-container-low text-on-surface-variant'
                    }`}
                  >
                    {selected ? `✓ ${item}` : item}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-label-sm text-on-surface mb-2">House Rules</span>
            <div className="flex flex-wrap gap-2 mb-2.5">
              {Array.from(new Set([...HOUSE_RULE_OPTIONS, ...houseRules])).map((rule) => {
                const selected = houseRules.includes(rule);
                return (
                  <button
                    key={rule}
                    type="button"
                    onClick={() => toggleItem(houseRules, setHouseRules, rule)}
                    className={`px-3 py-1.5 rounded-lg text-label-sm transition-colors ${
                      selected
                        ? 'bg-secondary text-on-secondary font-semibold'
                        : 'bg-surface-container-low text-on-surface-variant'
                    }`}
                  >
                    {selected ? `✓ ${rule}` : rule}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={customRuleInput}
                onChange={(e) => setCustomRuleInput(e.target.value)}
                placeholder="Add custom house rule (e.g., Gate closes at 11:30 PM)"
                className="flex-1 h-10 px-3 rounded-xl bg-surface-container-low text-body-sm text-on-surface"
              />
              <button
                type="button"
                onClick={handleAddCustomRule}
                className="h-10 px-4 rounded-xl bg-surface-container text-on-surface text-label-sm font-semibold"
              >
                Add Rule
              </button>
            </div>
          </div>
        </section>

        {/* Property Photographs */}
        <section className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-title-md font-semibold text-on-surface">
                5. Property Photographs
              </h2>
              <p className="text-body-sm text-on-surface-variant">
                Upload up to 8 real room/flat photos (JPEG, PNG, or WebP, max 5 MB each).
              </p>
            </div>

            <label className="h-10 px-4 rounded-xl bg-primary-fixed text-on-primary-fixed-variant text-label-sm font-semibold flex items-center gap-1.5 cursor-pointer shrink-0">
              <span className="material-symbols-outlined text-[18px]">upload</span>
              <span>{uploadingPhotos ? 'Uploading...' : 'Add Photos'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={uploadingPhotos}
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </label>
          </div>

          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {photos.map((photo, index) => (
                <div
                  key={photo.storagePath}
                  className="relative rounded-xl overflow-hidden bg-surface-container aspect-[4/3] group"
                >
                  <img
                    src={photo.publicUrl}
                    alt={`Room photo ${index + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  {index === 0 && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-primary text-on-primary text-[10px] font-bold">
                      Cover
                    </span>
                  )}
                  <div className="absolute bottom-2 inset-x-2 flex items-center justify-between gap-1">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMovePhoto(index, -1)}
                        aria-label="Move photo earlier"
                        className="w-7 h-7 rounded-md bg-inverse-surface/80 text-inverse-on-surface flex items-center justify-center disabled:opacity-30"
                      >
                        <span className="material-symbols-outlined text-[15px]">chevron_left</span>
                      </button>
                      <button
                        type="button"
                        disabled={index === photos.length - 1}
                        onClick={() => handleMovePhoto(index, 1)}
                        aria-label="Move photo later"
                        className="w-7 h-7 rounded-md bg-inverse-surface/80 text-inverse-on-surface flex items-center justify-center disabled:opacity-30"
                      >
                        <span className="material-symbols-outlined text-[15px]">chevron_right</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(index)}
                      aria-label="Delete photo"
                      className="w-7 h-7 rounded-md bg-error text-on-error flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-[15px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && (
          <div className="p-3.5 rounded-xl bg-error-container text-on-error-container text-body-sm font-medium">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <Link
            to={isEditMode && id ? `/flats/${id}` : '/flats'}
            className="h-11 px-5 rounded-xl bg-surface-container text-on-surface text-label-md font-semibold flex items-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || uploadingPhotos}
            className="h-11 px-6 rounded-xl bg-primary text-on-primary text-label-md font-semibold shadow-xs disabled:opacity-50"
          >
            {submitting
              ? 'Saving Listing...'
              : isEditMode
                ? 'Save Changes'
                : status === 'draft'
                  ? 'Save Draft'
                  : 'Publish Room Listing'}
          </button>
        </div>
      </form>
    </div>
  );
}
