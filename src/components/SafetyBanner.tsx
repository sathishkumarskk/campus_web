import React from 'react';

interface SafetyBannerProps {
  mode: 'housing' | 'book_handover';
}

export function SafetyBanner({ mode }: SafetyBannerProps) {
  if (mode === 'housing') {
    return (
      <div className="bg-surface-container-low rounded-xl p-3.5 flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center shrink-0 mt-0.5">
          <span className="material-symbols-outlined text-[18px]">shield</span>
        </div>
        <div className="space-y-1">
          <p className="text-label-md font-semibold text-on-surface">
            Property Visit Safety Guidelines
          </p>
          <p className="text-body-sm text-on-surface-variant leading-relaxed">
            Visit rooms during daylight hours with a campus friend, verify the flat agreement directly
            with existing student tenants or the property owner, and never transfer token money or
            deposits before inspecting the room in person. CampusCircle does not perform physical
            property inspections.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-low rounded-xl p-3.5 flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant flex items-center justify-center shrink-0 mt-0.5">
        <span className="material-symbols-outlined text-[18px]">pin_drop</span>
      </div>
      <div className="space-y-1">
        <p className="text-label-md font-semibold text-on-surface">
          Safe Campus Handover Guidelines
        </p>
        <p className="text-body-sm text-on-surface-variant leading-relaxed">
          Meet strictly at well-lit public campus spots during college hours (Main Library desk,
          Department lobby, Campus Canteen, or Hostel Security Gate). Free Donation textbooks must
          never involve cash or UPI charges—report any payment demand immediately.
        </p>
      </div>
    </div>
  );
}
