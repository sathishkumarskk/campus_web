---
name: CampusCircle Safe System
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3d4947'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#6d7a77'
  outline-variant: '#bcc9c6'
  surface-tint: '#006a61'
  primary: '#00685f'
  on-primary: '#ffffff'
  primary-container: '#008378'
  on-primary-container: '#f4fffc'
  inverse-primary: '#6bd8cb'
  secondary: '#4b41e1'
  on-secondary: '#ffffff'
  secondary-container: '#645efb'
  on-secondary-container: '#fffbff'
  tertiary: '#825100'
  on-tertiary: '#ffffff'
  tertiary-container: '#a36700'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#89f5e7'
  primary-fixed-dim: '#6bd8cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#005049'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c3c0ff'
  on-secondary-fixed: '#0f0069'
  on-secondary-fixed-variant: '#3323cc'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes a high-trust, functional, and modern student-utility aesthetic tailored for Indian collegiate hubs (Bengaluru, Chennai, Hyderabad, Coimbatore). The experience balances two primary verticals: housing/flatmate discovery (high friction, security-critical) and peer-to-peer textbook exchange (community-driven, velocity-focused). 

The emotional tone must inspire immediate safety, authentic peer accountability, and clear operational utility. The aesthetic leverages modern corporate minimalism: structural white card surfaces, soft structural borders, clean atmospheric shadows, and measured teal accents to avoid the casual clutter typical of student bulletin boards while retaining approachable warmth.

## Colors

The palette establishes clarity, institutional dependability, and crisp legibility in high ambient light:

- **Primary Teal (`#0D9488`)**: Represents safety, campus credibility, and successful transactions. Used for main calls to action, active navigation states, verified student badges, and affirmative feedback.
- **Secondary Indigo (`#4F46E5`)**: Dedicated to discovery, messaging, and academic categories (e.g., textbook condition labels, chat triggers, department indicators).
- **Tertiary Amber (`#F59E0B`)**: Used for urgency markers, deposit warnings, verified availability tags, and bookmarking.
- **Neutral Dark Slate (`#0F172A`)**: The primary ink token, offering superior high-contrast readability compared to pure black without harsh edge artifacts.
- **Canvas & Surface Foundation**: Backgrounds leverage a warm off-white (`#F8FAFC`), layered with pure `#FFFFFF` cards, framed by low-contrast borders (`#E2E8F0`) to maintain discrete grouping across dense listings.

## Typography

Inter serves as the singular typographic foundation, creating clear visual hierarchy through weight calibration rather than stylistic mixing.

- **Headlines & Display**: Rendered with tighter tracking (`-0.01em` to `-0.02em`) and semi-bold/bold weights to anchor marketplace listings, pricing, and apartment names.
- **Body & Data Attributes**: Set at standard line heights (`1.45` to `1.55`) to facilitate rapid scanning of amenities, textbook editions, roommate preferences, and rent inclusions.
- **Labels & Microcopy**: Medium and semi-bold weights support micro-tags, verified status badges, and academic course codes without breaking horizontal rhythm.

## Layout & Spacing

The layout model is built on an 8pt spatial grid with an underlying 4pt baseline for fine alignment:

- **Mobile (< 768px)**: 4-column fluid layout with `1rem` margins and `1rem` gutters. Cards stack vertically into unified informational blocks.
- **Tablet (768px - 1024px)**: 8-column layout with `2rem` margins. Split views allow browsing on the left and detail review on the right for room inventories.
- **Desktop (> 1024px)**: 12-column layout centered at a max width of 1280px with `3rem` margins and `1.5rem` gutters. Accommodates map views, dual listing feeds, and multi-tier filter sidebars.
- **Internal Component Spacing**: Micro elements (chips, button labels) rely on `space-xs` and `space-sm`. Structural cards and forms maintain `space-md` to `space-lg` internal paddings.

## Elevation & Depth

Visual hierarchy is maintained through soft, diffused ambient light paired with crisp 1px borders, avoiding heavy shadows:

- **Surface Layer 0 (Canvas)**: Background canvas `#F8FAFC` providing soft contrast against interactive blocks.
- **Surface Layer 1 (Card & Modular Units)**: Pure `#FFFFFF` background bound by a 1px solid `#E2E8F0` border. Ambient shadow: `0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.04)`.
- **Surface Layer 2 (Hover & Active Listing Cards)**: Elevated during user focus or card hover. Ambient shadow: `0 8px 16px -4px rgba(15, 23, 42, 0.08), 0 4px 6px -2px rgba(15, 23, 42, 0.03)`. Border shifts dynamically to `#CBD5E1`.
- **Surface Layer 3 (Floating Sheets, Popovers & Modals)**: Structural dropdowns, contact dialogues, and filter drawers. Ambient shadow: `0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.04)` surrounded by `#E2E8F0`.

## Shapes

The design uses roundedness level `2`:

- **Primary Cards & Containers (`rounded-lg` / 16px)**: Encloses listing cards, amenity clusters, and user profile summaries to create an approachable, friendly shape.
- **Interactive Controls (`rounded` / 8px to 12px)**: Primary action buttons, input fields, and search selectors use 12px for clear affordance and touch target definition.
- **Micro-Badges & Tags (`rounded-sm` / 4px to 6px)**: Course IDs, status indicators, and room configuration pills use smaller corner radii for crisp data display.

## Components

### Buttons
- **Primary**: Solid teal (`#0D9488`) background, `#FFFFFF` text, 12px corner radius, horizontal padding of `1.25rem`, vertical padding of `0.625rem`. Label set to `label-md`. Hover shifts to `#0F766E`.
- **Secondary**: Outlined with 1px `#CBD5E1` border, `#0F172A` text, transparent background. Hover transitions to `#F1F5F9`.
- **Accent (Urgent/Action)**: Solid amber (`#F59E0B`) background with white text, used strictly for fast-track textbook claims or high-demand roommate requests.

### Cards
- **Housing Listing Card**: Pure `#FFFFFF` surface with 16px corner radius, 1px `#E2E8F0` border, and Layer 1 elevation. Contains an image carousel (16:10 aspect ratio), followed by title, rent tag in bold slate, distance pill to campus, and verified student avatar badge.
- **Book Listing Card**: Horizontal layout on desktop, vertical on mobile. Displays book cover thumbnail, edition indicator, academic semester tag, and giveaway badge ("Free" in teal or "Exchange" in indigo).

### Chips & Badges
- **Campus Verified Badge**: Subtle teal tint background (`#CCFBF1`), deep teal text (`#115E59`), rounded-sm, incorporating a miniature checkmark icon.
- **Filter Chips**: 8px rounded controls, `#FFFFFF` background with `#E2E8F0` border; shifts to `#0D9488` with white text when selected.

### Input Fields & Controls
- **Text Inputs**: Height of 44px, 12px corner radius, 1px `#CBD5E1` border, background `#FFFFFF`, text `#0F172A`. Active focus produces a 2px outline ring in `#0D9488` with a 2px offset.
- **Checkboxes & Radios**: 18px size, 4px rounded corner for checkboxes, fully circular for radios. Inactive border `#94A3B8`; active state fills `#0D9488` with a white check or center dot.

### Specialized System Components
- **Trust Shield Header**: A standard profile header for flatmate profiles featuring university affiliation, ID verification state, lifestyle tags (vegetarian, night owl, study-first), and clean contact action triggers.
- **Condition Meter**: A 5-bar horizontal indicator for textbook condition (New, Good, Marked, Worn) rendered with `#0D9488` fill tracks.