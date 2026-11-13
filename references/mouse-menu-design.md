# Mouse menu design

Use these patterns to translate a brief or reference image into a usable menu. Treat the five examples as layout studies. The user can set a different palette, density, or navigation style.

## Pick the layout by task

| Pattern | Use when | Reference details |
| --- | --- | --- |
| Sidebar with nested category and two columns | The active category has several independent groups. | Cheatname uses a parent highlight, a separate child marker, a breadcrumb, and compact setting rows. Keep each column ordered by purpose. |
| Top navigation with a left subcategory rail | People repeat the same adjustments across multiple item types. | Fortnite External keeps the settings in stable positions while the left rail changes the active item type. Keep unselected labels readable. |
| Category rail with secondary tabs | There are several sections within each major category. | SpectraX uses large icon-and-label targets, roomy rows, and a separate gear for per-row settings. Allow longer labels, including Chinese text, to fit. |
| Selection list with a detail pane | People pick one named item and change its settings. | The Players reference places search and the selected row on the left, then names that item in the right pane. Use the list as the profile picker when it stays visible. |
| Single column with grouped sections | Settings have a clear reading order or are easier to scan in wide rows. | Intervision puts labels on the left and controls on the right. Main, Tuning, and Advanced keep the current task visible. |
| Compact top tabs with side-by-side groups | A few short category names fit in one row, and the active page has independent groups. | Use the width for settings. Keep each group sized to its contents and align the groups on a common top edge. |

## Match the visual language

- At the intended preview size, distinguish navigation, group headings, setting rows, and secondary values. Use consistent row heights within a group, aligned labels, and a stable column for numbers. Choose compact or roomy spacing from the reference and the number of controls.
- Use surface contrast and separators to show hierarchy. Reserve the accent for meaningful states such as the selected tab, checkmark, or filled portion of a slider. A reference can use blue, purple, red, monochrome, or another palette. Avoid default dashboard styling, decorative badges, repeated headings, excessive pills, and gradients or glow added without a reference or purpose.
- Match the design across interaction states. A custom popover should share the menu's typography, density, corner treatment, and palette. Distinguish hover, selected, on, off, disabled, and keyboard focus. Keep disabled controls visibly different from unselected controls that users can still click.
- Let the shape and placement of controls explain their role. Use a switch for a feature's main enable state and consider checkboxes for related options. In a narrow group, place a slider below its label and value to give it a full-width drag track. Align dropdowns with each other and size them for their values.
- Give each surface a job. Use the navigation surface to show location, a shared edge or subtle tone change to group related controls, and the accent to show a current choice or value. Keep preset status next to the preset control and show it when it changes what the user can do.
- In a profile editor, show the name in the selected row and in the detail heading. Add row metadata only when it helps distinguish profiles. If the settings already show their current values, omit the summary that repeats them. Use simple dividers for groups that share a control column.

## Make controls work with the mouse

- **Navigation.** Highlight the active category and subpage. Keep labels stable when switching pages. If content scrolls, keep the current location clear. Search should filter or navigate to the intended result and give a clear empty state.
- **Checkboxes and switches.** Make the label and control a single generous click target where the row has one action. A trailing gear, keybind, or other secondary action should have its own hit area and open without changing the primary value.
- **Sliders.** Update the visible value as the thumb moves. Keep its alignment stable and include meaningful units. For a range with two thumbs, make both draggable and enforce the lower and upper bounds.
- **Custom selects.** Show the current value when closed. Open an anchored panel with clearly distinct hover and selected states. On selection, update the value and close the panel. Support outside-click and Escape dismissal and accessible keyboard navigation. Check that the panel stays in bounds, survives canvas scaling, and clears nearby scroll or clipping containers. Keep the popover associated with its trigger even if it uses a portal.
- **Custom action menus.** Label icon-only triggers by what they open. Use a menu for actions and a select or listbox for values. An action such as reset or apply preset should update the local preview and give feedback where the action happened.

## Review the rendered menu

- At its intended size, locate the active category and the main setting at a glance. Check whether a mostly empty rail, extra panel, or oversized heading consumes room needed for settings. If the layout still looks like a generic form when you ignore its accent color, revisit navigation, grouping, and control placement.
- Try a short task in the canvas. Select the relevant page, find a setting, change it, and confirm the new state. Open a dropdown and check that its alignment, selection, and hover states fit the rest of the menu.
