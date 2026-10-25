import type { FlowGroup, NodeId } from '../../graph/types';

export type GroupContainer = FlowGroup;

export interface GroupMembership {
  readonly groupId: string;
  readonly memberNodeIds: readonly NodeId[];
  readonly collapsed: boolean;
}
