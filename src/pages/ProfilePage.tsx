import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  formatSupabaseError,
  supabase,
  uploadAssetToBucket,
} from '../lib/supabase';
import { validateProfilePayload } from '../lib/validators';
import {
  calculateProfileCompletion,
  canDisplayCollegeVerifiedBadge,
} from '../lib/verification';
import type {
  CollegeVerificationRequest,
  Profile,
  StudentPreferences,
  UserBlock,
} from '../types/database';

type ProfileTab = 'academic' | 'preferences' | 'verification' | 'privacy';

const CITIES = ['Chennai', 'Bengaluru', 'Hyderabad', 'Coimbatore', 'Pune', 'Delhi NCR', 'Mumbai'];

export function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const {
    user,
    profile,
    preferences,
    privateContacts,
    refreshUserData,
    signOut,
    unblockUser,
    deleteAccount,
  } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<ProfileTab>('academic');

  // Academic & Contact Form State
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState<Profile['gender']>(null);
  const [collegeName, setCollegeName] = useState('');
  const [course, setCourse] = useState('');
  const [department, setDepartment] = useState('');
  const [semester, setSemester] = useState<string>('');
  const [city, setCity] = useState('Chennai');
  const [bio, setBio] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [contactHours, setContactHours] = useState('6 PM - 9 PM');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // FlatMate Lifestyle Preferences State
  const [huntStatus, setHuntStatus] = useState<StudentPreferences['hunt_status']>(
    'seeking_flat_and_flatmate'
  );
  const [headline, setHeadline] = useState('');
  const [budgetMin, setBudgetMin] = useState(5000);
  const [budgetMax, setBudgetMax] = useState(9000);
  const [preferredCity, setPreferredCity] = useState('Chennai');
  const [localitiesInput, setLocalitiesInput] = useState('');
  const [moveInDate, setMoveInDate] = useState('');
  const [diet, setDiet] = useState<StudentPreferences['diet']>('vegetarian');
  const [sleepSchedule, setSleepSchedule] = useState<StudentPreferences['sleep_schedule']>('flexible');
  const [cleanliness, setCleanliness] = useState<StudentPreferences['cleanliness']>('tidy');
  const [smoking, setSmoking] = useState<StudentPreferences['smoking']>('no');
  const [alcohol, setAlcohol] = useState<StudentPreferences['alcohol']>('no');
  const [studyHabit, setStudyHabit] = useState<StudentPreferences['study_habit']>('quiet_hours');
  const [guestPolicy, setGuestPolicy] = useState<StudentPreferences['guest_policy']>('occasional');
  const [hobbiesInput, setHobbiesInput] = useState('');
  const [bookInterestsInput, setBookInterestsInput] = useState('');
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Verification State
  const [verifHistory, setVerifHistory] = useState<CollegeVerificationRequest[]>([]);
  const [rollNumber, setRollNumber] = useState('');
  const [collegeEmailInput, setCollegeEmailInput] = useState('');
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [submittingVerif, setSubmittingVerif] = useState(false);

  // Privacy, Notifications, Blocks & Account Deletion
  const [showInFlatmates, setShowInFlatmates] = useState(true);
  const [showSemester, setShowSemester] = useState(true);
  const [allowConnections, setAllowConnections] = useState(true);
  const [notifFlats, setNotifFlats] = useState(true);
  const [notifMatches, setNotifMatches] = useState(true);
  const [notifBooks, setNotifBooks] = useState(true);
  const [notifMessages, setNotifMessages] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [blockedList, setBlockedList] = useState<UserBlock[]>([]);
  const [deleteConfirmWord, setDeleteConfirmWord] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const hashTab = location.hash.replace(/^#/, '');
    const candidate = tabParam || hashTab;
    if (
      candidate === 'academic' ||
      candidate === 'preferences' ||
      candidate === 'verification' ||
      candidate === 'privacy'
    ) {
      setActiveTab(candidate);
    }
  }, [location.hash, searchParams]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setAge(profile.age ? String(profile.age) : '');
      setGender(profile.gender);
      setCollegeName(profile.college_name || '');
      setCourse(profile.course || '');
      setDepartment(profile.department || '');
      setSemester(profile.semester ? String(profile.semester) : '');
      setCity(profile.city || 'Chennai');
      setBio(profile.bio || '');
      setShowInFlatmates(profile.privacy_prefs?.show_profile_in_flatmates ?? true);
      setShowSemester(profile.privacy_prefs?.show_semester ?? true);
      setAllowConnections(profile.privacy_prefs?.allow_connection_requests ?? true);
      setNotifFlats(profile.notification_prefs?.flat_requests ?? true);
      setNotifMatches(profile.notification_prefs?.flatmate_matches ?? true);
      setNotifBooks(profile.notification_prefs?.book_requests ?? true);
      setNotifMessages(profile.notification_prefs?.messages ?? true);
    }
  }, [profile]);

  useEffect(() => {
    if (privateContacts) {
      setPhoneNumber(privateContacts.phone_number || '');
      setWhatsappNumber(privateContacts.whatsapp_number || '');
      setContactHours(privateContacts.preferred_contact_hours || '6 PM - 9 PM');
    }
  }, [privateContacts]);

  useEffect(() => {
    if (preferences) {
      setHuntStatus(preferences.hunt_status);
      setHeadline(preferences.headline || '');
      setBudgetMin(preferences.budget_min);
      setBudgetMax(preferences.budget_max);
      setPreferredCity(preferences.preferred_city || profile?.city || 'Chennai');
      setLocalitiesInput((preferences.preferred_localities || []).join(', '));
      setMoveInDate(preferences.move_in_date || '');
      setDiet(preferences.diet);
      setSleepSchedule(preferences.sleep_schedule);
      setCleanliness(preferences.cleanliness);
      setSmoking(preferences.smoking);
      setAlcohol(preferences.alcohol);
      setStudyHabit(preferences.study_habit);
      setGuestPolicy(preferences.guest_policy);
      setHobbiesInput((preferences.hobbies || []).join(', '));
      setBookInterestsInput((preferences.book_interests || []).join(', '));
    }
  }, [preferences, profile?.city]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('college_verification_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setVerifHistory((data as CollegeVerificationRequest[] | null) ?? []);
      });

    supabase
      .from('user_blocks')
      .select('*, blocked_user:profiles!user_blocks_blocked_id_fkey(*)')
      .eq('blocker_id', user.id)
      .then(({ data }) => {
        setBlockedList((data as UserBlock[] | null) ?? []);
      });
  }, [user]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      const { storagePath, publicUrl } = await uploadAssetToBucket({
        bucket: 'avatars',
        userId: user.id,
        file,
        replaceStoragePath: profile?.avatar_storage_path,
      });

      const { error } = await supabase
        .from('profiles')
        .update({
          avatar_url: publicUrl,
          avatar_storage_path: storagePath,
        })
        .eq('id', user.id);

      if (error) throw new Error(formatSupabaseError(error));
      await refreshUserData();
      showToast({ variant: 'success', title: 'Profile photo updated' });
    } catch (err) {
      showToast({ variant: 'error', title: 'Upload failed', description: formatSupabaseError(err) });
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleSaveAcademicProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const parsedSem = semester ? Number(semester) : null;
    const parsedAge = age ? Number(age) : null;

    const validationErr = validateProfilePayload({
      full_name: fullName,
      college_name: collegeName,
      course,
      department,
      semester: parsedSem,
      city,
      age: parsedAge,
    });
    if (validationErr) {
      showToast({ variant: 'error', title: 'Validation Error', description: validationErr });
      return;
    }

    setSavingProfile(true);
    try {
      const { error: profErr } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          age: parsedAge,
          gender,
          college_name: collegeName.trim(),
          course: course.trim(),
          department: department.trim(),
          semester: parsedSem,
          city: city.trim(),
          bio: bio.trim(),
        })
        .eq('id', user.id);

      if (profErr) throw new Error(formatSupabaseError(profErr));

      const { error: contactErr } = await supabase.from('profile_private_contacts').upsert(
        {
          user_id: user.id,
          phone_number: phoneNumber.trim(),
          whatsapp_number: whatsappNumber.trim(),
          preferred_contact_hours: contactHours.trim(),
        },
        { onConflict: 'user_id' }
      );

      if (contactErr) throw new Error(formatSupabaseError(contactErr));

      await refreshUserData();
      showToast({
        variant: 'success',
        title: 'Student profile saved',
        description: 'Your academic profile and private contact preferences are updated.',
      });
    } catch (err) {
      showToast({ variant: 'error', title: 'Save failed', description: formatSupabaseError(err) });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (budgetMin < 0 || budgetMax < budgetMin) {
      showToast({
        variant: 'error',
        title: 'Invalid budget range',
        description: 'Maximum monthly budget must be greater than or equal to minimum budget.',
      });
      return;
    }

    setSavingPrefs(true);
    try {
      const preferred_localities = localitiesInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const hobbies = hobbiesInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const book_interests = bookInterestsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const { error } = await supabase.from('student_preferences').upsert(
        {
          user_id: user.id,
          hunt_status: huntStatus,
          headline: headline.trim(),
          budget_min: Number(budgetMin),
          budget_max: Number(budgetMax),
          preferred_city: preferredCity,
          preferred_localities,
          move_in_date: moveInDate || null,
          diet,
          sleep_schedule: sleepSchedule,
          cleanliness,
          smoking,
          alcohol,
          study_habit: studyHabit,
          guest_policy: guestPolicy,
          hobbies,
          book_interests,
        },
        { onConflict: 'user_id' }
      );

      if (error) throw new Error(formatSupabaseError(error));
      await refreshUserData();
      showToast({
        variant: 'success',
        title: 'Compatibility preferences updated',
        description: 'FlatMate match scores have been recalculated across all peers.',
      });
    } catch (err) {
      showToast({ variant: 'error', title: 'Save failed', description: formatSupabaseError(err) });
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!idCardFile) {
      showToast({
        variant: 'error',
        title: 'College ID document required',
        description: 'Select a clear JPEG, PNG, WebP, or PDF of your valid college ID card.',
      });
      return;
    }
    if (rollNumber.trim().length < 2) {
      showToast({ variant: 'error', title: 'Enter your official student roll/register number.' });
      return;
    }

    setSubmittingVerif(true);
    try {
      const { storagePath } = await uploadAssetToBucket({
        bucket: 'verification-docs',
        userId: user.id,
        file: idCardFile,
      });

      const { data, error } = await supabase
        .from('college_verification_requests')
        .insert({
          user_id: user.id,
          college_name: (collegeName || profile?.college_name || '').trim(),
          college_email: collegeEmailInput.trim() || null,
          student_roll_number: rollNumber.trim(),
          id_card_storage_path: storagePath,
        })
        .select('*')
        .single();

      if (error) throw new Error(formatSupabaseError(error));
      setVerifHistory((prev) => [data as CollegeVerificationRequest, ...prev]);
      setIdCardFile(null);
      setRollNumber('');
      showToast({
        variant: 'success',
        title: 'Verification submitted',
        description: 'CampusCircle administrators will review your College ID shortly.',
      });
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Verification submission failed',
        description: formatSupabaseError(err),
      });
    } finally {
      setSubmittingVerif(false);
    }
  };

  const handleSavePrivacyAndNotifs = async () => {
    if (!user) return;
    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          privacy_prefs: {
            show_profile_in_flatmates: showInFlatmates,
            show_semester: showSemester,
            allow_connection_requests: allowConnections,
          },
          notification_prefs: {
            flat_requests: notifFlats,
            flatmate_matches: notifMatches,
            book_requests: notifBooks,
            messages: notifMessages,
          },
        })
        .eq('id', user.id);

      if (error) throw new Error(formatSupabaseError(error));
      await refreshUserData();
      showToast({ variant: 'success', title: 'Privacy & notification settings saved' });
    } catch (err) {
      showToast({ variant: 'error', title: 'Save failed', description: formatSupabaseError(err) });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAccountDeletion = async () => {
    if (deleteConfirmWord !== 'DELETE') {
      showToast({
        variant: 'error',
        title: 'Confirmation required',
        description: 'Type DELETE in uppercase to confirm permanent account removal.',
      });
      return;
    }
    setDeletingAccount(true);
    try {
      await deleteAccount();
      showToast({
        variant: 'info',
        title: 'Account deleted',
        description: 'Your profile, listings, and uploaded files have been permanently removed.',
      });
      navigate('/', { replace: true });
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Account deletion failed',
        description: formatSupabaseError(err),
      });
    } finally {
      setDeletingAccount(false);
    }
  };

  const completionPct = calculateProfileCompletion(profile, preferences);
  const isVerified = canDisplayCollegeVerifiedBadge(profile);

  return (
    <div className="px-4 lg:px-8 py-4 max-w-4xl mx-auto space-y-5">
      {/* Top Profile Header Card */}
      <section className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center overflow-hidden font-bold text-headline-sm shadow-xs">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                (profile?.full_name || user?.email || 'S')[0]?.toUpperCase()
              )}
            </div>
            <label
              aria-label="Upload profile photo"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center cursor-pointer shadow-xs"
            >
              <span className="material-symbols-outlined text-[15px]">photo_camera</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                disabled={uploadingAvatar}
                className="hidden"
              />
            </label>
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-headline-sm text-on-surface font-bold">
                {profile?.full_name || 'Student Profile'}
              </h1>
              {isVerified && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-[11px] font-semibold">
                  <span className="material-symbols-outlined text-[13px] material-icon-filled">
                    verified
                  </span>
                  College Verified
                </span>
              )}
            </div>
            <p className="text-body-sm text-on-surface-variant">{user?.email}</p>
            <p className="text-label-sm text-primary mt-1 tabular-nums">
              Profile {completionPct}% complete
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={async () => {
            await signOut();
            navigate('/');
          }}
          className="h-10 px-4 rounded-xl bg-surface-container text-on-surface text-label-md font-semibold flex items-center justify-center gap-1.5 self-start sm:self-center"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          <span>Sign Out</span>
        </button>
      </section>

      {/* Section Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {(
          [
            { id: 'academic', label: 'Academic Profile', icon: 'person' },
            { id: 'preferences', label: 'FlatMate Preferences', icon: 'tune' },
            { id: 'verification', label: 'College Verification', icon: 'verified_user' },
            { id: 'privacy', label: 'Privacy & Account', icon: 'lock' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 h-10 px-4 rounded-xl text-label-md font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === tab.id
                ? 'bg-primary text-on-primary shadow-xs'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: Academic Profile */}
      {activeTab === 'academic' && (
        <form
          onSubmit={handleSaveAcademicProfile}
          className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-4"
        >
          <h2 className="text-title-md font-semibold text-on-surface">
            Academic Identity &amp; Campus Details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-label-sm text-on-surface mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-label-sm text-on-surface mb-1">Age</label>
                <input
                  type="number"
                  min={16}
                  max={60}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="20"
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-label-sm text-on-surface mb-1">Gender</label>
                <select
                  value={gender || ''}
                  onChange={(e) =>
                    setGender((e.target.value || null) as Profile['gender'])
                  }
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                College / University *
              </label>
              <input
                type="text"
                required
                value={collegeName}
                onChange={(e) => setCollegeName(e.target.value)}
                placeholder="e.g., Anna University, Guindy"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">City *</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                Degree / Course *
              </label>
              <input
                type="text"
                required
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="e.g., B.Tech, M.Tech, B.Com"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-label-sm text-on-surface mb-1">
                  Department *
                </label>
                <input
                  type="text"
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="CSE, ECE, Mech..."
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-label-sm text-on-surface mb-1">Semester</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  placeholder="1 - 8"
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-label-sm text-on-surface mb-1">Short Peer Bio</label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Share your campus routine, study hours, or hobbies for potential flatmates..."
              className="w-full p-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="pt-2 border-t border-surface-container space-y-3">
            <div>
              <h3 className="text-title-md font-semibold text-on-surface">
                Protected Contact Details
              </h3>
              <p className="text-body-sm text-on-surface-variant">
                Hidden from public profiles via database Row Level Security. Visible only to peers
                with an accepted connection, room inquiry, or active book handover.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-label-sm text-on-surface mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+91 98XXXXXXXX"
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-label-sm text-on-surface mb-1">WhatsApp</label>
                <input
                  type="tel"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="+91 98XXXXXXXX"
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-label-sm text-on-surface mb-1">Preferred Hours</label>
                <input
                  type="text"
                  value={contactHours}
                  onChange={(e) => setContactHours(e.target.value)}
                  placeholder="6 PM - 9 PM"
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingProfile}
              className="h-11 px-6 rounded-xl bg-primary text-on-primary text-label-md font-semibold shadow-xs disabled:opacity-50"
            >
              {savingProfile ? 'Saving...' : 'Save Academic Profile'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: FlatMate Lifestyle & Book Preferences */}
      {activeTab === 'preferences' && (
        <form
          onSubmit={handleSavePreferences}
          className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-4"
        >
          <div>
            <h2 className="text-title-md font-semibold text-on-surface">
              Lifestyle &amp; Compatibility Quiz
            </h2>
            <p className="text-body-sm text-on-surface-variant">
              Used by the deterministic 100-point FlatMate compatibility algorithm to calculate
              exact matches and differences.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-label-sm text-on-surface mb-1">Current Housing Goal</label>
              <select
                value={huntStatus}
                onChange={(e) =>
                  setHuntStatus(e.target.value as StudentPreferences['hunt_status'])
                }
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              >
                <option value="seeking_flat_and_flatmate">Looking to join a flat / find flatmates</option>
                <option value="have_flat_need_flatmate">Have a room/flat, seeking flatmate</option>
                <option value="not_looking">Not looking right now (pause matching)</option>
              </select>
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">Match Card Headline</label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g., Seeking 1 flatmate for 2BHK in Guindy"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                Monthly Budget Min (₹)
              </label>
              <input
                type="number"
                min={0}
                step={500}
                value={budgetMin}
                onChange={(e) => setBudgetMin(Number(e.target.value))}
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface tabular-nums"
              />
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                Monthly Budget Max (₹)
              </label>
              <input
                type="number"
                min={0}
                step={500}
                value={budgetMax}
                onChange={(e) => setBudgetMax(Number(e.target.value))}
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface tabular-nums"
              />
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">Preferred City</label>
              <select
                value={preferredCity}
                onChange={(e) => setPreferredCity(e.target.value)}
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
              <label className="block text-label-sm text-on-surface mb-1">Target Move-in Date</label>
              <input
                type="date"
                value={moveInDate}
                onChange={(e) => setMoveInDate(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">Diet Preference</label>
              <select
                value={diet}
                onChange={(e) => setDiet(e.target.value as StudentPreferences['diet'])}
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              >
                <option value="vegetarian">Vegetarian</option>
                <option value="eggetarian">Eggetarian</option>
                <option value="non_vegetarian">Non-Vegetarian</option>
                <option value="vegan">Vegan</option>
              </select>
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">Sleep Schedule</label>
              <select
                value={sleepSchedule}
                onChange={(e) =>
                  setSleepSchedule(e.target.value as StudentPreferences['sleep_schedule'])
                }
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              >
                <option value="early_riser">Early Riser (Before 11 PM)</option>
                <option value="night_owl">Night Owl / Late Study</option>
                <option value="flexible">Flexible Hours</option>
              </select>
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">Cleanliness Standard</label>
              <select
                value={cleanliness}
                onChange={(e) =>
                  setCleanliness(e.target.value as StudentPreferences['cleanliness'])
                }
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              >
                <option value="very_tidy">Very Clean &amp; Organized</option>
                <option value="tidy">Moderately Tidy</option>
                <option value="relaxed">Relaxed</option>
              </select>
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">Study Routine</label>
              <select
                value={studyHabit}
                onChange={(e) =>
                  setStudyHabit(e.target.value as StudentPreferences['study_habit'])
                }
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              >
                <option value="quiet_hours">Quiet room study hours</option>
                <option value="library_studier">Mostly studies at campus library</option>
                <option value="collaborative">Group discussion friendly</option>
                <option value="flexible">Flexible</option>
              </select>
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">Smoking</label>
              <select
                value={smoking}
                onChange={(e) => setSmoking(e.target.value as StudentPreferences['smoking'])}
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              >
                <option value="no">Non-smoker</option>
                <option value="outside_only">Outside flat only</option>
                <option value="yes">Yes</option>
              </select>
            </div>

            <div>
              <label className="block text-label-sm text-on-surface mb-1">Guest Policy</label>
              <select
                value={guestPolicy}
                onChange={(e) =>
                  setGuestPolicy(e.target.value as StudentPreferences['guest_policy'])
                }
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              >
                <option value="no_overnight">No overnight guests</option>
                <option value="occasional">Occasional daytime peers</option>
                <option value="weekends_ok">Weekends OK with notice</option>
                <option value="open">Open guest policy</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                Preferred Localities (comma-separated)
              </label>
              <input
                type="text"
                value={localitiesInput}
                onChange={(e) => setLocalitiesInput(e.target.value)}
                placeholder="Velachery, Guindy, Adyar"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
            </div>
            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                Hobbies (comma-separated)
              </label>
              <input
                type="text"
                value={hobbiesInput}
                onChange={(e) => setHobbiesInput(e.target.value)}
                placeholder="Football, Guitar, Coding"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
            </div>
            <div>
              <label className="block text-label-sm text-on-surface mb-1">
                BookBridge Subjects Wanted
              </label>
              <input
                type="text"
                value={bookInterestsInput}
                onChange={(e) => setBookInterestsInput(e.target.value)}
                placeholder="Operating Systems, DBMS, DSP"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingPrefs}
              className="h-11 px-6 rounded-xl bg-primary text-on-primary text-label-md font-semibold shadow-xs disabled:opacity-50"
            >
              {savingPrefs ? 'Recalculating...' : 'Save & Recalculate Matches'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: Dual-Path College Verification */}
      {activeTab === 'verification' && (
        <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-5">
          <div>
            <h2 className="text-title-md font-semibold text-on-surface">
              College Student Verification
            </h2>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              CampusCircle never marks accounts verified from self-declared profile text. Accounts
              are verified strictly through institutional `.ac.in`/`.edu` email confirmation or
              moderator review of a valid College ID card.
            </p>
          </div>

          {isVerified ? (
            <div className="p-4 rounded-xl bg-primary-fixed/35 text-on-primary-fixed flex items-start gap-3">
              <span className="material-symbols-outlined text-primary text-[24px] material-icon-filled">
                verified
              </span>
              <div>
                <p className="text-title-md font-semibold">Your Student Status Is Verified</p>
                <p className="text-body-sm mt-0.5">
                  Method:{' '}
                  {profile?.verification_method === 'domain_email'
                    ? `Confirmed Institutional Domain (${profile.college_domain})`
                    : 'Approved College ID Card Review'}
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitVerification} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-label-sm text-on-surface mb-1">
                    Student Roll / Register Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={rollNumber}
                    onChange={(e) => setRollNumber(e.target.value)}
                    placeholder="e.g., 2023103542"
                    className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
                  />
                </div>
                <div>
                  <label className="block text-label-sm text-on-surface mb-1">
                    College Email (Optional if using ID card)
                  </label>
                  <input
                    type="email"
                    value={collegeEmailInput}
                    onChange={(e) => setCollegeEmailInput(e.target.value)}
                    placeholder="student@college.ac.in"
                    className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
                  />
                </div>
              </div>

              <div>
                <label className="block text-label-sm text-on-surface mb-1">
                  Upload College ID Card (Private Bucket — Admin Access Only, Max 5 MB) *
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => setIdCardFile(e.target.files?.[0] || null)}
                  className="w-full p-2.5 rounded-xl bg-surface-container-low text-body-sm text-on-surface"
                />
              </div>

              <button
                type="submit"
                disabled={submittingVerif}
                className="h-11 px-5 rounded-xl bg-primary text-on-primary text-label-md font-semibold disabled:opacity-50"
              >
                {submittingVerif ? 'Uploading securely...' : 'Submit College ID for Review'}
              </button>
            </form>
          )}

          {verifHistory.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-surface-container">
              <h3 className="text-label-md font-semibold text-on-surface">
                Verification Submissions
              </h3>
              {verifHistory.map((req) => (
                <div
                  key={req.id}
                  className="p-3 rounded-xl bg-surface-container-low flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-label-md font-medium text-on-surface">
                      {req.college_name} • Roll #{req.student_roll_number}
                    </p>
                    {req.review_notes && (
                      <p className="text-body-sm text-on-surface-variant mt-0.5">
                        Note: {req.review_notes}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase ${
                      req.status === 'approved'
                        ? 'bg-primary-fixed text-on-primary-fixed'
                        : req.status === 'rejected'
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-tertiary-fixed text-on-tertiary-fixed'
                    }`}
                  >
                    {req.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Privacy, Notifications, Blocked Users & Account Deletion */}
      {activeTab === 'privacy' && (
        <div className="space-y-5">
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-4">
            <h2 className="text-title-md font-semibold text-on-surface">
              Privacy &amp; Notification Controls
            </h2>

            <div className="space-y-2.5">
              <label className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low cursor-pointer">
                <span className="text-body-md text-on-surface">
                  Show my student profile in FlatMate peer matching
                </span>
                <input
                  type="checkbox"
                  checked={showInFlatmates}
                  onChange={(e) => setShowInFlatmates(e.target.checked)}
                  className="w-5 h-5 accent-primary"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low cursor-pointer">
                <span className="text-body-md text-on-surface">
                  Display my current semester on public cards
                </span>
                <input
                  type="checkbox"
                  checked={showSemester}
                  onChange={(e) => setShowSemester(e.target.checked)}
                  className="w-5 h-5 accent-primary"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low cursor-pointer">
                <span className="text-body-md text-on-surface">
                  Allow incoming flatmate connection requests
                </span>
                <input
                  type="checkbox"
                  checked={allowConnections}
                  onChange={(e) => setAllowConnections(e.target.checked)}
                  className="w-5 h-5 accent-primary"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                <label className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low cursor-pointer">
                  <span className="text-body-sm text-on-surface">Room inquiry alerts</span>
                  <input
                    type="checkbox"
                    checked={notifFlats}
                    onChange={(e) => setNotifFlats(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                </label>
                <label className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low cursor-pointer">
                  <span className="text-body-sm text-on-surface">Flatmate match alerts</span>
                  <input
                    type="checkbox"
                    checked={notifMatches}
                    onChange={(e) => setNotifMatches(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                </label>
                <label className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low cursor-pointer">
                  <span className="text-body-sm text-on-surface">BookBridge handover alerts</span>
                  <input
                    type="checkbox"
                    checked={notifBooks}
                    onChange={(e) => setNotifBooks(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                </label>
                <label className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low cursor-pointer">
                  <span className="text-body-sm text-on-surface">Direct message alerts</span>
                  <input
                    type="checkbox"
                    checked={notifMessages}
                    onChange={(e) => setNotifMessages(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={savingSettings}
                onClick={handleSavePrivacyAndNotifs}
                className="h-10 px-5 rounded-xl bg-primary text-on-primary text-label-md font-semibold disabled:opacity-50"
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>

          {/* Blocked Peers */}
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-3">
            <h2 className="text-title-md font-semibold text-on-surface">Blocked Peers</h2>
            {blockedList.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant">
                You have not blocked any campus users.
              </p>
            ) : (
              <div className="space-y-2">
                {blockedList.map((b) => (
                  <div
                    key={b.id}
                    className="p-3 rounded-xl bg-surface-container-low flex items-center justify-between"
                  >
                    <span className="text-label-md text-on-surface">
                      {b.blocked_user?.full_name || 'Blocked User'}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await unblockUser(b.blocked_id);
                        setBlockedList((prev) => prev.filter((item) => item.id !== b.id));
                        showToast({ variant: 'info', title: 'User unblocked' });
                      }}
                      className="px-3 py-1 rounded-lg bg-surface-container text-label-sm text-primary font-semibold"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Account Deletion */}
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs border border-error/25 space-y-3">
            <h2 className="text-title-md font-semibold text-error">Delete Account &amp; Data</h2>
            <p className="text-body-sm text-on-surface-variant">
              Permanently deletes your authentication credentials, student profile, listings,
              uploaded photos, and active requests, releasing any reserved textbooks back to the
              community.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={deleteConfirmWord}
                onChange={(e) => setDeleteConfirmWord(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="flex-1 h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
              />
              <button
                type="button"
                disabled={deletingAccount || deleteConfirmWord !== 'DELETE'}
                onClick={handleAccountDeletion}
                className="h-11 px-5 rounded-xl bg-error text-on-error text-label-md font-semibold disabled:opacity-40"
              >
                {deletingAccount ? 'Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
