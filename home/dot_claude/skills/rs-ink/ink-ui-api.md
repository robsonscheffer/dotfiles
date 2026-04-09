# @inkjs/ui v2.0.0 — Full API Reference

**Peer dep:** `ink >= 5` | **Node:** >= 18 | **ESM only**

---

## Shared Type

```ts
type Option = { label: string; value: string };
```

Used by `Select` and `MultiSelect`.

---

## Components

### Alert

Bordered message box with variant icon and coloring.

| Prop       | Type                                          | Required | Default |
| ---------- | --------------------------------------------- | -------- | ------- |
| `children` | `ReactNode`                                   | yes      | —       |
| `variant`  | `'info' \| 'success' \| 'error' \| 'warning'` | yes      | —       |
| `title`    | `string`                                      | no       | —       |

Colors: info=blue, success=green, error=red, warning=yellow. Border: `round`. Icons from `figures`.

### Badge

Inline colored label, auto-uppercased.

| Prop       | Type                 | Required | Default     |
| ---------- | -------------------- | -------- | ----------- |
| `children` | `ReactNode`          | yes      | —           |
| `color`    | `TextProps['color']` | no       | `'magenta'` |

Renders as space-padded inverted text: `<Text backgroundColor={color}> <Text color="black">{LABEL}</Text> </Text>`.

### TextInput

Single-line input with cursor, autocomplete, placeholder.

| Prop           | Type                      | Required | Default |
| -------------- | ------------------------- | -------- | ------- |
| `isDisabled`   | `boolean`                 | no       | `false` |
| `placeholder`  | `string`                  | no       | `''`    |
| `defaultValue` | `string`                  | no       | —       |
| `suggestions`  | `string[]`                | no       | —       |
| `onChange`     | `(value: string) => void` | no       | —       |
| `onSubmit`     | `(value: string) => void` | no       | —       |

**Keyboard:** Left/Right=cursor, Backspace/Delete=remove, Enter=submit (accepts suggestion). Tab/Up/Down/Ctrl+C pass through.

**Headless hooks:** `useTextInputState(props)` — state only. `useTextInput(props)` — state + keyboard wired.

### EmailInput

Email input with domain autocomplete after `@`.

| Prop           | Type                      | Required | Default                                                                                             |
| -------------- | ------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `isDisabled`   | `boolean`                 | no       | `false`                                                                                             |
| `placeholder`  | `string`                  | no       | `''`                                                                                                |
| `defaultValue` | `string`                  | no       | —                                                                                                   |
| `domains`      | `string[]`                | no       | `['aol.com','gmail.com','yahoo.com','hotmail.com','live.com','outlook.com','icloud.com','hey.com']` |
| `onChange`     | `(value: string) => void` | no       | —                                                                                                   |
| `onSubmit`     | `(value: string) => void` | no       | —                                                                                                   |

### PasswordInput

Masked input (renders `*` per character).

| Prop          | Type                      | Required | Default |
| ------------- | ------------------------- | -------- | ------- |
| `isDisabled`  | `boolean`                 | no       | `false` |
| `placeholder` | `string`                  | no       | `''`    |
| `onChange`    | `(value: string) => void` | no       | —       |
| `onSubmit`    | `(value: string) => void` | no       | —       |

### ConfirmInput

Y/N confirmation.

| Prop            | Type                    | Required | Default     |
| --------------- | ----------------------- | -------- | ----------- |
| `isDisabled`    | `boolean`               | no       | `false`     |
| `defaultChoice` | `'confirm' \| 'cancel'` | no       | `'confirm'` |
| `submitOnEnter` | `boolean`               | no       | `true`      |
| `onConfirm`     | `() => void`            | yes      | —           |
| `onCancel`      | `() => void`            | yes      | —           |

Displays `Y/n` when confirm is default, `y/N` when cancel is default.

### Select

Single-selection scrollable list.

| Prop                 | Type                      | Required | Default |
| -------------------- | ------------------------- | -------- | ------- |
| `isDisabled`         | `boolean`                 | no       | `false` |
| `visibleOptionCount` | `number`                  | no       | `5`     |
| `highlightText`      | `string`                  | no       | —       |
| `options`            | `Option[]`                | yes      | —       |
| `defaultValue`       | `string`                  | no       | —       |
| `onChange`           | `(value: string) => void` | no       | —       |

**Keyboard:** Up/Down=navigate, Enter=select. Focused=blue pointer, Selected=green tick.

**Headless:** `useSelectState(props)` returns `{ focusedValue, value, visibleOptions, focusNextOption(), focusPreviousOption(), selectFocusedOption() }`. `useSelect(props)` wires keyboard.

### MultiSelect

Multi-selection scrollable list.

| Prop                 | Type                        | Required | Default |
| -------------------- | --------------------------- | -------- | ------- |
| `isDisabled`         | `boolean`                   | no       | `false` |
| `visibleOptionCount` | `number`                    | no       | `5`     |
| `highlightText`      | `string`                    | no       | —       |
| `options`            | `Option[]`                  | yes      | —       |
| `defaultValue`       | `string[]`                  | no       | —       |
| `onChange`           | `(value: string[]) => void` | no       | —       |
| `onSubmit`           | `(value: string[]) => void` | no       | —       |

