const NOTION_RICH_TEXT_CONTENT_LIMIT = 2000;
const NOTION_RICH_TEXT_ARRAY_LIMIT = 100;

type NotionAnnotations = {
  bold?: true;
  code?: true;
  italic?: true;
  strikethrough?: true;
};

type NotionText = {
  content: string;
  link?: {
    url: string;
  };
};

type NotionRichText = {
  type: 'text';
  text: NotionText;
  annotations?: NotionAnnotations;
};

type NotionTextBlockType =
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'heading_4'
  | 'paragraph'
  | 'bulleted_list_item'
  | 'numbered_list_item'
  | 'quote';

type NotionTextBlockBody = {
  rich_text: NotionRichText[];
};

export type NotionBlock =
  | {
      object: 'block';
      type: 'heading_1';
      heading_1: NotionTextBlockBody;
    }
  | {
      object: 'block';
      type: 'heading_2';
      heading_2: NotionTextBlockBody;
    }
  | {
      object: 'block';
      type: 'heading_3';
      heading_3: NotionTextBlockBody;
    }
  | {
      object: 'block';
      type: 'heading_4';
      heading_4: NotionTextBlockBody;
    }
  | {
      object: 'block';
      type: 'paragraph';
      paragraph: NotionTextBlockBody;
    }
  | {
      object: 'block';
      type: 'bulleted_list_item';
      bulleted_list_item: NotionTextBlockBody;
    }
  | {
      object: 'block';
      type: 'numbered_list_item';
      numbered_list_item: NotionTextBlockBody & {
        list_start_index?: number;
      };
    }
  | {
      object: 'block';
      type: 'quote';
      quote: NotionTextBlockBody;
    }
  | {
      object: 'block';
      type: 'code';
      code: {
        rich_text: NotionRichText[];
        language: string;
      };
    }
  | {
      object: 'block';
      type: 'divider';
      divider: Record<string, never>;
    }
  | {
      object: 'block';
      type: 'table';
      table: {
        table_width: number;
        has_column_header: boolean;
        has_row_header: boolean;
      };
      children: Array<{
        object: 'block';
        type: 'table_row';
        table_row: {
          cells: NotionRichText[][];
        };
      }>;
    };

type InlineParseOptions = {
  annotations?: NotionAnnotations;
  linkUrl?: string;
};

function splitContentIntoChunks(content: string) {
  const chunks: string[] = [];

  for (let index = 0; index < content.length; index += NOTION_RICH_TEXT_CONTENT_LIMIT) {
    chunks.push(content.slice(index, index + NOTION_RICH_TEXT_CONTENT_LIMIT));
  }

  return chunks;
}

function hasAnnotations(annotations: NotionAnnotations) {
  return Object.values(annotations).some(Boolean);
}

function mergeAnnotations(
  currentAnnotations: NotionAnnotations | undefined,
  nextAnnotations: NotionAnnotations,
): NotionAnnotations {
  return {
    ...currentAnnotations,
    ...nextAnnotations,
  };
}

function toRichTextSegments(content: string, options: InlineParseOptions = {}): NotionRichText[] {
  if (!content) {
    return [];
  }

  return splitContentIntoChunks(content).map((chunk) => {
    const annotations = options.annotations ?? {};
    const richText: NotionRichText = {
      type: 'text',
      text: {
        content: chunk,
        ...(options.linkUrl ? { link: { url: options.linkUrl } } : {}),
      },
      ...(hasAnnotations(annotations) ? { annotations } : {}),
    };

    return richText;
  });
}

function findClosingToken(content: string, token: string, fromIndex: number) {
  let searchIndex = fromIndex;

  while (searchIndex < content.length) {
    const tokenIndex = content.indexOf(token, searchIndex);

    if (tokenIndex === -1) {
      return -1;
    }

    const escaped = tokenIndex > 0 && content[tokenIndex - 1] === '\\';
    const isSingleAsteriskInsideBold =
      token === '*' && (content[tokenIndex - 1] === '*' || content[tokenIndex + 1] === '*');

    if (!escaped && !isSingleAsteriskInsideBold) {
      return tokenIndex;
    }

    searchIndex = tokenIndex + token.length;
  }

  return -1;
}

