/**
 * Delivery of a handoff through the host's own agent-team transport.
 *
 * The plugin deliberately does not own a message channel: `agent_teams_send_message`
 * already implements durable mailboxes, wake-ups, duplicate suppression and the
 * "from must be your own identity" invariant. Relaying through that tool keeps
 * those guarantees and avoids impersonating an expert.
 */

export const RELAY_TOOL = 'agent_teams_send_message';

const MISSING =
	'dsh-commander: 当前会话没有 agent team 投递工具（agent_teams_send_message）。' +
	'先在会话里建团队并成为 captain，或把上面这段正文直接粘进宿主的 send_message。';

/** Find the host's agent-team send tool, or undefined when the session has no team. */
export function pickRelayTool(tools) {
	if (tools === undefined || typeof tools.get !== 'function') return undefined;
	const tool = tools.get(RELAY_TOOL);
	if (tool === undefined || typeof tool.execute !== 'function') return undefined;
	return tool;
}

/** Throw the actionable message when delivery is impossible. */
export function requireRelayTool(tools) {
	const tool = pickRelayTool(tools);
	if (tool === undefined) throw new Error(MISSING);
	return tool;
}

/**
 * Deliver `content` to `to` through the host tool.
 * @returns the host value `{ message_id, from, to, delivered }`.
 */
export async function relayMessage(tools, exec, { to, content }) {
	const tool = requireRelayTool(tools);
	const target = String(to ?? '').trim();
	if (target === '') throw new Error('dsh-commander: 投递需要 toMember（团队成员名，或 captain）');
	if (String(content ?? '').trim() === '') throw new Error('dsh-commander: 投递需要非空正文');
	const value = await tool.execute({ to: target, content }, exec);
	return value;
}

/** One line describing what happened, for the tool result. */
export function formatDelivered(value) {
	if (value === undefined || value === null) return '已交给宿主的 agent team 投递工具，但没有返回回执。';
	const messageId = value.message_id === undefined ? '（无 id）' : String(value.message_id);
	const from = value.from === undefined ? '?' : String(value.from);
	const to = value.to === undefined ? '?' : String(value.to);
	const delivered = value.delivered === undefined ? '?' : String(value.delivered);
	const meaning = {
		live: '对方正在跑，下一个 model step 就能读到',
		wake: '对方空闲，已被这条消息唤醒',
		mailbox: '已写入对方的 durable 收件箱，等人来读',
		duplicate: '同样的正文已经存在，没有重复投递'
	};
	const suffix = meaning[delivered] === undefined ? '' : `（${meaning[delivered]}）`;
	return `${from} → ${to} · 消息 ${messageId} · 投递方式 ${delivered}${suffix}`;
}
