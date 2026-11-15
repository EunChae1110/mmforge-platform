# HUD widget design

Start with the information someone needs while looking at the game. Give each widget one purpose and choose the structure to fit its data. Use local sample values to show the intended density and changes in state.

| Widget | Structure |
| --- | --- |
| Watermark or telemetry | Use a short horizontal strip. Give priority to the product mark or the values, depending on the task. Group related measurements with a shared baseline or small dividers. Keep units close and quiet. |
| Keybinds or status list | Use a compact heading when it identifies the list. Align action names on the left and keycaps or states in a consistent trailing column. Use keycaps for physical keys and plain text for status. Keep empty and populated states compact. |
| Cooldowns or timers | Align the item names and remaining times. Add a short bar or ring when it communicates progress. Keep expired or completed states readable through text or shape as well as color. |

## Give related widgets a shared style

- Use the same base surface and edge treatment across related widgets. A small angled corner or a fine top highlight can give the set a recognizable shape when it fits the menu. Keep the surface behind the data quiet.
- Fit each widget to its contents. A watermark can put `144 FPS` and `24 ms` on one baseline, with brighter numbers and smaller units. A status list can use a shallow heading separated by a thin divider, then align all values along the same right edge.
- Reuse the menu's accent in small areas that carry meaning, such as a product mark, a keybind icon, or the filled part of a cooldown bar. Keep that treatment consistent across strips and lists.

## Connect the widget to its menu

- Carry over two or three visible choices from the owning menu, such as corner geometry, border tone, icon weight, accent placement, or the shape of a keybind control. Cheatname's demo widgets have useful density and alignment. Its mint icons contrast with the menu's blue accent. A new Cheatname widget can use the menu's cool border and keybind shape, then reserve blue for a status or a small identity detail.
- Establish the surface first. A slightly translucent dark fill, a thin border, and a small shadow can keep a widget legible over play. For additional depth, try a lighter top edge or an inset divider between the heading and rows. Pick the finish that matches the menu and check it over the actual game background.
- Keep type and spacing precise. Use tabular numerals and reserve space for the widest expected value. Let long labels wrap or truncate without pushing the trailing column out of alignment. Limit icons to ones that explain the data or status.
- Check every visible element for a job. Remove repeated titles, decorative numbers, filler badges, and extra card layers. Give different widget types their own proportions. Keep the presentation title and showcase panels from a portfolio reference outside the playable overlay.

## Review in Game Preview

- View the widget at its actual size, alongside the menu and with the menu hidden. Place it against light, dark, and busy parts of a game scene. Check quick readability, edge clearance, and whether it covers existing HUD elements.
- Exercise the states relevant to the widget. For telemetry, use values such as `9 ms` and `180 ms` to check that adjacent content stays in place. For lists, check long labels, a long key combination, and a short or empty list. For timers, check an advancing value and its completed state.
- Check that the widget can be dragged and that its position and content remain usable at a reduced viewport. Test any widget controls after the edit aura clears.