function normalizeLinkUrl(url: string) {
  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmedUrl);

    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsedUrl.protocol)
      ? trimmedUrl
      : null;
  } catch {
    return null;
  }
}

function parseInlineMarkdown(content: string, options: InlineParseOptions = {}): NotionRichText[] {
  const richText: NotionRichText[] = [];
  let plainText = '';
  let index = 0;

  const flushPlainText = () => {
    richText.push(...toRichTextSegments(plainText, options));
    plainText = '';
  };

  while (index < content.length) {
    const currentCharacter = content[index];
    const nextCharacter = content[index + 1];

    if (currentCharacter === '\\' && nextCharacter) {
      plainText += nextCharacter;
      index += 2;
      continue;
    }

    if (currentCharacter === '`') {
      const codeEnd = findClosingToken(content, '`', index + 1);

      if (codeEnd !== -1) {
        flushPlainText();
        richText.push(
          ...toRichTextSegments(content.slice(index + 1, codeEnd), {
            ...options,
            annotations: mergeAnnotations(options.annotations, { code: true }),
          }),
        );
        index = codeEnd + 1;
        continue;
      }
    }

    if (content.startsWith('**', index)) {
      const boldEnd = findClosingToken(content, '**', index + 2);

      if (boldEnd !== -1) {
        flushPlainText();
        richText.push(
          ...parseInlineMarkdown(content.slice(index + 2, boldEnd), {
            ...options,
            annotations: mergeAnnotations(options.annotations, { bold: true }),
          }),
        );
        index = boldEnd + 2;
        continue;
      }
    }

    if (content.startsWith('~~', index)) {
      const strikethroughEnd = findClosingToken(content, '~~', index + 2);

      if (strikethroughEnd !== -1) {
        flushPlainText();
        richText.push(
          ...parseInlineMarkdown(content.slice(index + 2, strikethroughEnd), {
            ...options,
            annotations: mergeAnnotations(options.annotations, { strikethrough: true }),
          }),
        );
        index = strikethroughEnd + 2;
        continue;
      }
    }

    if (currentCharacter === '[') {
      const labelEnd = findClosingToken(content, ']', index + 1);
      const urlStart = labelEnd !== -1 && content[labelEnd + 1] === '(' ? labelEnd + 2 : -1;
      const urlEnd = urlStart !== -1 ? findClosingToken(content, ')', urlStart) : -1;
      const url = urlEnd !== -1 ? normalizeLinkUrl(content.slice(urlStart, urlEnd)) : null;

      if (labelEnd !== -1 && urlEnd !== -1 && url) {
        flushPlainText();
        richText.push(
          ...parseInlineMarkdown(content.slice(index + 1, labelEnd), {
            ...options,
            linkUrl: url,
          }),
        );
        index = urlEnd + 1;
        continue;
      }
    }

    if (currentCharacter === '*' && nextCharacter !== '*') {
      const italicEnd = findClosingToken(content, '*', index + 1);

      if (italicEnd !== -1) {
        flushPlainText();
        richText.push(
          ...parseInlineMarkdown(content.slice(index + 1, italicEnd), {
            ...options,
            annotations: mergeAnnotations(options.annotations, { italic: true }),
          }),
        );
        index = italicEnd + 1;
        continue;
      }
    }

    if (currentCharacter === '_') {
      const italicEnd = findClosingToken(content, '_', index + 1);
      const isWithinWord =
        /\w/.test(content[index - 1] ?? '') || /\w/.test(content[italicEnd + 1] ?? '');

      if (italicEnd !== -1 && !isWithinWord) {
        flushPlainText();
        richText.push(
          ...parseInlineMarkdown(content.slice(index + 1, italicEnd), {
            ...options,
            annotations: mergeAnnotations(options.annotations, { italic: true }),
          }),
        );
        index = italicEnd + 1;
        continue;
      }
    }

    plainText += currentCharacter;
    index += 1;
  }

  flushPlainText();

  return richText;
}

