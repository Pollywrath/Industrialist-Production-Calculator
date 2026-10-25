import type { GraphStore } from '../../state/graph-store';
import {
  ConnectionDraft,
  canConnectEndpoints,
  type ConnectionCompatibilityPolicy,
  type ConnectionEndpoint,
} from './connection-draft';
import type {
  CanvasActionDecision,
  CanvasActionHandler,
  CanvasActionProposal,
} from './action-proposal';
import type { Point } from '../renderer/edge-view';

export type ConnectionCommandResult =
  | { readonly status: 'started' }
  | { readonly status: 'connected' | 'reconnected' | 'unchanged'; readonly edgeId: string }
  | { readonly status: 'pending' }
  | { readonly status: 'invalid' | 'cancelled'; readonly reason?: string };

export type ConnectionRequest = Extract<
  CanvasActionProposal,
  { readonly type: 'connect' | 'reconnect' }
>;

export type ConnectionCommitResult =
  | { readonly status: 'connected' | 'reconnected' | 'unchanged'; readonly edgeId: string }
  | { readonly status: 'invalid' | 'cancelled'; readonly reason?: string };

function resolveHostDecision(
  request: ConnectionRequest,
  decision: CanvasActionDecision,
): ConnectionCommitResult {
  if (decision.status === 'committed' && decision.id) {
    return {
      status: request.type === 'connect' ? 'connected' : 'reconnected',
      edgeId: decision.id,
    };
  }
  if (decision.status === 'unchanged' && decision.id) {
    return { status: 'unchanged', edgeId: decision.id };
  }
  if (decision.status === 'cancelled') {
    return {
      status: 'cancelled',
      ...(decision.reason ? { reason: decision.reason } : {}),
    };
  }
  return {
    status: 'invalid',
    reason:
      decision.status === 'rejected'
        ? decision.reason
        : 'The app did not return an edge ID for the connection.',
  };
}

export function createConnectionController(
  graph: GraphStore,
  commit?: CanvasActionHandler,
  isCompatible: ConnectionCompatibilityPolicy = canConnectEndpoints,
) {
  let active: ConnectionDraft | null = null;
  let pendingClick: ConnectionEndpoint | null = null;
  let reconnect: { readonly edgeId: string; readonly side: 'source' | 'target' } | null = null;

  function connect(first: ConnectionEndpoint, second: ConnectionEndpoint): ConnectionCommitResult {
    if (!isCompatible(first, second)) {
      return { status: 'invalid', reason: 'The connection endpoints are incompatible.' };
    }
    if (commit) {
      const request = { type: 'connect', first, second } satisfies ConnectionRequest;
      return resolveHostDecision(request, commit(request));
    }
    const result = graph.connectPorts(first, second);
    if (result.edgeId) {
      return {
        status: result.status === 'existing' ? 'unchanged' : 'connected',
        edgeId: result.edgeId,
      };
    }
    return { status: 'invalid', reason: result.reason };
  }

  function start(source: ConnectionEndpoint, pointer: Point): ConnectionCommandResult {
    if (pendingClick) {
      const result = connect(pendingClick, source);
      pendingClick = null;
      if (result.status === 'connected' || result.status === 'unchanged') {
        return { status: result.status, edgeId: result.edgeId };
      }
      const reason = 'reason' in result ? result.reason : undefined;
      return result.status === 'cancelled'
        ? { status: 'cancelled', ...(reason ? { reason } : {}) }
        : { status: 'invalid', ...(reason ? { reason } : {}) };
    }
    active = new ConnectionDraft(source, pointer, isCompatible);
    return { status: 'started' };
  }

  function startReconnect(
    edgeId: string,
    side: 'source' | 'target',
    fixedEndpoint: ConnectionEndpoint,
    pointer: Point,
  ) {
    reconnect = { edgeId, side };
    active = new ConnectionDraft(fixedEndpoint, pointer, isCompatible);
  }

  function update(point: Point, target: ConnectionEndpoint | null, zoom: number) {
    active?.update(point, target, zoom);
  }

  function finish(
    target: ConnectionEndpoint | null,
    allowClickToConnect: boolean,
    outside = false,
  ): ConnectionCommandResult {
    if (outside) {
      cancel();
      return { status: 'cancelled' };
    }
    const draft = active;
    if (!draft) return { status: 'cancelled' };
    const targetEndpoint = draft.finish(target, (endpoint) => {
      const node = graph.getNode(endpoint.nodeId);
      return !!node?.ports.some((port) => port.id === endpoint.portId);
    });
    active = null;
    const reconnectTarget = reconnect;
    reconnect = null;
    if (targetEndpoint && reconnectTarget) {
      const request = {
        type: 'reconnect',
        edgeId: reconnectTarget.edgeId,
        side: reconnectTarget.side,
        endpoint: targetEndpoint,
      } satisfies ConnectionRequest;
      const result = commit
        ? resolveHostDecision(request, commit(request))
        : graph.reconnectEdgeEndpoint(reconnectTarget.edgeId, reconnectTarget.side, targetEndpoint);
      if (result.status === 'reconnected' || result.status === 'unchanged') {
        return { status: result.status, edgeId: reconnectTarget.edgeId };
      }
      const reason = 'reason' in result ? result.reason : undefined;
      return result.status === 'cancelled'
        ? { status: 'cancelled', ...(reason ? { reason } : {}) }
        : { status: 'invalid', ...(reason ? { reason } : {}) };
    }
    if (targetEndpoint) {
      const result = connect(draft.source, targetEndpoint);
      if (result.status === 'connected' || result.status === 'unchanged') {
        return { status: result.status, edgeId: result.edgeId };
      }
      const reason = 'reason' in result ? result.reason : undefined;
      return result.status === 'cancelled'
        ? { status: 'cancelled', ...(reason ? { reason } : {}) }
        : { status: 'invalid', ...(reason ? { reason } : {}) };
    }
    if (!draft.moved && allowClickToConnect) {
      pendingClick = draft.source;
      return { status: 'pending' };
    }
    return { status: 'invalid', reason: 'No valid target port was selected.' };
  }

  function cancel() {
    const hadGesture = !!active || !!pendingClick || !!reconnect;
    active?.cancel();
    active = null;
    pendingClick = null;
    reconnect = null;
    return hadGesture;
  }

  return {
    start,
    startReconnect,
    update,
    finish,
    cancel,
    getActive: () => active,
    getPendingClick: () => pendingClick,
    getReconnect: () => reconnect,
    isActive: () => active !== null,
  };
}
