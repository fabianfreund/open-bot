import type { Card } from '@openbot/shared';
import { QuestionCard } from './QuestionCard.js';
import type { CardComponent, CardProps } from './types.js';

/**
 * Inline chat components, by `card.type`.
 *
 * To add one: write the component, register it here, and have a skill in
 * `@openbot/core` build a card with that type. Nothing between the two needs
 * to know it exists.
 */
const REGISTRY: Record<string, CardComponent> = {
  question: QuestionCard,
};

export function CardList({
  cards,
  onAnswer,
}: {
  cards: Card[];
  onAnswer(card: Card, answer: string): void;
}) {
  if (cards.length === 0) return null;
  return (
    <>
      {cards.map((card) => {
        const Component = REGISTRY[card.type];
        // An older app can still show a card it does not know how to render.
        if (!Component) return null;
        return <Component key={card.id} card={card} onAnswer={(answer) => onAnswer(card, answer)} />;
      })}
    </>
  );
}

export type { CardProps, CardComponent };
