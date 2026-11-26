/**
 * Tiny Markdown-to-slides parser (no HTML is ever injected).
 *
 *   ---            slide separator
 *   ### Kicker     small label above the title
 *   # Title        slide title (## also works)
 *   > Lead         lead paragraph
 *   - item         bullet
 *   ```            fenced code block
 *   Note: ...      speaker notes (everything after it on the slide)
 *   anything else  paragraph
 * Inline: **bold**, *italic*, `code`.
 */

export type SlideBlock =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'code'; text: string };

export interface Slide {
  kicker: string;
  title: string;
  lead: string;
  blocks: SlideBlock[];
  notes: string;
}

export const MAX_SLIDES = 60;
export const MAX_MARKDOWN_CHARS = 200_000;

export function parseSlides(markdown: string): Slide[] {
  const source = markdown.slice(0, MAX_MARKDOWN_CHARS).replace(/\r\n?/g, '\n');
  const chunks = source.split(/\n-{3,}\s*\n/);
  const slides: Slide[] = [];
  for (const chunk of chunks) {
    const slide = parseSlide(chunk);
    if (slide) slides.push(slide);
    if (slides.length >= MAX_SLIDES) break;
  }
  return slides;
}

function parseSlide(chunk: string): Slide | null {
  const slide: Slide = { kicker: '', title: '', lead: '', blocks: [], notes: '' };
  const lines = chunk.split('\n');
  let list: string[] | null = null;
  let code: string[] | null = null;
  let inNotes = false;
  const notes: string[] = [];

  const flushList = () => {
    if (list && list.length) slide.blocks.push({ kind: 'list', items: list });
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (inNotes) {
      notes.push(line.trim());
      continue;
    }
    if (code) {
      if (line.trim().startsWith('```')) {
        slide.blocks.push({ kind: 'code', text: code.join('\n') });
        code = null;
      } else {
        code.push(raw);
      }
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      flushList();
      code = [];
      continue;
    }
    const note = /^note:\s*(.*)$/i.exec(trimmed);
    if (note) {
      flushList();
      inNotes = true;
      notes.push(note[1] ?? '');
      continue;
    }
    if (!trimmed) {
      flushList();
      continue;
    }
    let match: RegExpExecArray | null;
    if ((match = /^###\s+(.*)$/.exec(trimmed))) {
      flushList();
      slide.kicker = match[1]!;
    } else if ((match = /^#{1,2}\s+(.*)$/.exec(trimmed))) {
      flushList();
      if (!slide.title) slide.title = match[1]!;
      else slide.blocks.push({ kind: 'p', text: match[1]! });
    } else if ((match = /^>\s?(.*)$/.exec(trimmed))) {
      flushList();
      slide.lead = slide.lead ? `${slide.lead} ${match[1]}` : match[1]!;
    } else if ((match = /^[-*+]\s+(.*)$/.exec(trimmed))) {
      (list ??= []).push(match[1]!);
    } else {
      flushList();
      slide.blocks.push({ kind: 'p', text: trimmed });
    }
  }
  if (code) slide.blocks.push({ kind: 'code', text: (code as string[]).join('\n') });
  flushList();
  slide.notes = notes.join('\n').trim();
  if (!slide.title && !slide.lead && slide.blocks.length === 0) return null;
  if (!slide.title) slide.title = 'Untitled';
  return slide;
}

export type InlineToken = { kind: 'text' | 'strong' | 'em' | 'code'; text: string };

/** Splits **bold**, *italic* and `code` spans into tokens (rendered as React elements). */
export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ kind: 'text', text: text.slice(last, index) });
    const value = match[0];
    if (value.startsWith('**')) tokens.push({ kind: 'strong', text: value.slice(2, -2) });
    else if (value.startsWith('`')) tokens.push({ kind: 'code', text: value.slice(1, -1) });
    else tokens.push({ kind: 'em', text: value.slice(1, -1) });
    last = index + value.length;
  }
  if (last < text.length) tokens.push({ kind: 'text', text: text.slice(last) });
  return tokens;
}
