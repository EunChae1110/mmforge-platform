declare const __MMFORGE_WORKSPACE__: string
declare const __MMFORGE_WORKSPACE_URL__: string

const roleTypes = new Map([
  ['button', 'Button'], ['switch', 'Switch'], ['slider', 'Slider'], ['checkbox', 'Checkbox'],
  ['radio', 'Radio button'], ['tab', 'Tab'], ['link', 'Link'], ['combobox', 'Dropdown'],
  ['listbox', 'List box'], ['option', 'Option'], ['textbox', 'Text field'], ['searchbox', 'Search field'],
  ['spinbutton', 'Number field'], ['heading', 'Heading'], ['img', 'Image'],
  ['menuitem', 'Menu item'], ['menuitemcheckbox', 'Checkbox menu item'], ['menuitemradio', 'Radio menu item'],
])

const inputTypes = new Map([
  ['button', 'Button'], ['submit', 'Button'], ['reset', 'Button'], ['image', 'Button'],
  ['range', 'Slider'], ['checkbox', 'Checkbox'], ['radio', 'Radio button'], ['number', 'Number field'],
  ['search', 'Search field'], ['color', 'Color picker'], ['file', 'File picker'], ['date', 'Date field'],
])

type AnnotationDocument = Document & {
  oai?: {
    annotation?: {
      request?: (element: HTMLElement, options: {
        initialComment: string
        metadata: Record<string, string>
      }) => { accepted: boolean }
    }
  }
}

const controls = 'button, a[href], input, select, textarea, label, summary, [contenteditable="true"], ' +
  [...roleTypes.keys()].filter(role => role !== 'heading' && role !== 'img').map(role => `[role~="${role}"]`).join(', ')

export function previewElement(target: EventTarget | null, preview: HTMLElement | null): Element | null {
  if (!(target instanceof Element) || !preview || target === preview || !preview.contains(target)) return null

  const control = target.closest(controls)
  if (control && control !== preview && preview.contains(control)) {
    if (target !== control && target instanceof HTMLElement && !target.closest('[aria-hidden="true"]') && textOf(target).trim()) {
      return target
    }
    return control
  }
  return target.closest('svg') ?? target
}

function elementType(element: Element): string {
  const role = element.getAttribute('role')?.trim().split(/\s+/).find((role) => roleTypes.has(role))
  if (role) return roleTypes.get(role)!
  if (element instanceof HTMLInputElement) return inputTypes.get(element.type) ?? 'Text field'
  if (element instanceof HTMLSelectElement) return element.multiple || element.size > 1 ? 'List box' : 'Dropdown'
  if (element instanceof HTMLTextAreaElement || (element instanceof HTMLElement && element.isContentEditable)) return 'Text area'
  if (element instanceof HTMLButtonElement || element.localName === 'summary') return 'Button'
  if (element instanceof HTMLAnchorElement && element.hasAttribute('href')) return 'Link'
  if (/^h[1-6]$/.test(element.localName)) return 'Heading'
  if (element instanceof HTMLImageElement) return 'Image'
  if (element instanceof SVGSVGElement) return 'Icon'
  if (element instanceof HTMLLabelElement) return 'Label'
  if (element.matches('div, section, article, header, footer, nav, main, fieldset, ul, ol')) return 'Container'
  return textOf(element).trim() ? 'Text' : 'Element'
}

function textOf(element: Element) {
  return (element instanceof HTMLElement ? element.innerText : element.textContent) ?? ''
}

function selectorFor(element: Element, preview: HTMLElement) {
  const parts = []
  for (let node: Element | null = element; node && node !== preview; node = node.parentElement) {
    const tag = node.localName
    const classes = [...node.classList].slice(0, 2).map((name) => '.' + CSS.escape(name)).join('')
    const part = tag + classes
    const siblings = [...(node.parentElement?.children ?? [])]
    const matches = siblings.filter((sibling) => sibling.matches(part))
    const typeIndex = siblings.filter((sibling) => sibling.localName === tag).indexOf(node) + 1
    parts.unshift(matches.length > 1 ? part + ':nth-of-type(' + typeIndex + ')' : part)
  }
  return '.canvas-preview > ' + parts.join(' > ')
}

