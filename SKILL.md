---
name: mmforge-platform
description: Create or refine mouse-operated mod menu UI prototypes in the local MMForge platform canvas. Use for new menu designs, screenshot-based recreations, and targeted edits from MMForge element context.
---

# MMForge platform

Build a mouse-first, interactive menu that the user can try in the local MMForge canvas. The runnable canvas source is bundled in [assets/canvas](assets/canvas/). Keep gameplay-facing controls as local demo state. Use the user's brief, screenshots, or copied element context as the design input.

## Start the canvas

- Use the existing MMForge project when available. Its project root has a `package.json` named `mmforge-platform` with a `design-activity` script. For a standalone skill installation, copy the contents of `assets/canvas/` into a new writable folder in the user's workspace and work from that folder. Keep generated designs with that copy.
- Create `designs/` if needed. If dependencies are missing, run `npm ci` from the canvas project root.
- The skill is authorized to run `npm run dev` on localhost. Reuse the correct MMForge server if it is already running. Otherwise, start it yourself in a terminal session that stays running for preview. Verify the URL Vite prints before working on the design and use its actual port in the handoff. Keep it bound to localhost.

## Choose the design

- For a new menu, identify the main task and choose a navigation structure and settings layout that suit it. For a recreation, match the reference's proportions, density, control shapes, and selected states. Carry two or three specific visual decisions through the whole menu, including open and hover states.
- Without a screenshot, choose a layout from the design reference based on the active page's actual controls. Work out the window proportions, navigation footprint, and control grouping before choosing the palette.
- For an edit, locate the requested file and control. MMForge's copied context gives the design path, group hierarchy, label, and control type. Use the CSS selector when provided. Follow the imports if the actual control lives in a supporting component. Preserve the surrounding design and behavior outside the request.
- Read [Mouse menu design](references/mouse-menu-design.md) before creating or recreating a layout or changing control patterns. For a focused edit, use the relevant section.

## Implement in the local canvas

1. Put each design entry in a top-level `designs/<name>.tsx` file. Use a default-exported React component and export a numeric `previewWidth` when the intended width differs from the canvas default. Keep supporting components and scoped styles under `designs/shared/` or another subdirectory. The canvas treats every top-level TSX file as a design.
2. Signal activity before changing the design. Run the commands from the project root and use the same top-level design path when changing its supporting files.

   ```sh
   npm run design-activity -- creating designs/example.tsx
   npm run design-activity -- writing designs/example.tsx
   npm run design-activity -- editing designs/example.tsx
   npm run design-activity -- done designs/example.tsx
   ```

   Use `creating` followed by `writing` for a new file. Use `editing` for an existing design. Send `done` after the final save, before browser interaction checks. Also clear the activity with `done` if work stops early. The signal expires after 60 seconds, so repeat the active phase if a long edit should keep the aura visible.

3. Render dropdowns with custom UI. Use a custom select or listbox for setting values and a custom action menu for commands such as “⋯”. Use accessible primitives where available, such as the workspace's Radix Dropdown Menu for commands. Do not use a browser-native HTML `<select>` for visible menu controls.
4. Use the real mouse pointer for interaction in the canvas. Include a separate in-menu preview panel or cursor demonstration only if the user explicitly requests it.

## Verify and hand off

- Run `npm run build`. Open the direct preview and check that the menu renders and appears in the sidebar. The root URL opens a blank canvas. Set the `design` query parameter to the URL-encoded filename, including `.tsx`, as in `http://localhost:5173/?design=example.tsx`. At the intended width and a reduced viewport, inspect the default state, test the main controls with the mouse, and check that dropdowns and scrollable content are usable.
- Review the rendered menu using the visual check in the design reference. Fix any layout or control hierarchy issues you see before handoff.
- For a new entry, check discovery in an open canvas when practical. For an edit, check that the current design stays selected and reflects the saved change. The aura temporarily locks preview input, so check controls after the activity clears.
- Give the user the design file and its verified localhost preview link. If you cannot start or reach the canvas, report the blocker and which checks you completed.