function splitRichTextIntoGroups(richText: NotionRichText[]) {
  const groups: NotionRichText[][] = [];

  for (let index = 0; index < richText.length; index += NOTION_RICH_TEXT_ARRAY_LIMIT) {
    groups.push(richText.slice(index, index + NOTION_RICH_TEXT_ARRAY_LIMIT));
  }

  return groups.length ? groups : [[]];
}

function createTextBlock(
  type: NotionTextBlockType,
  richText: NotionRichText[],
  listStartIndex?: number,
): NotionBlock {
  switch (type) {
    case 'heading_1':
      return {
        object: 'block',
        type,
        heading_1: {
          rich_text: richText,
        },
      };
    case 'heading_2':
      return {
        object: 'block',
        type,
        heading_2: {
          rich_text: richText,
        },
      };
    case 'heading_3':
      return {
        object: 'block',
        type,
        heading_3: {
          rich_text: richText,
        },
      };
    case 'heading_4':
      return {
        object: 'block',
        type,
        heading_4: {
          rich_text: richText,
        },
      };
    case 'bulleted_list_item':
      return {
        object: 'block',
        type,
        bulleted_list_item: {
          rich_text: richText,
        },
      };
    case 'numbered_list_item':
      return {
        object: 'block',
        type,
        numbered_list_item: {
          rich_text: richText,
          ...(listStartIndex ? { list_start_index: listStartIndex } : {}),
        },
      };
    case 'quote':
      return {
        object: 'block',
        type,
        quote: {
          rich_text: richText,
        },
      };
    case 'paragraph':
    default:
      return {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: richText,
        },
      };
  }
}

function createTextBlocks(
  type: NotionTextBlockType,
  richText: NotionRichText[],
  listStartIndex?: number,
): NotionBlock[] {
  return splitRichTextIntoGroups(richText).map((richTextGroup, index) => {
    const blockType = index === 0 ? type : 'paragraph';

    return createTextBlock(blockType, richTextGroup, index === 0 ? listStartIndex : undefined);
  });
}

function createCodeBlocks(content: string, language: string): NotionBlock[] {
  return splitRichTextIntoGroups(toRichTextSegments(content)).map((richTextGroup) => ({
    object: 'block',
    type: 'code',
    code: {
      rich_text: richTextGroup,
      language,
    },
  }));
}

function createDividerBlock(): NotionBlock {
  return {
    object: 'block',
    type: 'divider',
    divider: {},
  };
}

function getHeadingType(level: number): 'heading_1' | 'heading_2' | 'heading_3' | 'heading_4' {
  if (level <= 1) {
    return 'heading_1';
  }

  if (level === 2) {
    return 'heading_2';
  }

  if (level === 3) {
    return 'heading_3';
  }

  return 'heading_4';
}

function normalizeCodeLanguage(language: string) {
  const normalizedLanguage = language.trim().toLowerCase();
  const aliases: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    ts: 'typescript',
    tsx: 'typescript',
  };

  return aliases[normalizedLanguage] ?? (normalizedLanguage || 'plain text');
}

