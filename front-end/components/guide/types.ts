import type { ReactNode } from 'react';

/**
 * A single screen of the onboarding/guide modal.
 *
 * To edit the guide for a page, find that page's step array (e.g.
 * `home-guide-steps.ts`) and change the entries here. Add a step by appending
 * an object, remove one by deleting it — the modal adapts automatically.
 */
export interface GuideStep {
  /** Short heading shown above the description. */
  title: string;
  /** The body copy. Accepts a string or any richer React node. */
  description: ReactNode;
  /**
   * Optional visual content shown above the copy — an animated GIF/video, an
   * illustration, or a rendered preview of the interaction.
   */
  media?: ReactNode;
}
