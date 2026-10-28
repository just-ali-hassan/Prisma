# Prisma — Design System

---

## 1. Design Principles

### Modern Minimal

Clean, functional, focused on content. The interface stays out of the way. No decoration for decoration's sake. Think
Linear, Figma, or VS Code — tools that feel capable without intimidation.

### Customizable First

Support both light and dark modes from day one. Users should be able to switch freely. Default to the system preference
on first launch.

### Fast and Direct

Minimal animations. Fast transitions. Instant feedback. The UI should feel responsive, not laggy or overly animated.
Motion is purposeful, not decorative.

### Information-Dense but Not Overwhelming

Vibe coders (developers and no-code builders) want access to controls without hunting. Show capabilities clearly (model
picker, parameters, tools) but collapse them when not in use. Progressive disclosure: simple by default, powerful when
needed.

### Consistent Across Platforms

Mobile and desktop share the same visual language — same colors, same spacing scale, same typography principles. The
layout adapts to screen size and input method (touch vs mouse), but the design feels unified.

### Accessible by Default

WCAG AA contrast ratios. Keyboard navigation. Screen reader support. Touch targets at least 44×44px on mobile. Focus
indicators on all interactive elements.

---

## 2. Color Palette

### Design Token Structure

Colors are defined as CSS variables (desktop) and exported as JS objects (mobile). The same semantic tokens work in both
light and dark modes.

### Accent Color

**Primary:** NVIDIA Green `#76B900`

A metallic lime-green. Used for primary actions, active states, highlights, and focus indicators. High energy without
being harsh.

### Neutral Scale (Light Mode)

| Token              | Hex       | Usage                            |
| ------------------ | --------- | -------------------------------- |
| `--background`     | `#FFFFFF` | Page background                  |
| `--surface`        | `#F9FAFB` | Card, panel, elevated surface    |
| `--surface-hover`  | `#F3F4F6` | Hover state for surface elements |
| `--border`         | `#E5E7EB` | Dividers, input borders          |
| `--border-hover`   | `#D1D5DB` | Border on hover                  |
| `--text-primary`   | `#111827` | Body text, headings              |
| `--text-secondary` | `#6B7280` | Secondary text, labels           |
| `--text-tertiary`  | `#9CA3AF` | Placeholders, disabled text      |
| `--text-inverse`   | `#FFFFFF` | Text on dark backgrounds         |

### Neutral Scale (Dark Mode)

| Token              | Hex       | Usage                            |
| ------------------ | --------- | -------------------------------- |
| `--background`     | `#0A0A0A` | Page background                  |
| `--surface`        | `#1A1A1A` | Card, panel, elevated surface    |
| `--surface-hover`  | `#2A2A2A` | Hover state for surface elements |
| `--border`         | `#2A2A2A` | Dividers, input borders          |
| `--border-hover`   | `#3A3A3A` | Border on hover                  |
| `--text-primary`   | `#F9FAFB` | Body text, headings              |
| `--text-secondary` | `#D1D5DB` | Secondary text, labels           |
| `--text-tertiary`  | `#9CA3AF` | Placeholders, disabled text      |
| `--text-inverse`   | `#111827` | Text on light backgrounds        |

### Semantic Colors

These are mode-agnostic — same token name, different values per mode.

| Token                    | Light Mode | Dark Mode | Usage                                 |
| ------------------------ | ---------- | --------- | ------------------------------------- |
| `--accent-primary`       | `#76B900`  | `#76B900` | Primary actions, links, active states |
| `--accent-primary-hover` | `#669F00`  | `#85C914` | Hover state for primary actions       |
| `--accent-primary-text`  | `#FFFFFF`  | `#0A0A0A` | Text on primary background            |
| `--success`              | `#10B981`  | `#34D399` | Success messages, positive indicators |
| `--warning`              | `#F59E0B`  | `#FBBF24` | Warnings, caution states              |
| `--error`                | `#EF4444`  | `#F87171` | Errors, destructive actions           |
| `--info`                 | `#3B82F6`  | `#60A5FA` | Info messages, neutral highlights     |

### Usage Guidelines

**Primary Accent (`#76B900`)**

- Primary buttons and CTAs
- Active tab indicators
- Selected items in lists
- Focus rings (with 20% opacity overlay)
- Links in markdown content
- Progress indicators
- Active model in model picker

**Neutral Grays**

- Use sparingly. Prisma is not a gray app — the accent color should be prominent.
- Background and surface layers provide structure, not visual weight.
- Text hierarchy through size and weight, not just color.

**Semantic Colors**

- Success: agent task completed, file uploaded successfully
- Warning: model approaching context limit, rate limit warning
- Error: API key invalid, network failed, tool execution error
- Info: model doesn't support feature, fallback route activated