function splitTableRow(line: string) {
  const trimmedLine = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let currentCell = '';

  for (let index = 0; index < trimmedLine.length; index += 1) {
    const currentCharacter = trimmedLine[index];
    const nextCharacter = trimmedLine[index + 1];

    if (currentCharacter === '\\' && nextCharacter === '|') {
      currentCell += nextCharacter;
      index += 1;
      continue;
    }

    if (currentCharacter === '|') {
      cells.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    currentCell += currentCharacter;
  }

  cells.push(currentCell.trim());

  return cells;
}

function isTableDividerLine(line: string) {
  const cells = splitTableRow(line);

  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isPotentialTableRow(line: string) {
  return line.includes('|') && splitTableRow(line).length > 1;
}

function createTableBlock(tableLines: string[]): NotionBlock {
  const [headerLine, , ...bodyLines] = tableLines;
  const headerCells = splitTableRow(headerLine);
  const tableWidth = headerCells.length;
  const rowLines = [headerLine, ...bodyLines];

  return {
    object: 'block',
    type: 'table',
    table: {
      table_width: tableWidth,
      has_column_header: true,
      has_row_header: false,
    },
    children: rowLines.map((line) => {
      const cells = splitTableRow(line);
      const normalizedCells = Array.from({ length: tableWidth }, (_, index) => cells[index] ?? '');

      return {
        object: 'block',
        type: 'table_row',
        table_row: {
          cells: normalizedCells.map((cell) => parseInlineMarkdown(cell)),
        },
      };
    }),
  };
}

/**
 * Converts Markdown into Notion block objects that can be sent to
 * notion.blocks.children.append().
 *
 * Supported Markdown: # through ###### headings, bullets, numbered lists,
 * paragraphs, blockquotes, dividers, fenced code blocks, tables, inline
 * **bold**, *italic*, `code`, ~~strikethrough~~, and [links](https://example.com).
 * Empty lines are skipped.
 */
export function markdownToNotionBlocks(markdown: string): NotionBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: NotionBlock[] = [];
  let numberedListNextIndex: number | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line) {
      numberedListNextIndex = null;
      continue;
    }

    const codeFenceMatch = /^```([A-Za-z0-9_-]*)\s*$/.exec(line);

    if (codeFenceMatch) {
      const codeLines: string[] = [];
      const [, language] = codeFenceMatch;

      index += 1;

      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }

      blocks.push(...createCodeBlocks(codeLines.join('\n'), normalizeCodeLanguage(language)));
      numberedListNextIndex = null;
      continue;
    }

    if (
      index + 1 < lines.length &&
      isPotentialTableRow(line) &&
      isTableDividerLine(lines[index + 1])
    ) {
      const tableLines = [line, lines[index + 1]];

      index += 2;

      while (index < lines.length && isPotentialTableRow(lines[index].trim())) {
        tableLines.push(lines[index].trim());
        index += 1;
      }

      index -= 1;
      blocks.push(createTableBlock(tableLines));
      numberedListNextIndex = null;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      blocks.push(createDividerBlock());
      numberedListNextIndex = null;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);

    if (headingMatch) {
      const [, level, content] = headingMatch;

      blocks.push(
        ...createTextBlocks(getHeadingType(level.length), parseInlineMarkdown(content.trim())),
      );
      numberedListNextIndex = null;
      continue;
    }

    const numberedListMatch = /^(\d+)[.)]\s+(.+)$/.exec(line);

    if (numberedListMatch) {
      const [, listIndex, content] = numberedListMatch;
      const parsedListIndex = Number.parseInt(listIndex, 10);
      const shouldSetStartIndex = numberedListNextIndex !== parsedListIndex;

      blocks.push(
        ...createTextBlocks(
          'numbered_list_item',
          parseInlineMarkdown(content.trim()),
          shouldSetStartIndex ? parsedListIndex : undefined,
        ),
      );
      numberedListNextIndex = parsedListIndex + 1;
      continue;
    }

    const bulletMatch = /^[-*+]\s+(.+)$/.exec(line);

    if (bulletMatch) {
      const [, content] = bulletMatch;

      blocks.push(...createTextBlocks('bulleted_list_item', parseInlineMarkdown(content.trim())));
      numberedListNextIndex = null;
      continue;
    }

    const quoteMatch = /^>\s?(.*)$/.exec(line);

    if (quoteMatch) {
      const [, content] = quoteMatch;

      blocks.push(...createTextBlocks('quote', parseInlineMarkdown(content.trim())));
      numberedListNextIndex = null;
      continue;
    }

    blocks.push(...createTextBlocks('paragraph', parseInlineMarkdown(line)));
    numberedListNextIndex = null;
  }

  return blocks;
}
