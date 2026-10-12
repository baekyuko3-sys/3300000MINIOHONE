export interface CharacterChatSeed {
  characterId: string;
  messages: unknown[];
}

/**
 * The blank phone ships without demo conversations.
 * Real chats are created only after a character card is imported or the user creates a chat.
 */
export const CHARACTER_CHAT_SEEDS: CharacterChatSeed[] = [];

export function getInitialChatMessages(_contactName: string): any[] {
  return [];
}