---

## 3. Typography

### Typefaces

**System Fonts**

Use the OS native sans-serif font stack. Zero latency, perfect integration, familiar to users.

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```

**Mobile (React Native):**

- iOS: San Francisco (system default)
- Android: Roboto (system default)

**Desktop (Tauri):**

- macOS: San Francisco
- Windows: Segoe UI
- Linux: system default (usually Liberation Sans or similar)

**Monospace (Code Blocks)**

Use the system monospace stack for code blocks, JSON output, and fixed-width content.

```css
font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
```

### Type Scale

Base font size: `16px` (1rem)

| Token         | Size | Line Height | Weight | Usage                               |
| ------------- | ---- | ----------- | ------ | ----------------------------------- |
| `--text-xs`   | 12px | 16px        | 400    | Captions, timestamps, metadata      |
| `--text-sm`   | 14px | 20px        | 400    | Secondary text, labels, helper text |
| `--text-base` | 16px | 24px        | 400    | Body text, messages, paragraphs     |
| `--text-lg`   | 18px | 28px        | 500    | Emphasized body, section titles     |
| `--text-xl`   | 20px | 28px        | 600    | Subheadings, card titles            |
| `--text-2xl`  | 24px | 32px        | 600    | Page headings                       |
| `--text-3xl`  | 30px | 36px        | 700    | Hero headings (desktop only)        |

### Font Weights

| Token             | Weight | Usage                             |
| ----------------- | ------ | --------------------------------- |
| `--font-normal`   | 400    | Body text, labels                 |
| `--font-medium`   | 500    | Emphasized text, active tabs      |
| `--font-semibold` | 600    | Headings, buttons                 |
| `--font-bold`     | 700    | Hero text, strong emphasis (rare) |

### Usage Guidelines

**Body Text:** `--text-base`, `--font-normal` Default for all message content, paragraphs, settings descriptions.

**Labels and Secondary Text:** `--text-sm`, `--font-normal`, `--text-secondary` Input labels, timestamps, model names,
token counts.

**Headings:**

- Page titles: `--text-2xl`, `--font-semibold`
- Section headings: `--text-lg`, `--font-medium`

**Buttons:** `--text-sm` or `--text-base`, `--font-medium`

**Code Blocks:** `--text-sm`, monospace font family

**Line Height:** Generous line height for readability. Messages can be long — give them space.

---

## 4. UI Components

### Spacing Scale

Base unit: `4px`

| Token        | Value | Usage                                  |
| ------------ | ----- | -------------------------------------- |
| `--space-1`  | 4px   | Tight padding, icon gaps               |
| `--space-2`  | 8px   | Small padding, button padding vertical |
| `--space-3`  | 12px  | Input padding, compact spacing         |
| `--space-4`  | 16px  | Default padding, card padding          |
| `--space-5`  | 20px  | Comfortable padding                    |
| `--space-6`  | 24px  | Large padding, section spacing         |
| `--space-8`  | 32px  | Extra large padding, page margins      |
| `--space-10` | 40px  | XXL spacing (rare)                     |
| `--space-12` | 48px  | Page header height, major sections     |
| `--space-16` | 64px  | Hero spacing (desktop only)            |

### Border Radius

Small, subtle rounding.

| Token           | Value  | Usage                                    |
| --------------- | ------ | ---------------------------------------- |
| `--radius-sm`   | 4px    | Buttons, tags, badges                    |
| `--radius-md`   | 6px    | Inputs, small cards                      |
| `--radius-lg`   | 8px    | Cards, modals, panels                    |
| `--radius-xl`   | 12px   | Large cards (rare)                       |
| `--radius-full` | 9999px | Circular elements (avatar, icon buttons) |

### Shadows

Subtle elevation. Use sparingly — most elements sit flat.

| Token         | Value                          | Usage                    |
| ------------- | ------------------------------ | ------------------------ |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)`   | Hover state, slight lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.07)`   | Cards, dropdowns         |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)`  | Modals, popovers         |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Major overlays (rare)    |

In dark mode, shadows are less visible. Add a subtle border (`--border`) to elevated elements instead.

### Component Specifications

#### Buttons

**Primary Button**

- Background: `--accent-primary`
- Text: `--accent-primary-text`
- Padding: `--space-2` vertical, `--space-4` horizontal
- Border radius: `--radius-sm`
- Font: `--text-sm`, `--font-medium`
- Height: 36px (mobile: 44px for touch target)
- Hover: `--accent-primary-hover` background
- Focus: 2px ring, `--accent-primary` at 40% opacity, 2px offset

**Secondary Button**

