---
name: mmforge-platform
description: Create or refine mouse-operated mod menus and their HUD widgets in the local MMForge platform canvas. Use for new UI prototypes, screenshot-based recreations, and targeted edits from MMForge element context.
---

# MMForge platform

Build interactive menus and HUD overlays that the user can try in the local MMForge canvas. The runnable canvas source is bundled in [assets/canvas](assets/canvas/). Keep gameplay-facing controls and widget data local to the prototype. Use the user's brief, screenshots, or copied element context as the design input.

## Start the canvas

- Use the existing MMForge project when available. Its project root has a `package.json` named `mmforge-platform` with a `design-activity` script. For a standalone skill installation, copy the contents of `assets/canvas/` into a new writable folder in the user's workspace and work from that folder. Keep generated designs with that copy.
- Create `designs/` if needed. If dependencies are missing, run `npm ci` from the canvas project root.
- The skill is authorized to run `npm run dev` on localhost. Reuse the correct MMForge server if it is already running. Otherwise, start it yourself in a terminal session that stays running for preview. Verify the URL Vite prints before working on the design and use its actual port in the handoff. Keep it bound to localhost.

## Choose the design

- For a new menu, identify the main task and choose a navigation structure and settings layout that suit it. For a recreation, match the reference's proportions, density, control shapes, and selected states. Carry two or three specific visual decisions through the whole menu, including open and hover states.
- For a new menu without a screenshot, choose a layout from the menu reference based on the active page's actual controls. Work out the window proportions, navigation footprint, and control grouping before choosing the palette.
- For an edit, locate the requested file and control. MMForge's copied context gives the design path, group hierarchy, label, and control type. Use the CSS selector when provided. Follow the imports if the actual control lives in a supporting component. Preserve the surrounding design and behavior outside the request.
- Read [Mouse menu design](references/mouse-menu-design.md) before creating or recreating a layout or changing control patterns. For a focused edit, use the relevant section.
- For a widget, inspect its owning menu and read the [HUD widget design reference](references/hud-widget-design.md). Decide what the player needs to read at a glance, then use the menu's visual language at the widget's scale.

## Implement in the local canvas

1. Put each design entry in a top-level `designs/<name>.tsx` file. Use a default-exported React component and export a numeric `previewWidth` when the intended width differs from the canvas default. Keep supporting components and scoped styles under `designs/shared/` or another subdirectory. The canvas treats every top-level TSX file as a design.
2. Put widgets in `designs/widgets/<menu-stem>/<widget>.tsx`. For `designs/cheatname.tsx`, use `designs/widgets/cheatname/`. Match the filename stem exactly. Give each widget entry a default-exported React component and optionally export `widgetTitle` for the Widgets picker. Size the widget root to its content and scope its styles to that root. Game Preview supplies positioning and dragging. Keep TSX helpers in a subfolder so the picker discovers only widget entries.
3. Signal activity before changing the design. Run the commands from the project root. Use the menu entry path for menu work and the nested widget entry path for widget work. Keep the same path through the activity phases, including when changing supporting styles.

   ```sh
   npm run design-activity -- creating designs/example.tsx
   npm run design-activity -- writing designs/example.tsx
   npm run design-activity -- editing designs/example.tsx
   npm run design-activity -- done designs/example.tsx
   ```

   For example, signal an existing widget edit with `npm run design-activity -- editing designs/widgets/cheatname/performance.tsx` and send `done` with the same widget path.

   Use `creating` followed by `writing` for a new file. Use `editing` for an existing design. Send `done` after the final save, before browser interaction checks. Also clear the activity with `done` if work stops early. The signal expires after 60 seconds, so repeat the active phase if a long edit should keep the aura visible.

4. Render dropdowns with custom UI. Use a custom select or listbox for setting values and a custom action menu for commands such as “⋯”. Use accessible primitives where available, such as the workspace's Radix Dropdown Menu for commands. Do not use a browser-native HTML `<select>` for visible menu controls.
5. Use the real mouse pointer for interaction in the canvas. Include a separate in-menu preview panel or cursor demonstration only if the user explicitly requests it.

## Verify and hand off

- Run `npm run build`. Open the preview using the URL-encoded menu filename, including `.tsx`, as in `http://localhost:5173/?design=example.tsx`. The root URL opens a blank canvas. For menu work, check the sidebar entry, default state, main mouse controls, dropdowns, and scrolling at the intended width and a reduced viewport.
- For widget work, open the owning menu, switch to **Game Preview**, and enable the widget in the **Widgets** picker. Verify that it renders and drags alongside the menu, then uncheck **Show menu** and review it over the game scene. Use the visual checks in the widget reference.
- Review the rendered menu using the visual check in the design reference. Fix any layout or control hierarchy issues you see before handoff.
- For a new entry, check discovery in an open canvas when practical. For an edit, check that the current design stays selected and reflects the saved change. The aura temporarily locks preview input, so check controls after the activity clears.
- Give the user the edited files and verified localhost preview link. For widgets, link to the owning menu and include the widget's picker name. If you cannot start or reach the canvas, report the blocker and which checks you completed.