**Keyboard:** Up/Down=navigate, Space=toggle, Enter=submit.

**Headless:** `useMultiSelectState(props)`, `useMultiSelect(props)`.

### Spinner

Animated loading indicator.

| Prop    | Type          | Required | Default  |
| ------- | ------------- | -------- | -------- |
| `label` | `string`      | no       | —        |
| `type`  | `SpinnerName` | no       | `'dots'` |

Types from `cli-spinners`: dots, line, arc, bouncingBar, etc.

**Hook:** `useSpinner({type})` returns `{ frame: string }`.

### ProgressBar

Visual progress bar.

| Prop    | Type             | Required | Default |
| ------- | ---------------- | -------- | ------- |
| `value` | `number` (0-100) | yes      | —       |

Uses `measureElement` for width. `flexGrow: 1` by default. Filled=magenta squares, Empty=dimmed light squares. Themeable characters.

### StatusMessage

Inline icon + message (no border).

| Prop       | Type                                          | Required | Default |
| ---------- | --------------------------------------------- | -------- | ------- |
| `children` | `ReactNode`                                   | yes      | —       |
| `variant`  | `'info' \| 'success' \| 'error' \| 'warning'` | yes      | —       |

Icons: success=tick(green), error=cross(red), warning=warning(yellow), info=info(blue).

### UnorderedList / UnorderedList.Item

Nested unordered list with configurable markers.

```tsx
<UnorderedList>
  <UnorderedList.Item>
    <Text>Item</Text>
  </UnorderedList.Item>
  <UnorderedList.Item>
    <Text>Parent</Text>
    <UnorderedList>
      <UnorderedList.Item>
        <Text>Nested</Text>
      </UnorderedList.Item>
    </UnorderedList>
  </UnorderedList.Item>
</UnorderedList>
```

Theme config: `marker: string | string[]` (per-depth markers). Default: `figures.line`.

### OrderedList / OrderedList.Item

Nested numbered list. Numbers auto-calculated and right-aligned. Nested items prepend parent marker (e.g., `1.1.`).

---

## Theme System

### Setup

```tsx
import { ThemeProvider, defaultTheme, extendTheme } from "@inkjs/ui";

const theme = extendTheme(defaultTheme, {
  components: {
    ComponentName: {
      styles: {
        styleName: (args) => ({
          /* BoxProps or TextProps */
        }),
      },
      config: () => ({
        /* config values */
      }),
    },
  },
});

<ThemeProvider theme={theme}>...</ThemeProvider>;
```

### Theme API

| Export                         | Purpose                             |
| ------------------------------ | ----------------------------------- |
| `defaultTheme`                 | Base themes for all components      |
| `ThemeProvider`                | React context provider              |
| `ThemeContext`                 | Raw React context                   |
| `extendTheme(base, extension)` | Deep-merge themes                   |
| `useComponentTheme<T>(name)`   | Hook returning `{ styles, config }` |

### Style Functions by Component

**Alert:** `container({variant})`, `iconContainer()`, `icon({variant})`, `content()`, `title()`, `message()`
**Badge:** `container({color})`, `label()`
**ConfirmInput:** `input({isFocused})`
**EmailInput:** `value()`
**MultiSelect:** `container()`, `option({isFocused})`, `focusIndicator()`, `selectedIndicator()`, `label({isFocused, isSelected})`, `highlightedText()`
**OrderedList:** `list()`, `listItem()`, `marker()`, `content()`
**PasswordInput:** `value()`
**ProgressBar:** `container()`, `completed()`, `remaining()`
**Select:** `container()`, `option({isFocused})`, `focusIndicator()`, `selectedIndicator()`, `label({isFocused, isSelected})`, `highlightedText()`
**Spinner:** `container()`, `frame()`, `label()`
**StatusMessage:** `container()`, `iconContainer()`, `icon({variant})`, `message()`
**TextInput:** `value()`
**UnorderedList:** `list()`, `listItem()`, `marker()`, `content()`

---

## All Exports

**Components:** Alert, Badge, ConfirmInput, EmailInput, MultiSelect, OrderedList, PasswordInput, ProgressBar, Select, Spinner, StatusMessage, TextInput, UnorderedList

**Theme:** defaultTheme, ThemeProvider, ThemeContext, extendTheme, useComponentTheme

**Hooks:** useSpinner, useTextInput, useTextInputState, useEmailInput, useEmailInputState, usePasswordInput, usePasswordInputState, useSelect, useSelectState, useMultiSelect, useMultiSelectState

**Types:** Option, AlertProps, BadgeProps, ConfirmInputProps, EmailInputProps, MultiSelectProps, OrderedListProps, PasswordInputProps, ProgressBarProps, SelectProps, SpinnerProps, StatusMessageProps, TextInputProps