- Background: `--surface`
- Text: `--text-primary`
- Border: 1px solid `--border`
- Same padding, radius, font as primary
- Hover: `--surface-hover` background, `--border-hover` border

**Ghost Button**

- Background: transparent
- Text: `--text-primary`
- No border
- Hover: `--surface-hover` background

**Icon Button**

- Size: 36×36px (mobile: 44×44px)
- Background: transparent
- Icon size: 20px
- Border radius: `--radius-sm`
- Hover: `--surface-hover` background

#### Inputs

**Text Input**

- Background: `--background`
- Border: 1px solid `--border`
- Border radius: `--radius-md`
- Padding: `--space-3` vertical, `--space-4` horizontal
- Font: `--text-base`
- Height: 40px (mobile: 44px)
- Focus: border becomes `--accent-primary`, 2px ring at 20% opacity
- Error: border becomes `--error`, error message below in `--text-sm`

**Textarea (Message Input)**

- Same as text input but variable height
- Min height: 44px (single line)
- Max height: 200px (then scroll)
- Resize: vertical only (desktop), auto-grow (mobile)

**Select / Dropdown**

- Same styling as text input
- Chevron icon on right, 12px, `--text-tertiary`
- Dropdown menu: `--surface` background, `--shadow-md`, `--radius-lg`

#### Chat UI

**Message Container**

- Flat list layout (no bubbles)
- Messages stacked vertically with `--space-4` between
- Each message: full width, left-aligned
- No background color for message content — sits on `--background`
- User messages: subtle left border (2px, `--accent-primary`)
- Assistant messages: no border
- Tool call messages: subtle left border (2px, `--info`)

**Message Structure**

```
┌─────────────────────────────────────┐
│ [Avatar] [Role] [Model] [Timestamp] │  ← Header (--text-sm, --text-secondary)
│                                     │
│ Message content goes here...        │  ← Content (--text-base, --text-primary)
│ Can be multiple paragraphs.         │
│                                     │
│ [Tool calls / attachments / etc]    │  ← Optional meta content
└─────────────────────────────────────┘
```

**Avatar**

- Size: 24px
- Border radius: `--radius-full`
- User: first letter of username or icon
- Assistant: model icon or generic AI icon
- Background: `--surface`, border: 1px `--border`

**Code Blocks in Messages**

- Background: `--surface`
- Border: 1px solid `--border`
- Border radius: `--radius-md`
- Padding: `--space-3`
- Font: monospace, `--text-sm`
- Syntax highlighting: use a minimal theme (GitHub Light for light mode, GitHub Dark for dark mode)
- Copy button: top-right corner, ghost icon button

**Tool Call Card**

- Background: `--surface`
- Border: 1px solid `--border`
- Border radius: `--radius-lg`
- Padding: `--space-4`
- Header: tool name, status icon (pending/success/error)
- Collapsible: show args/result on tap/click
- Status colors: `--warning` (pending), `--success` (done), `--error` (failed)

#### Model Picker

**Collapsed State**

- Shows current model name and icon
- Text: `--text-sm`, `--font-medium`
- Background: `--surface`, border: 1px `--border`
- Border radius: `--radius-sm`
- Click to expand

**Expanded State**

- Dropdown or modal (mobile: bottom sheet)
- Background: `--surface`, shadow: `--shadow-lg`
- Group by provider
- Each model: name, capability badges (vision, tools, etc.), max context
- Selected model: `--accent-primary` background, `--accent-primary-text` text
- Capability badge: small pill, `--radius-full`, `--text-xs`, `--surface-hover` background

#### Settings Panel

**Layout**

- Sidebar (desktop) or full screen (mobile)
- Sections: Keys, Preferences, Projects, Connectors, About
- Section headers: `--text-lg`, `--font-medium`
- Section dividers: 1px `--border`

**API Key Input**

- Label: provider name + icon
- Input: text input (type=password), show/hide toggle
- Save button: primary, small
- Saved indicator: checkmark, `--success` color

**Parameter Sliders**

- Temperature, max tokens, top-p, etc.
- Label + value display above slider
- Slider track: `--border` color
- Slider fill: `--accent-primary`
- Slider thumb: 16px circle, `--accent-primary`, `--shadow-sm`

#### Modals & Dialogs

**Modal Overlay**

- Background: `rgba(0, 0, 0, 0.5)` (light mode), `rgba(0, 0, 0, 0.7)` (dark mode)
- Click outside to dismiss (unless critical action)

**Modal Content**

- Background: `--surface`
- Border radius: `--radius-lg`
- Shadow: `--shadow-xl`
- Padding: `--space-6`
- Max width: 500px (desktop), full width minus margins (mobile)

**Dialog Actions**

