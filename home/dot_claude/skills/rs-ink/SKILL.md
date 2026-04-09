---
name: rs-ink
description: Use when building terminal UIs with Ink (React for CLI), @inkjs/ui components, or ink-testing-library. Covers layout, input handling, focus, theming, testing, and common pitfalls.
---

# Ink Terminal UI

## Overview

**Ink** is React for the terminal — components render to stdout using Yoga (Facebook's flexbox engine). **@inkjs/ui** provides higher-level components (TextInput, Select, Spinner, etc.) with a theme system. Together they power full TUI applications.

## When to Use

- Building or modifying any terminal UI component using `ink`
- Working with `@inkjs/ui` components (TextInput, Select, Badge, etc.)
- Writing tests with `ink-testing-library`
- Debugging layout, input handling, or focus issues in TUI apps

## Quick Reference

### Ink Primitives

| Component     | Purpose                                     | Key Gotcha                                     |
| ------------- | ------------------------------------------- | ---------------------------------------------- |
| `<Box>`       | Flexbox container (`display: flex` default) | Not for text — wrap text in `<Text>`           |
| `<Text>`      | Only way to render text                     | Never put raw strings in `<Box>`               |
| `<Spacer>`    | `flexGrow: 1` shorthand                     | Equivalent to `<Box flexGrow={1} />`           |
| `<Static>`    | Append-only log above TUI                   | Updates to rendered items are silently ignored |
| `<Transform>` | Per-line text transformation                | Must not change output dimensions              |

### Ink Hooks

| Hook                                     | Returns                                            | Key Gotcha                                             |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| `useInput(handler, {isActive?})`         | void                                               | `input` is empty for non-printable keys; check `key.*` |
| `useApp()`                               | `{exit, waitUntilRenderFlush}`                     | `exit(Error)` rejects `waitUntilExit()`                |
| `useStdin()`                             | `{stdin, isRawModeSupported, setRawMode}`          | `setRawMode()` throws if `!isRawModeSupported`         |
| `useStdout()` / `useStderr()`            | `{stdout/stderr, write}`                           | `write()` bypasses Ink rendering                       |
| `useWindowSize()`                        | `{columns, rows}`                                  | Auto-rerenders on resize                               |
| `useBoxMetrics(ref)`                     | `{width, height, left, top, hasMeasured}`          | Returns zeros until first layout pass                  |
| `useFocus({autoFocus?, isActive?, id?})` | `{isFocused}`                                      | Tab/Shift+Tab cycles; `isActive: false` skips          |
| `useFocusManager()`                      | `{focus, focusNext, focusPrevious, activeId, ...}` | Global enable/disable available                        |
| `useCursor()`                            | `{setCursorPosition}`                              | Use `string-width` for correct x with CJK              |
| `usePaste(handler, {isActive?})`         | void                                               | Independent from `useInput`                            |

### @inkjs/ui Components

| Component                       | Key Props                                                    | Notes                                                   |
| ------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| `TextInput`                     | `placeholder, defaultValue, suggestions, onChange, onSubmit` | Has headless hooks: `useTextInput`, `useTextInputState` |
| `Select`                        | `options, defaultValue, visibleOptionCount, onChange`        | Options: `{label, value}[]`                             |
| `MultiSelect`                   | Same as Select + `onSubmit`                                  | Space toggles, Enter submits                            |
| `ConfirmInput`                  | `defaultChoice, onConfirm, onCancel`                         | Y/N keys, Enter for default                             |
| `Spinner`                       | `label, type`                                                | Types from `cli-spinners` package                       |
| `ProgressBar`                   | `value` (0-100)                                              | Auto-fills width (`flexGrow: 1`)                        |
| `Badge`                         | `children, color`                                            | Auto-uppercased, default magenta                        |
| `Alert`                         | `variant, title, children`                                   | Bordered box with icon                                  |
| `StatusMessage`                 | `variant, children`                                          | Inline icon + message (no border)                       |
| `EmailInput`                    | `domains, placeholder, onChange, onSubmit`                   | Domain autocomplete after `@`                           |
| `PasswordInput`                 | `placeholder, onChange, onSubmit`                            | Renders `*` for each char                               |
| `OrderedList` / `UnorderedList` | `children` (`.Item` subcomponents)                           | Supports nesting                                        |

All components accept `isDisabled` prop.

## Core Patterns

### Layout: Flexbox Mental Model

Ink uses Yoga — same flexbox as React Native. Default is `flexDirection: 'row'`.

```tsx
// Horizontal layout (default)
<Box>
  <Box width="30%"><Text>Sidebar</Text></Box>
  <Box flexGrow={1}><Text>Content</Text></Box>
</Box>

// Vertical layout
<Box flexDirection="column" height={20}>
  <Box height={1}><Text>Header</Text></Box>
  <Box flexGrow={1}><Text>Body</Text></Box>
  <Box height={1}><Text>Footer</Text></Box>
</Box>

// Centering
<Box alignItems="center" justifyContent="center">
  <Text>Centered</Text>
</Box>
```

### Input Handling: Layered useInput

Use `isActive` to create input layers — only one layer processes input at a time.

```tsx
function MyView() {
  const [modalOpen, setModalOpen] = useState(false);

  // Main input — disabled when modal is open
  useInput(
    (input, key) => {
      if (input === "?") setModalOpen(true);
      if (key.escape) onBack();
    },
    { isActive: !modalOpen },
  );

  // Modal input — only active when modal is open
  useInput(
    (input, key) => {
      if (key.escape) setModalOpen(false);
    },
    { isActive: modalOpen },
  );

  return (
    <Box flexDirection="column">
      <Text>Main content</Text>
      {modalOpen && <Modal onClose={() => setModalOpen(false)} />}
    </Box>
  );
}
```

### Scrollable Lists

Ink has no built-in scrolling. Track offset manually:

```tsx
function ScrollableList({
  items,
  height,
}: {
  items: string[];
  height: number;
}) {
  const [selected, setSelected] = useState(0);
  const [offset, setOffset] = useState(0);

  useInput((input, key) => {
    if (key.downArrow || input === "j") {
      const next = Math.min(selected + 1, items.length - 1);
      setSelected(next);
      if (next >= offset + height) setOffset(next - height + 1);
    }
    if (key.upArrow || input === "k") {
      const prev = Math.max(selected - 1, 0);
      setSelected(prev);
      if (prev < offset) setOffset(prev);
    }
  });

  const visible = items.slice(offset, offset + height);
  return (
    <Box flexDirection="column">
      {visible.map((item, i) => (
        <Text key={offset + i} inverse={offset + i === selected}>
          {item}
        </Text>
      ))}
    </Box>
  );
}
```

### Modal/Overlay Pattern

Use `position="absolute"` for floating overlays:

```tsx
function ModalOverlay({ children, onClose }) {
  useInput((_, key) => {
    if (key.escape) onClose();
  });

  return (
    <Box
      position="absolute"
      marginLeft={4}
      marginTop={2}
      borderStyle="round"
      borderColor="blue"
      flexDirection="column"
      padding={1}
    >
      {children}
    </Box>
  );
}
```

### Alternate Screen Buffer

For full-screen TUI apps, manage the alternate screen:

```tsx
const ENTER_ALT = "\x1b[?1049h";
const EXIT_ALT = "\x1b[?1049l";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

process.stdout.write(ENTER_ALT + HIDE_CURSOR);
const cleanup = () => process.stdout.write(SHOW_CURSOR + EXIT_ALT);
process.on("exit", cleanup);
["SIGINT", "SIGTERM"].forEach((s) =>
  process.on(s, () => {
    cleanup();
    process.exit();
  }),
);
```

### @inkjs/ui Theme Customization

```tsx
import { ThemeProvider, defaultTheme, extendTheme } from "@inkjs/ui";

const theme = extendTheme(defaultTheme, {
  components: {
    Spinner: {
      styles: { frame: () => ({ color: "cyan" }) },
    },
    ProgressBar: {
      config: () => ({ completedCharacter: "#", remainingCharacter: "." }),
    },
  },
});

<ThemeProvider theme={theme}>
  <App />
</ThemeProvider>;
```

## Testing with ink-testing-library

```tsx
import { render } from "ink-testing-library";

it("renders and handles input", async () => {
  const { lastFrame, stdin } = render(<MyComponent />);

  // Assert rendered content
  expect(lastFrame()).toContain("expected text");

  // Simulate keypress
  stdin.write("j"); // character
  stdin.write("\r"); // Enter
  stdin.write("\x1B"); // Escape
  stdin.write("\x1B[A"); // Up arrow
  stdin.write("\x1B[B"); // Down arrow
  stdin.write("\t"); // Tab

  // Wait for state update
  await new Promise((r) => setTimeout(r, 50));
  expect(lastFrame()).toContain("updated");
});
```

**Key input sequences:**
| Key | Sequence | | Key | Sequence |
|-----|----------|-|-----|----------|
| Enter | `\r` | | Escape | `\x1B` |
| Tab | `\t` | | Backspace | `\x7F` |
| Up | `\x1B[A` | | Down | `\x1B[B` |
| Left | `\x1B[D` | | Right | `\x1B[C` |
| Ctrl+C | `\x03` | | Space | ` ` |

## Critical Gotchas

1. **Text must be in `<Text>`** — raw strings inside `<Box>` throw errors
2. **`<Static>` is append-only** — updates to already-rendered items are silently ignored
3. **`measureElement` / `useBoxMetrics` return zeros during render** — use `useEffect` or check `hasMeasured`
4. **`setRawMode()` throws in CI** — always guard with `isRawModeSupported`
5. **`renderToString` is synchronous** — `useEffect` callbacks don't run (only `useLayoutEffect`)
6. **`useInput` input is empty for special keys** — always check `key.*` properties, not `input`
7. **CI renders only final frame** — no animation, no resize events
8. **No native scrolling** — implement scroll offset manually (see pattern above)
9. **`patchConsole: true` (default)** — `console.log` renders above Ink UI; disable if managing stdout yourself
10. **`overflow: 'hidden'`** — required to clip content in fixed-height containers; without it content bleeds

## Full API Reference

See supporting files for complete API details:

- `ink-api.md` — All Ink components, hooks, utilities, render options, type exports
- `ink-ui-api.md` — All @inkjs/ui components, theme system, headless hooks, style signatures
