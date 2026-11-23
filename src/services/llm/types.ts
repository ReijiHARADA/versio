/**
 * Glossary entry.
 */
export interface GlossaryEntry {
  /** Original term (English) */
  term: string;
  /** Japanese translation */
  translation: string;
  /** Optional definition/explanation */
  definition?: string;
}
