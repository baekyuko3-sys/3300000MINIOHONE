export interface LineTurnContext {
  conversationId: string;
  personaId: string;
}

/** A reply may update UI only while its originating chat and persona are still active. */
export function isLineTurnContextCurrent(current: LineTurnContext, started: LineTurnContext): boolean {
  return current.conversationId === started.conversationId && current.personaId === started.personaId;
}

/** Only the request that owns the typing indicator may clear it. */
export function releaseLineTypingRequest(
  owner: { current: string },
  requestId: string,
  setTyping: (value: boolean) => void,
  resetStartTime: () => void,
): boolean {
  if (!requestId || owner.current !== requestId) return false;
  owner.current = '';
  setTyping(false);
  resetStartTime();
  return true;
}
