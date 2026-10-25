import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  deleteStoragePaths,
  formatSupabaseError,
  supabase,
  uploadAssetToBucket,
} from '../lib/supabase';
import { CONDITION_METADATA, validateBookListingPayload } from '../lib/bookStateMachine';
import type { BookCondition, BookListing, BookListingType } from '../types/database';

const CITIES = ['Chennai', 'Bengaluru', 'Hyderabad', 'Coimbatore', 'Pune', 'Delhi NCR', 'Mumbai'];

export function BookFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [edition, setEdition] = useState('');
  const [isbn, setIsbn] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [department, setDepartment] = useState(profile?.department || 'CSE');
  const [semester, setSemester] = useState<number>(profile?.semester || 5);
  const [subject, setSubject] = useState('');
  const [condition, setCondition] = useState<BookCondition>('good');
  const [listingType, setListingType] = useState<BookListingType>('free_donation');
  const [exchangeTerms, setExchangeTerms] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState(profile?.city || 'Chennai');
  const [collegeName, setCollegeName] = useState(profile?.college_name || '');
  const [pickupSpot, setPickupSpot] = useState('Main Campus Library Entrance');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);

  useEffect(() => {
    if (!isEditing || !id || !user) return;
    supabase
      .from('book_listings')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        setLoadingExisting(false);
        if (error || !data) {
          showToast({ variant: 'error', title: 'Book listing not found' });
          navigate('/books');
          return;
        }
        const b = data as BookListing;
        if (b.donor_id !== user.id) {
          showToast({ variant: 'error', title: 'You can only edit your own book listings.' });
          navigate(`/books/${id}`);
          return;
        }
        setTitle(b.title);
        setAuthor(b.author);
        setEdition(b.edition || '');
        setIsbn(b.isbn || '');
        setCourseCode(b.course_code || '');
        setDepartment(b.department);
        setSemester(b.semester);
        setSubject(b.subject);
        setCondition(b.condition);
        setListingType(b.listing_type);
        setExchangeTerms(b.exchange_terms || '');
        setDescription(b.description || '');
        setCity(b.city);
        setCollegeName(b.college_name);
        setPickupSpot(b.preferred_pickup_spot);
        setPhotoUrls(b.photo_urls || []);
        setPhotoPaths(b.photo_paths || []);
      });
  }, [id, isEditing, navigate, showToast, user]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !user) return;
    if (photoUrls.length + files.length > 4) {
      showToast({ variant: 'error', title: 'Maximum 4 book photographs allowed.' });
      return;
    }

    setUploadingPhotos(true);
    try {
      const nextUrls = [...photoUrls];
      const nextPaths = [...photoPaths];
      for (const file of files) {
        const uploaded = await uploadAssetToBucket({
          bucket: 'books',
          userId: user.id,
          file,
        });
        nextUrls.push(uploaded.publicUrl);
        nextPaths.push(uploaded.storagePath);
      }
      setPhotoUrls(nextUrls);
      setPhotoPaths(nextPaths);
      showToast({ variant: 'success', title: 'Book photo uploaded' });
    } catch (err) {
      showToast({ variant: 'error', title: 'Upload failed', description: formatSupabaseError(err) });
    } finally {
      setUploadingPhotos(false);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = async (index: number) => {
    const pathToRemove = photoPaths[index];
    if (pathToRemove) {
      await deleteStoragePaths('books', [pathToRemove]);
    }
    setPhotoUrls((prev) => prev.filter((_, idx) => idx !== index));
    setPhotoPaths((prev) => prev.filter((_, idx) => idx !== index));
  };

  const saveListing = async (targetAvailability: 'available' | 'draft') => {
    if (!user) return;

    const cleanExchangeTerms = listingType === 'exchange' ? exchangeTerms.trim() : null;
    const validationErr = validateBookListingPayload({
      title,
      author,
      department,
      semester: Number(semester),
      subject,
      condition,
      listing_type: listingType,
      exchange_terms: cleanExchangeTerms,
      city,
      college_name: collegeName,
      preferred_pickup_spot: pickupSpot,
    });

    if (validationErr) {
      showToast({ variant: 'error', title: 'Check form fields', description: validationErr });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        donor_id: user.id,
        title: title.trim(),
        author: author.trim(),
        edition: edition.trim(),
        isbn: isbn.trim(),
        course_code: courseCode.trim().toUpperCase(),
        department: department.trim(),
        semester: Number(semester),
        subject: subject.trim(),
        condition,
        condition_score: CONDITION_METADATA[condition].score,
        listing_type: listingType,
        exchange_terms: cleanExchangeTerms,
        description: description.trim(),
        city: city.trim(),
        college_name: collegeName.trim(),
        preferred_pickup_spot: pickupSpot.trim(),
        photo_urls: photoUrls,
        photo_paths: photoPaths,
        availability_status: targetAvailability,
      };

      if (isEditing && id) {
        const { error } = await supabase
          .from('book_listings')
          .update(payload)
          .eq('id', id)
          .eq('donor_id', user.id);
        if (error) throw new Error(formatSupabaseError(error));
        showToast({ variant: 'success', title: 'Book listing updated' });
        navigate(`/books/${id}`);
      } else {
        const { data, error } = await supabase
          .from('book_listings')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw new Error(formatSupabaseError(error));
        showToast({
          variant: 'success',
          title: targetAvailability === 'draft' ? 'Saved as draft' : 'Book published on BookBridge!',
        });
        navigate(`/books/${(data as { id: string }).id}`);
      }
    } catch (err) {
      showToast({ variant: 'error', title: 'Could not save book', description: formatSupabaseError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingExisting) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="h-64 rounded-2xl bg-surface-container animate-pulse" />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 max-w-2xl mx-auto">
      <div className="bg-surface-container-lowest rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div>
          <span className="text-label-sm text-secondary uppercase tracking-wider font-semibold">
            BookBridge Circularity
          </span>
          <h1 className="text-headline-sm text-on-surface font-bold mt-0.5">
            {isEditing ? 'Edit Textbook Listing' : 'Donate or Swap a Textbook'}
          </h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Free Donation listings are strictly ₹0. Exchange listings swap book-for-book with peers.
          </p>
        </div>

        {/* Listing Type Selector */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setListingType('free_donation');
              setExchangeTerms('');
            }}
            className={`p-3.5 rounded-xl text-left transition-all ${
              listingType === 'free_donation'
                ? 'bg-primary-fixed text-on-primary-fixed ring-2 ring-primary'
                : 'bg-surface-container-low text-on-surface-variant'
            }`}
          >
            <p className="text-label-md font-semibold">Free Donation (₹0)</p>
            <p className="text-[12px] opacity-85 mt-0.5">Pass forward free to a junior</p>
          </button>

          <button
            type="button"
            onClick={() => setListingType('exchange')}
            className={`p-3.5 rounded-xl text-left transition-all ${
              listingType === 'exchange'
                ? 'bg-secondary-fixed text-on-secondary-fixed ring-2 ring-secondary'
                : 'bg-surface-container-low text-on-surface-variant'
            }`}
          >
            <p className="text-label-md font-semibold">Campus Book Swap</p>
            <p className="text-[12px] opacity-85 mt-0.5">Trade for another syllabus book</p>
          </button>
        </div>

        {listingType === 'exchange' && (
          <div>
            <label className="block text-label-sm text-on-surface mb-1">
              Desired Swap Book / Academic Terms * (No cash/UPI)
            </label>
            <input
              type="text"
              required
              value={exchangeTerms}
              onChange={(e) => setExchangeTerms(e.target.value)}
              placeholder="e.g., Looking to swap for Sem 6 Compiler Design (Ullman) or ML notes"
              className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-label-sm text-on-surface mb-1">Book Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Computer Networks"
              className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
            />
          </div>

          <div>
            <label className="block text-label-sm text-on-surface mb-1">Author *</label>
            <input
              type="text"
              required
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g., Andrew S. Tanenbaum"
              className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-label-sm text-on-surface mb-1">Edition</label>
              <input
                type="text"
                value={edition}
                onChange={(e) => setEdition(e.target.value)}
                placeholder="5th Ed"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
            </div>
            <div>
              <label className="block text-label-sm text-on-surface mb-1">ISBN</label>
              <input
                type="text"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="978-0132126953"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
            </div>
          </div>

          <div>
            <label className="block text-label-sm text-on-surface mb-1">Department *</label>
            <input
              type="text"
              required
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="CSE, ECE, Mechanical..."
              className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-label-sm text-on-surface mb-1">Semester *</label>
              <input
                type="number"
                min={1}
                max={12}
                required
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value))}
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
            </div>
            <div>
              <label className="block text-label-sm text-on-surface mb-1">Course Code</label>
              <input
                type="text"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="CS8591"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface uppercase"
              />
            </div>
          </div>

          <div>
            <label className="block text-label-sm text-on-surface mb-1">Subject Name *</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Computer Networks"
              className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
            />
          </div>

          <div>
            <label className="block text-label-sm text-on-surface mb-1">Book Condition *</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as BookCondition)}
              className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
            >
              {(Object.keys(CONDITION_METADATA) as BookCondition[]).map((c) => (
                <option key={c} value={c}>
                  {CONDITION_METADATA[c].label} ({CONDITION_METADATA[c].score}/5)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-label-sm text-on-surface mb-1">City *</label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-label-sm text-on-surface mb-1">College / Campus *</label>
            <input
              type="text"
              required
              value={collegeName}
              onChange={(e) => setCollegeName(e.target.value)}
              placeholder="Anna University, Guindy"
              className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-label-sm text-on-surface mb-1">
              Safe Campus Handover Spot *
            </label>
            <input
              type="text"
              required
              value={pickupSpot}
              onChange={(e) => setPickupSpot(e.target.value)}
              placeholder="e.g., Central Library Porch, Campus Canteen, Hostel Main Gate"
              className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
            />
          </div>
        </div>

        <div>
          <label className="block text-label-sm text-on-surface mb-1">Notes on Chapters / Markings</label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional details on syllabus coverage, included solved papers, or condition..."
            className="w-full p-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
          />
        </div>

        {/* Book Photographs Upload */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-label-sm text-on-surface">
              Book Photographs ({photoUrls.length}/4, Max 5 MB JPEG/PNG/WebP)
            </span>
            <label className="px-3 py-1.5 rounded-lg bg-surface-container text-label-sm text-secondary font-semibold cursor-pointer">
              {uploadingPhotos ? 'Uploading...' : '+ Add Photo'}
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadingPhotos || photoUrls.length >= 4}
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </label>
          </div>

          {photoUrls.length > 0 && (
            <div className="grid grid-cols-4 gap-2.5">
              {photoUrls.map((url, idx) => (
                <div key={url} className="relative aspect-[3/4] rounded-lg overflow-hidden bg-surface-container">
                  <img
                    src={url}
                    alt={`Book preview ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => handleRemovePhoto(idx)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-inverse-surface/80 text-inverse-on-surface flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-surface-container">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="h-11 px-4 rounded-xl bg-surface-container text-on-surface text-label-md font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || uploadingPhotos}
            onClick={() => saveListing('draft')}
            className="h-11 px-4 rounded-xl bg-surface-container-high text-on-surface text-label-md font-semibold disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            type="button"
            disabled={submitting || uploadingPhotos}
            onClick={() => saveListing('available')}
            className="h-11 px-6 rounded-xl bg-secondary text-on-secondary text-label-md font-semibold shadow-xs disabled:opacity-50"
          >
            {submitting ? 'Publishing...' : isEditing ? 'Update Listing' : 'Publish Book'}
          </button>
        </div>
      </div>
    </div>
  );
}
