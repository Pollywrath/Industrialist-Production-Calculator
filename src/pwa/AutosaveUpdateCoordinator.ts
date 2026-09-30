import { flushAutosave } from '../persistence/flushAutosave';
import { rotateAutosaveTabId } from '../persistence/autosaveIdentity';

type Message =
  | { type: 'HELLO' | 'PRESENCE'; clientId: string; tabId: string }
  | { type: 'BYE'; clientId: string }
  | { type: 'COLLISION'; clientId: string; tabId: string; targetClientId: string }
  | { type: 'PREPARE'; clientId: string; requestId: string }
  | {
      type: 'ACK';
      clientId: string;
      requestId: string;
      ok: boolean;
      error?: string;
    };
type AckMessage = Extract<Message, { type: 'ACK' }>;

interface PendingRequest {
  expected: Set<string>;
  received: Set<string>;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: number;
}

const CHANNEL_NAME = 'industrialist-pwa-update';
const PEER_TTL_MS = 5 * 60 * 1000;
const DISCOVERY_DELAY_MS = 300;
const ACK_TIMEOUT_MS = 45_000;

export class AutosaveUpdateCoordinator {
  private readonly channel: BroadcastChannel;
  private readonly peers = new Map<string, number>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly clientId = crypto.randomUUID();
  private tabId: string;
  private identityConflict = false;
  private readonly heartbeatId: number;
  private disposed = false;

  constructor(tabId: string) {
    if (typeof BroadcastChannel === 'undefined') {
      throw new Error('This browser cannot coordinate saves across open tabs.');
    }
    this.tabId = tabId;
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.addEventListener('message', this.handleMessage);
    this.peers.set(this.clientId, Date.now());
    this.announce('HELLO');
    this.heartbeatId = window.setInterval(() => this.announce('PRESENCE'), 30_000);
    window.addEventListener('pagehide', this.announceGoodbye);
  }

  private announce(type: 'HELLO' | 'PRESENCE'): void {
    this.channel.postMessage({
      type,
      clientId: this.clientId,
      tabId: this.tabId,
    } satisfies Message);
  }

  private announceGoodbye = (): void => {
    this.channel.postMessage({
      type: 'BYE',
      clientId: this.clientId,
    } satisfies Message);
  };

  private handleMessage = (event: MessageEvent<Message>): void => {
    const message = event.data;
    if (!message || message.clientId === this.clientId) return;

    if (message.type === 'HELLO' || message.type === 'PRESENCE') {
      this.peers.set(message.clientId, Date.now());
      if (message.tabId === this.tabId) {
        const conflictingId = this.tabId;
        this.tabId = rotateAutosaveTabId();
        if (this.tabId === conflictingId) {
          this.identityConflict = true;
        } else {
          this.channel.postMessage({
            type: 'COLLISION',
            clientId: this.clientId,
            tabId: conflictingId,
            targetClientId: message.clientId,
          } satisfies Message);
        }
      }
      if (message.type === 'HELLO') this.announce('PRESENCE');
      return;
    }
    if (message.type === 'BYE') {
      this.peers.delete(message.clientId);
      return;
    }
    if (message.type === 'COLLISION') {
      if (message.targetClientId === this.clientId && this.tabId === message.tabId) {
        this.tabId = rotateAutosaveTabId();
        if (this.tabId === message.tabId) this.identityConflict = true;
      }
      return;
    }
    if (message.type === 'PREPARE') {
      void this.flushForUpdate(message.requestId);
      return;
    }
    if (message.type === 'ACK') {
      this.receiveAck(message);
    }
  };

  private async flushForUpdate(requestId: string): Promise<void> {
    const ack: AckMessage = {
      type: 'ACK',
      clientId: this.clientId,
      requestId,
      ok: false,
    };
    try {
      await flushAutosave(this.tabId);
      ack.ok = true;
    } catch (error) {
      ack.error = error instanceof Error ? error.message : 'Could not save this tab.';
    }
    this.receiveAck(ack);
    this.channel.postMessage(ack);
  }

  private receiveAck(message: AckMessage): void {
    const request = this.pending.get(message.requestId);
    if (
      !request ||
      !request.expected.has(message.clientId) ||
      request.received.has(message.clientId)
    ) {
      return;
    }
    request.received.add(message.clientId);
    if (!message.ok) {
      window.clearTimeout(request.timeout);
      this.pending.delete(message.requestId);
      request.reject(
        new Error(`A tab could not save before update: ${message.error ?? 'save failed'}`),
      );
      return;
    }
    if (request.received.size !== request.expected.size) return;

    window.clearTimeout(request.timeout);
    this.pending.delete(message.requestId);
    request.resolve();
  }

  async prepareAllTabs(): Promise<void> {
    this.announce('HELLO');
    await new Promise((resolve) => window.setTimeout(resolve, DISCOVERY_DELAY_MS));
    if (this.identityConflict) {
      throw new Error(
        'Open tabs share an autosave identity and this browser cannot create separate tab saves. Enable session storage, then retry the update.',
      );
    }
    const now = Date.now();
    const expected = new Set(
      [...this.peers.entries()]
        .filter(([, lastSeen]) => now - lastSeen <= PEER_TTL_MS)
        .map(([clientId]) => clientId),
    );
    expected.add(this.clientId);
    const requestId = crypto.randomUUID();

    const allSaved = new Promise<void>((resolve, reject) => {
      const pendingRequest: PendingRequest = {
        expected,
        received: new Set(),
        resolve,
        reject,
        timeout: 0,
      };
      const timeout = window.setTimeout(() => {
        this.pending.delete(requestId);
        const missing = [...expected].filter(
          (clientId) => clientId !== this.clientId && !pendingRequest.received.has(clientId),
        );
        reject(
          new Error(
            `Another open tab did not confirm its save${missing.length ? ` (${missing.join(', ')})` : ''}. Retry the update when the other tab is available.`,
          ),
        );
      }, ACK_TIMEOUT_MS);
      pendingRequest.timeout = timeout;
      this.pending.set(requestId, pendingRequest);
    });

    this.channel.postMessage({
      type: 'PREPARE',
      clientId: this.clientId,
      requestId,
    } satisfies Message);
    void this.flushForUpdate(requestId);
    await allSaved;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.announceGoodbye();
    window.clearInterval(this.heartbeatId);
    window.removeEventListener('pagehide', this.announceGoodbye);
    this.channel.removeEventListener('message', this.handleMessage);
    this.channel.close();
    for (const request of this.pending.values()) {
      window.clearTimeout(request.timeout);
      request.reject(new Error('Update coordination was interrupted.'));
    }
    this.pending.clear();
  }
}
