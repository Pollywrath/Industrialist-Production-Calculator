import type { CanvasActionProposal } from './pixiEngine/canvas/interaction/action-proposal';

export function isPixiTutorialAuthorizationRequired(
  proposal: CanvasActionProposal,
  activeMode: string | null,
): boolean {
  if (proposal.type === 'move-nodes') return false;
  if (proposal.type !== 'activate-canvas-target') return true;

  if (activeMode === 'target' || activeMode === 'multi_select') return true;
  if (proposal.target.type === 'node' || proposal.target.type === 'group') return false;
  return proposal.target.type !== 'port' || proposal.target.phase !== 'handle';
}

export function shouldPixiProposalAdvanceTutorial(proposal: CanvasActionProposal): boolean {
  return proposal.type !== 'move-nodes';
}
