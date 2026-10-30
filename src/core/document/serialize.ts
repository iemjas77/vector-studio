import { DocumentFormatError, validateDocument } from './schema';
import type { VDocument } from './types';

export const FILE_EXTENSION = '.vstudio';

export function serializeDocument(doc: VDocument): string {
  return JSON.stringify(doc);
}

export function parseDocument(text: string): VDocument {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new DocumentFormatError('File is not valid JSON (corrupted or not a Vector Studio file)');
  }
  return validateDocument(data);
}
