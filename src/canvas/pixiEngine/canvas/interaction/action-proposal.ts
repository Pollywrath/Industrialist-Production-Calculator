import type { ConnectionEndpoint } from './connection-draft';

export type CanvasActionProposal =
  | {
      readonly type: 'activate-canvas-target';
      readonly target: (
        | { readonly type: 'node'; readonly nodeId: string; readonly phase: 'down' | 'click' }
        | { readonly type: 'group'; readonly groupId: string }
        | { readonly type: 'edge'; readonly edgeId: string }
        | {
            readonly type: 'port';
            readonly nodeId: string;
            readonly portId: string;
            readonly phase?: 'handle' | 'row' | 'double';
          }
      ) & { readonly altKey?: boolean };
    }
  | {
      readonly type: 'activate-control';
      readonly entityId: string;
      readonly controlId: string;
      readonly action: string;
    }
  | {
      readonly type: 'move-nodes';
      readonly positions: readonly {
        readonly id: string;
        readonly x: number;
        readonly y: number;
      }[];
      readonly groupId?: string;
    }
  | {
      readonly type: 'connect';
      readonly first: ConnectionEndpoint;
      readonly second: ConnectionEndpoint;
    }
  | {
      readonly type: 'reconnect';
      readonly edgeId: string;
      readonly side: 'source' | 'target';
      readonly endpoint: ConnectionEndpoint;
    }
  | {
      readonly type: 'start-reconnect';
      readonly edgeId: string;
      readonly side: 'source' | 'target';
    }
  | {
      readonly type: 'set-edge-route';
      readonly edgeId: string;
      readonly key: 'controlPoints' | 'orthogonalTurns';
      readonly points: readonly { readonly x: number; readonly y: number }[];
    }
  | {
      readonly type: 'delete-edge-route-point';
      readonly edgeId: string;
      readonly key: 'controlPoints' | 'orthogonalTurns';
      readonly pointId: string;
      readonly points: readonly { readonly x: number; readonly y: number }[];
      readonly altKey: boolean;
    }
  | {
      readonly type: 'set-group-collapsed';
      readonly groupId: string;
      readonly collapsed: boolean;
    };

export type CanvasActionDecision =
  | { readonly status: 'committed'; readonly id?: string }
  | { readonly status: 'unchanged'; readonly id?: string }
  | { readonly status: 'ignored' }
  | { readonly status: 'rejected' | 'cancelled'; readonly reason?: string };

export type CanvasActionHandler = (proposal: CanvasActionProposal) => CanvasActionDecision;
