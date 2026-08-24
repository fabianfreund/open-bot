import type { Card } from '@openbot/shared';

/** Everything a card renderer gets. */
export interface CardProps {
  card: Card;
  /** Sends the person's answer back and continues the conversation. */
  onAnswer(answer: string): void;
}

export type CardComponent = (props: CardProps) => React.ReactNode;
