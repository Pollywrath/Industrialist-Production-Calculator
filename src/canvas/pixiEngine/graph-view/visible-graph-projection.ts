import type { GroupId, NodeId } from '../domain/graph/types';
import type { RecipeNode as FlowNode } from '../domain/nodes/recipe/model';
import type { GroupProxyPort } from '../domain/nodes/group/geometry';

function memberPortKey(nodeId: string, portId: string) {
  return `${nodeId}\u0000${portId}`;
}

export class VisibleGraphProjection {
  private readonly proxyNodeByGroupId = new Map<string, FlowNode>();
  private readonly proxyPortsByGroupId = new Map<string, readonly GroupProxyPort[]>();
  private readonly memberNodeIdsByGroupId = new Map<string, readonly NodeId[]>();
  private readonly proxyPortById = new Map<string, GroupProxyPort>();
  private readonly proxyPortIdByMemberPort = new Map<string, string>();
  private readonly visibleEndpointByMemberPort = new Map<
    string,
    { readonly nodeId: GroupId; readonly portId: string }
  >();
  private readonly hiddenNodeIds = new Set<string>();

  setCollapsedGroup(
    groupId: GroupId,
    memberNodeIds: readonly NodeId[],
    node: FlowNode,
    ports: readonly GroupProxyPort[],
  ) {
    this.clearCollapsedGroup(groupId, memberNodeIds);
    this.proxyNodeByGroupId.set(groupId, node);
    this.proxyPortsByGroupId.set(groupId, ports);
    this.memberNodeIdsByGroupId.set(groupId, [...memberNodeIds]);
    for (const nodeId of memberNodeIds) this.hiddenNodeIds.add(nodeId);
    for (const proxy of ports) {
      this.proxyPortById.set(proxy.proxyPortId, proxy);
      this.proxyPortIdByMemberPort.set(
        memberPortKey(proxy.memberNodeId, proxy.memberPortId),
        proxy.proxyPortId,
      );
      this.visibleEndpointByMemberPort.set(memberPortKey(proxy.memberNodeId, proxy.memberPortId), {
        nodeId: groupId,
        portId: proxy.proxyPortId,
      });
    }
  }

  clearCollapsedGroup(groupId: GroupId, memberNodeIds: readonly NodeId[] = []) {
    const hiddenMembers = this.memberNodeIdsByGroupId.get(groupId) ?? memberNodeIds;
    for (const proxy of this.proxyPortsByGroupId.get(groupId) ?? []) {
      this.proxyPortById.delete(proxy.proxyPortId);
      this.proxyPortIdByMemberPort.delete(memberPortKey(proxy.memberNodeId, proxy.memberPortId));
      this.visibleEndpointByMemberPort.delete(
        memberPortKey(proxy.memberNodeId, proxy.memberPortId),
      );
    }
    this.proxyPortsByGroupId.delete(groupId);
    this.memberNodeIdsByGroupId.delete(groupId);
    this.proxyNodeByGroupId.delete(groupId);
    for (const nodeId of hiddenMembers) this.hiddenNodeIds.delete(nodeId);
  }

  removeGroup(groupId: GroupId, memberNodeIds: readonly NodeId[] = []) {
    this.clearCollapsedGroup(groupId, memberNodeIds);
  }

  getDisplayNode(id: string, getNode: (id: string) => FlowNode | undefined) {
    const proxy = this.proxyNodeByGroupId.get(id);
    if (proxy) return proxy;
    if (this.hiddenNodeIds.has(id)) return undefined;
    return getNode(id);
  }

  getProxyNode(groupId: GroupId) {
    return this.proxyNodeByGroupId.get(groupId);
  }

  isCollapsedGroup(groupId: GroupId) {
    return this.proxyNodeByGroupId.has(groupId);
  }

  getProxyPort(proxyPortId: string) {
    return this.proxyPortById.get(proxyPortId);
  }

  getProxyPortId(memberNodeId: string, memberPortId: string) {
    return this.proxyPortIdByMemberPort.get(memberPortKey(memberNodeId, memberPortId));
  }

  getVisibleEndpoint(nodeId: NodeId, portId: string) {
    return (
      this.visibleEndpointByMemberPort.get(memberPortKey(nodeId, portId)) ?? { nodeId, portId }
    );
  }

  getProxyPorts(groupId: GroupId) {
    return this.proxyPortsByGroupId.get(groupId) ?? [];
  }

  isHiddenNode(nodeId: string) {
    return this.hiddenNodeIds.has(nodeId);
  }

  clear() {
    this.proxyNodeByGroupId.clear();
    this.proxyPortsByGroupId.clear();
    this.memberNodeIdsByGroupId.clear();
    this.proxyPortById.clear();
    this.proxyPortIdByMemberPort.clear();
    this.visibleEndpointByMemberPort.clear();
    this.hiddenNodeIds.clear();
  }
}
