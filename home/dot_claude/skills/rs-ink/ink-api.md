# Ink v6.8.0 — Full API Reference

**Peer deps:** `react >= 19.0.0` | **Layout engine:** `yoga-layout ~3.2.1` | **Node:** >= 22

---

## Components

### `<Box>`

Flexbox container. Every `<Box>` is `display: flex` by default.

**Dimension:** `width`, `height`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight` (number = chars/lines, string = percentage), `aspectRatio: number`

**Padding:** `padding`, `paddingX`, `paddingY`, `paddingTop`, `paddingBottom`, `paddingLeft`, `paddingRight` — all `number`, default `0`

**Margin:** `margin`, `marginX`, `marginY`, `marginTop`, `marginBottom`, `marginLeft`, `marginRight` — all `number`, default `0`

**Gap:** `gap`, `columnGap`, `rowGap` — all `number`, default `0`

**Flex:**
| Prop | Type | Default | Values |
|------|------|---------|--------|
| `flexGrow` | `number` | `0` | |
| `flexShrink` | `number` | `1` | |
| `flexBasis` | `number \| string` | — | |
| `flexDirection` | `string` | `row` | `row`, `row-reverse`, `column`, `column-reverse` |
| `flexWrap` | `string` | `nowrap` | `nowrap`, `wrap`, `wrap-reverse` |
| `alignItems` | `string` | — | `flex-start`, `center`, `flex-end`, `stretch`, `baseline` |
| `alignSelf` | `string` | `auto` | `auto`, `flex-start`, `center`, `flex-end`, `stretch`, `baseline` |
| `alignContent` | `string` | `flex-start` | `flex-start`, `flex-end`, `center`, `stretch`, `space-between`, `space-around`, `space-evenly` |
| `justifyContent` | `string` | — | `flex-start`, `center`, `flex-end`, `space-between`, `space-around`, `space-evenly` |

**Position:** `position` (`relative` | `absolute` | `static`, default `relative`), `top`, `right`, `bottom`, `left` (number | string)

**Display/Overflow:** `display` (`flex` | `none`), `overflow` (`visible` | `hidden`), `overflowX`, `overflowY`

**Border:**
| Prop | Type | Notes |
|------|------|-------|
| `borderStyle` | `string \| BoxStyle` | `single`, `double`, `round`, `bold`, `singleDouble`, `doubleSingle`, `classic`, or custom object |
| `borderColor` | `string` | Hex, rgb, or named |
| `borderTop/Right/Bottom/LeftColor` | `string` | Per-side |
| `borderDimColor` | `boolean` | All sides |
| `borderTop/Right/Bottom/LeftDimColor` | `boolean` | Per-side |
| `borderTop/Right/Bottom/Left` | `boolean` | Toggle sides (default `true`) |

**Background:** `backgroundColor: string`

---

### `<Text>`

Only way to render text. Must contain only text nodes and nested `<Text>`.

| Prop              | Type      | Default                                                                          |
| ----------------- | --------- | -------------------------------------------------------------------------------- |
| `color`           | `string`  | —                                                                                |
| `backgroundColor` | `string`  | —                                                                                |
| `dimColor`        | `boolean` | `false`                                                                          |
| `bold`            | `boolean` | `false`                                                                          |
| `italic`          | `boolean` | `false`                                                                          |
| `underline`       | `boolean` | `false`                                                                          |
| `strikethrough`   | `boolean` | `false`                                                                          |
| `inverse`         | `boolean` | `false`                                                                          |
| `wrap`            | `string`  | `wrap` — `wrap`, `truncate`, `truncate-start`, `truncate-middle`, `truncate-end` |

---

### `<Newline count={1} />`

Blank lines. Must be inside `<Text>`.

### `<Spacer />`

No props. Equivalent to `<Box flexGrow={1} />`.

### `<Static items={T[]} style?={BoxProps}>`

Append-only output above dynamic TUI. Children: `(item: T, index: number) => ReactNode`. Previously rendered items are never re-rendered.

### `<Transform transform={(line, index) => string}>`

Per-line text transformation. Only for `<Text>` children. Must not change visible dimensions. `line` contains ANSI codes.

---

### ARIA Props (all components)

`aria-label: string`, `aria-hidden: boolean`, `aria-role: string` (button, checkbox, radio, radiogroup, list, listitem, menu, menuitem, progressbar, tab, tablist, timer, toolbar, table), `aria-state: { checked?, disabled?, expanded?, selected? }`

---

## Hooks

### `useInput(handler, options?)`

```ts
useInput((input: string, key: Key) => void, { isActive?: boolean })
```

**Key properties:** `leftArrow`, `rightArrow`, `upArrow`, `downArrow`, `return`, `escape`, `ctrl`, `shift`, `tab`, `backspace`, `delete`, `pageDown`, `pageUp`, `home`, `end`, `meta`, `super`, `hyper`, `capsLock`, `numLock`, `eventType`

`input` = printable character pressed (empty for special keys). Kitty-only: `super`, `hyper`, `capsLock`, `numLock`, `eventType`.

### `usePaste(handler, options?)`

```ts
usePaste((text: string) => void, { isActive?: boolean })
```

Bracketed paste mode. Independent from `useInput`.

### `useApp()`

Returns `{ exit: (errorOrResult?) => void, waitUntilRenderFlush: () => Promise<void> }`. Passing an `Error` to `exit` makes `waitUntilExit()` reject.

### `useStdin()`

Returns `{ stdin, isRawModeSupported: boolean, setRawMode: (enabled: boolean) => void }`. **`setRawMode` throws if `!isRawModeSupported`.**

### `useStdout()` / `useStderr()`

Returns `{ stdout/stderr, write: (data: string) => void }`. `write()` bypasses Ink rendering.

### `useWindowSize()`

Returns `{ columns, rows }`. Auto-rerenders on terminal resize.

### `useBoxMetrics(ref)`

```ts
const ref = useRef(null);
const { width, height, left, top, hasMeasured } = useBoxMetrics(ref);
// <Box ref={ref}>...</Box>
```

Returns zeros until first layout pass. Check `hasMeasured` before using values.

### `useFocus(options?)`

```ts
const { isFocused } = useFocus({ autoFocus?: boolean, isActive?: boolean, id?: string });
```

Tab cycles forward, Shift+Tab backward. `isActive: false` skips component. `id` enables programmatic focus.

### `useFocusManager()`

Returns `{ enableFocus, disableFocus, focusNext, focusPrevious, focus: (id) => void, activeId }`.

### `useCursor()`

Returns `{ setCursorPosition: (pos: {x,y} | undefined) => void }`. Use `string-width` for CJK.

### `useIsScreenReaderEnabled()`

Returns `boolean`.

---

## Utilities

### `render(tree, options?)`

Returns `Instance`: `{ rerender, unmount, waitUntilExit, waitUntilRenderFlush, cleanup, clear }`.

**Key options:**
| Option | Type | Default |
|--------|------|---------|
| `stdout/stdin/stderr` | `stream` | `process.*` |
| `exitOnCtrlC` | `boolean` | `true` |
| `patchConsole` | `boolean` | `true` |
| `maxFps` | `number` | `30` |
| `alternateScreen` | `boolean` | `false` |
| `interactive` | `boolean` | auto |
| `concurrent` | `boolean` | `false` |
| `kittyKeyboard` | `{ mode, flags? }` | — |

### `renderToString(tree, { columns? })`

Synchronous. Default columns: 80. `useEffect` does NOT run. `useLayoutEffect` does.

### `measureElement(ref)`

Returns `{ width, height }`. **Must not be called during render** — use from `useEffect` or event handlers. Prefer `useBoxMetrics()`.

---

## Type Exports

`RenderOptions`, `Instance`, `RenderToStringOptions`, `BoxProps`, `TextProps`, `AppProps`, `StdinProps`, `StdoutProps`, `StderrProps`, `StaticProps`, `TransformProps`, `NewlineProps`, `Key`, `WindowSize`, `BoxMetrics`, `UseBoxMetricsResult`, `CursorPosition`, `DOMElement`, `KittyKeyboardOptions`, `KittyFlagName`

---

## Key Dependencies

| Dep                       | Purpose                   |
| ------------------------- | ------------------------- |
| `yoga-layout` ~3.2.1      | Flexbox engine            |
| `react-reconciler` 0.33.0 | Custom React renderer     |
| `chalk` 5.6.2             | Color support             |
| `cli-truncate` 5.2.0      | ANSI-aware truncation     |
| `wrap-ansi` 10.0.0        | ANSI-aware word wrapping  |
| `string-width` 8.2.0      | Visual width (CJK, emoji) |
| `slice-ansi` 8.0.0        | ANSI-aware slicing        |