- Footer with buttons right-aligned
- Primary action: primary button
- Cancel action: secondary button
- Space between buttons: `--space-3`

#### Loading States

**Spinner**

- Size: 20px (small), 32px (medium), 48px (large)
- Color: `--accent-primary`
- Animation: continuous rotation, 0.8s duration

**Skeleton Loader**

- Background: `--surface`
- Shimmer animation: subtle gradient sweep, 1.5s duration
- Shape matches content (text lines, cards, etc.)

**Streaming Indicator**

- Pulsing dot next to assistant avatar while streaming
- Color: `--accent-primary`
- Animation: fade in/out, 1s duration

### Icons

**Icon System:** Lucide

Lucide is clean, consistent, and works in both React Native and React (web). 1000+ icons. MIT licensed.

**Icon Sizes:**

- Small: 16px (inline with text)
- Medium: 20px (buttons, UI controls)
- Large: 24px (prominent actions, headers)

**Icon Colors:**

- Default: `--text-secondary`
- Active: `--accent-primary`
- Error: `--error`
- Success: `--success`

**Common Icons:**

- Send message: `Send`
- Attach file: `Paperclip`
- Voice input: `Mic`
- Stop generation: `Square`
- Settings: `Settings`
- History: `History`
- Projects: `Folder`
- Tools: `Wrench`
- Model picker: `BrainCircuit` or `Sparkles`
- Copy: `Copy`
- Check (done): `Check`
- Error: `AlertCircle`

### Animation

**Minimal, Purposeful Motion**

Animations should be fast and functional. No decorative motion.

**Transition Durations:**

- Fast: 150ms (hover, focus, small state changes)
- Normal: 250ms (modals, panels, navigation)
- Slow: 350ms (page transitions, large UI changes)

**Easing:**

- Default: `cubic-bezier(0.4, 0, 0.2, 1)` (ease-in-out)
- Enter: `cubic-bezier(0, 0, 0.2, 1)` (ease-out)
- Exit: `cubic-bezier(0.4, 0, 1, 1)` (ease-in)

**What to Animate:**

- Button hover: background color (150ms)
- Focus rings: opacity (150ms)
- Dropdown/modal open: opacity + scale (250ms)
- Page transitions: slide + fade (350ms)
- Streaming tokens: fade in (150ms)

**What NOT to Animate:**

- Text typing effects (just stream the tokens in)
- Decorative particle effects
- Overly bouncy springs
- Long, drawn-out transitions

### Component Library

**Radix UI (Headless, Unstyled)**

Use Radix UI primitives for complex components. Radix handles accessibility, keyboard navigation, focus management, and
ARIA attributes. We provide the styling.

**Radix Components to Use:**

- `@radix-ui/react-dialog` for modals
- `@radix-ui/react-dropdown-menu` for dropdowns
- `@radix-ui/react-select` for selects
- `@radix-ui/react-slider` for parameter sliders
- `@radix-ui/react-switch` for toggles
- `@radix-ui/react-tabs` for tabs
- `@radix-ui/react-tooltip` for tooltips
- `@radix-ui/react-popover` for popovers

**Mobile (React Native):** Radix doesn't work in React Native. Build equivalents using RN primitives (View, Text,
Pressable, Modal, etc.) following the same design tokens.

---

## Implementation Notes

### Desktop (Tailwind)

Extend the Tailwind config with the design tokens:

```js
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        accent: {
          primary: '#76B900',
          'primary-hover': '#669F00',
          'primary-text': '#FFFFFF',
        },
        background: 'var(--background)',
        surface: 'var(--surface)',
        // ... etc
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        // ... etc
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        full: '9999px',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
};
```

### Mobile (StyleSheet)

Export design tokens as JS constants and use them in StyleSheet definitions:

```typescript
// apps/mobile/theme/tokens.ts
export const colors = {
  accent: {
    primary: '#76B900',
    primaryHover: '#669F00',
    primaryText: '#FFFFFF',
  },
  light: {
    background: '#FFFFFF',
    surface: '#F9FAFB',
    // ... etc
  },
  dark: {
    background: '#0A0A0A',
    surface: '#1A1A1A',
    // ... etc
  },
};

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  // ... etc
};

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
};
```

Use in StyleSheet:

```typescript
import { colors, spacing, radius } from '@/theme/tokens';

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent.primary,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radius.sm,
  },
});
```

### Theme Switching

Detect system preference on first launch. Provide a toggle in settings. Store preference in local storage (desktop) or
AsyncStorage (mobile).

```typescript
// Example hook
function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(savedTheme || systemTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  return { theme, toggleTheme };
}
```

Apply theme by toggling a class on the root element (desktop) or a context provider (mobile).

---

_Last updated: 2026-10-25_