function ariaName(element: Element) {
  const labelledBy = element.getAttribute('aria-labelledby')?.trim().split(/\s+/)
    .map((id) => element.ownerDocument.getElementById(id)?.innerText ?? '').join(' ').trim()
  return labelledBy || element.getAttribute('aria-label')?.trim()
}

function locationFor(element: Element, preview: HTMLElement, label: string) {
  const parts: string[] = []
  for (let group = element.parentElement; group && group !== preview && parts.length < 2; group = group.parentElement) {
    if (!group.matches('fieldset, section, article, nav, aside, header, footer, [role="group"], [role="tabpanel"], [role="region"]')) continue

    const heading = group.querySelector<HTMLElement>(':scope > :is(legend, h1, h2, h3, h4, h5, h6, [role="heading"])')
    const name = (ariaName(group) || heading?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    if (name && name !== label && !parts.includes(name)) parts.unshift(name)
  }
  return parts.join(' › ')
}

export function describeElement(element: Element) {
  const control = element instanceof HTMLLabelElement && element.control instanceof HTMLElement ? element.control : element
  const type = elementType(control)
  const controlLabels = 'labels' in control
    ? Array.from((control as HTMLInputElement).labels ?? [], (label) => {
      const text = label.cloneNode(true) as HTMLLabelElement
      text.querySelectorAll('button, input, select, textarea, [aria-hidden="true"]').forEach((child) => child.remove())
      return text.textContent
    }).join(' ')
    : ''
  const label = (ariaName(control) || controlLabels.trim() || control.getAttribute('alt') || textOf(control) ||
    control.getAttribute('title') || control.getAttribute('placeholder') || '')
    .replace(/\s+/g, ' ').trim().slice(0, 100)
  return { label, type, fallbackLabel: control.localName }
}

export function elementContext(element: Element, preview: HTMLElement, designPath: string) {
  const { label, type, fallbackLabel } = describeElement(element)
  const location = locationFor(element, preview, label)
  const selector = selectorFor(element, preview)
  const target = label ? JSON.stringify(label) + ' (' + type.toLowerCase() + ')' : type
  const prompt = [
    'Design: ' + designPath,
    'Element: ' + (location ? location + ' › ' : '') + target,
    ...(!label || type === 'Text' ? ['Selector: ' + selector] : []),
    'Change: ',
  ].join('\n')
  return { designPath, label: label || fallbackLabel, type, location, selector, prompt }
}

export function supportsElementAnnotations() {
  return typeof (document as AnnotationDocument).oai?.annotation?.request === 'function'
}

export function requestElementAnnotation(element: Element, context: ReturnType<typeof elementContext>) {
  const annotation = (document as AnnotationDocument).oai?.annotation
  const anchor = element instanceof HTMLElement ? element : element.closest('svg')?.parentElement
  if (!(anchor instanceof HTMLElement)) return false
  try {
    return annotation?.request?.(anchor, {
      initialComment: 'Update ' + context.label + ' in this mod menu: ',
      metadata: {
        Design: context.designPath.slice(0, 256),
        Element: context.label,
        'Element type': context.type,
        ...(context.location ? { Location: context.location } : {}),
        Selector: context.selector.slice(0, 256),
      },
    })?.accepted === true
  } catch {
    return false
  }
}

export function draftUrl(agent: 'codex' | 'cursor' | 'claude' | 'vscode', prompt: string) {
  const text = encodeURIComponent(prompt)
  const workspace = encodeURIComponent(__MMFORGE_WORKSPACE__)
  switch (agent) {
    case 'codex': return 'codex://new?path=' + workspace + '&prompt=' + text
    case 'cursor': return 'cursor://anysphere.cursor-deeplink/prompt?text=' + text
    case 'claude': return 'claude://code/new?folder=' + workspace + '&q=' + text
    case 'vscode': return 'vscode://agents/new?workspace=' + encodeURIComponent(__MMFORGE_WORKSPACE_URL__) + '&prompt=' + text
  }
}
