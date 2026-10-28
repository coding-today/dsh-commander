window.__ModuleLoader__.load({
	id: 'dsh-commander',
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		const React = require('react');
		const h = React.createElement;

		const ROUTE = '/ext/commander/state';
		const TAB_ID = 'dsh-commander';
		const POLL_MS = 3000;

		const CSS = `
.cdr-panel{display:flex;flex-direction:column;height:100%;font-size:12px;color:var(--dsh-text-primary,#e6e6e6);overflow:hidden}
.cdr-head{display:flex;align-items:baseline;gap:8px;padding:10px 12px 6px;border-bottom:1px solid rgba(127,127,127,.18)}
.cdr-title{font-weight:600;font-size:13px}
.cdr-meta{color:var(--dsh-text-secondary,#9a9a9a);font-size:11px}
.cdr-refresh{margin-left:auto;background:transparent;border:1px solid rgba(127,127,127,.35);color:inherit;border-radius:6px;font-size:11px;padding:2px 8px;cursor:pointer}
.cdr-body{flex:1;overflow:auto;padding:6px 8px 16px}
.cdr-team{margin:8px 0 4px;padding:6px 8px;border-radius:8px;background:rgba(127,127,127,.08)}
.cdr-team-name{font-weight:600}
.cdr-member{display:flex;gap:8px;padding:7px 8px;border-radius:8px;margin:4px 0;background:rgba(127,127,127,.05)}
.cdr-member:hover{background:rgba(127,127,127,.11)}
.cdr-dot{width:8px;height:8px;border-radius:50%;margin-top:5px;flex:none}
.cdr-dot-working{background:#3fb950;box-shadow:0 0 0 3px rgba(63,185,80,.18)}
.cdr-dot-idle{background:#8b949e}
.cdr-dot-removed{background:#f85149}
.cdr-main{min-width:0;flex:1}
.cdr-row{display:flex;align-items:center;gap:6px}
.cdr-name{font-weight:600}
.cdr-role{color:var(--dsh-text-secondary,#9a9a9a);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cdr-task{margin-top:3px;color:var(--dsh-text-secondary,#c9c9c9);line-height:1.45}
.cdr-chip{display:inline-block;font-size:10px;padding:0 5px;border-radius:5px;background:rgba(88,166,255,.16);color:#79c0ff;margin-right:4px}
.cdr-recent{margin-top:3px;color:var(--dsh-text-tertiary,#8b949e);font-size:11px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cdr-empty{padding:24px 16px;color:var(--dsh-text-secondary,#9a9a9a);line-height:1.6;text-align:center}
.cdr-error{margin:10px;padding:8px;border-radius:8px;background:rgba(248,81,73,.12);color:#ff7b72;line-height:1.5}
.cdr-halt{font-size:10px;padding:0 6px;border-radius:5px;background:rgba(248,81,73,.16);color:#ff7b72}
`;

		function useStyleTag() {
			React.useEffect(() => {
				const id = 'dsh-commander-style';
				if (document.getElementById(id) !== null) return undefined;
				const style = document.createElement('style');
				style.id = id;
				style.textContent = CSS;
				document.head.appendChild(style);
				return undefined;
			}, []);
		}

		function relative(ts) {
			if (!ts) return '';
			const seconds = Math.round((Date.now() - ts) / 1000);
			if (seconds < 60) return `${Math.max(seconds, 0)} 秒前`;
			const minutes = Math.round(seconds / 60);
			if (minutes < 60) return `${minutes} 分钟前`;
			const hours = Math.round(minutes / 60);
			if (hours < 24) return `${hours} 小时前`;
			return `${Math.round(hours / 24)} 天前`;
		}

		function useSnapshot() {
			const [state, setState] = React.useState({ phase: 'loading', data: undefined, error: '', at: 0 });
			const load = React.useCallback(async () => {
				try {
					const response = await fetch(ROUTE, { headers: { accept: 'application/json' }, cache: 'no-store' });
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const data = await response.json();
					setState({ phase: 'ready', data, error: '', at: Date.now() });
				} catch (error) {
					setState((previous) => ({
						phase: 'error',
						data: previous.data,
						error: String(error && error.message ? error.message : error),
						at: previous.at
					}));
				}
			}, []);
			React.useEffect(() => {
				let alive = true;
				load();
				const timer = setInterval(() => {
					if (alive && document.visibilityState === 'visible') load();
				}, POLL_MS);
				const onVisible = () => {
					if (document.visibilityState === 'visible') load();
				};
				document.addEventListener('visibilitychange', onVisible);
				return () => {
					alive = false;
					clearInterval(timer);
					document.removeEventListener('visibilitychange', onVisible);
				};
			}, [load]);
			return { ...state, reload: load };
		}

		function MemberRow({ member }) {
			const task = member.current && member.current.length > 0 ? member.current[0] : undefined;
			const recent =
				member.recent && member.recent.length > 0 ? member.recent[member.recent.length - 1] : undefined;
			return h(
				'div',
				{ className: 'cdr-member' },
				h('span', { className: `cdr-dot cdr-dot-${member.status}` }),
				h(
					'div',
					{ className: 'cdr-main' },
					h(
						'div',
						{ className: 'cdr-row' },
						h('span', { className: 'cdr-name' }, member.name),
						member.role ? h('span', { className: 'cdr-role' }, member.role) : null,
						member.stopping ? h('span', { className: 'cdr-halt' }, '收尾中') : null,
						member.spawnError ? h('span', { className: 'cdr-halt' }, '启动失败') : null
					),
					task
						? h(
								'div',
								{ className: 'cdr-task' },
								h('span', { className: 'cdr-chip' }, task.id),
								task.subject,
								` · ${task.status} · ${relative(task.updatedAt)}`
							)
						: h(
								'div',
								{ className: 'cdr-task' },
								member.status === 'working' ? '在跑，但没登记任务' : '手上没有活'
							),
					recent
						? h(
								'div',
								{ className: 'cdr-recent', title: recent.content },
								`最近 · ${recent.from}→${recent.to} · ${recent.content}`
							)
						: h('div', { className: 'cdr-recent' }, '收件箱还是空的')
				)
			);
		}

		function TeamBlock({ team }) {
			return h(
				'div',
				null,
				h(
					'div',
					{ className: 'cdr-team' },
					h('span', { className: 'cdr-team-name' }, team.name),
					team.halted ? h('span', { className: 'cdr-halt' }, ' 已暂停') : null,
					h(
						'span',
						{ className: 'cdr-meta' },
						` · ${team.members.filter((m) => m.status === 'working').length}/${team.members.length} 在跑 · 待办 ${team.counts.pending} · 完成 ${team.counts.completed}${team.counts.failed ? ` · 失败 ${team.counts.failed}` : ''}`
					)
				),
				team.members.length === 0
					? h('div', { className: 'cdr-empty' }, '团队还没有成员')
					: team.members.map((member) => h(MemberRow, { key: member.name, member }))
			);
		}

		function CommanderPanel() {
			useStyleTag();
			const snapshot = useSnapshot();
			const data = snapshot.data;
			const totals = data && data.totals ? data.totals : undefined;
			return h(
				'div',
				{ className: 'cdr-panel' },
				h(
					'div',
					{ className: 'cdr-head' },
					h('span', { className: 'cdr-title' }, '专家进展'),
					h(
						'span',
						{ className: 'cdr-meta' },
						totals
							? `${totals.working}/${totals.members} 在跑 · ${totals.teams} 个团队 · ${snapshot.at ? relative(snapshot.at) : ''}`
							: '读取中…'
					),
					h('button', { className: 'cdr-refresh', onClick: snapshot.reload }, '刷新')
				),
				snapshot.error ? h('div', { className: 'cdr-error' }, `读不到团队状态：${snapshot.error}`) : null,
				h(
					'div',
					{ className: 'cdr-body' },
					data === undefined
						? null
						: data.workspaces.length === 0
							? h(
									'div',
									{ className: 'cdr-empty' },
									'当前工作区没有 agent team。',
									h('br'),
									'让指挥官建队并派活，这里会自动出现每位专家在干什么。'
								)
							: data.workspaces.map((group) =>
									h(
										'div',
										{ key: group.path },
										h('div', { className: 'cdr-meta', style: { padding: '4px 8px' } }, group.title),
										group.teams.map((team) => h(TeamBlock, { key: team.id, team }))
									)
								)
				)
			);
		}

		const inject = ['slots', 'sidebarRight', 'sidebarRightTabs'];

		function apply(ctx) {
			// Optional scope: a host without the right sidebar simply drops the panel
			// instead of failing the whole client plugin.
			ctx.inject(['sidebarRight', 'sidebarRightTabs'], (native) => {
				native.effect(
					() =>
						native.sidebarRightTabs.register({
							id: TAB_ID,
							kind: TAB_ID,
							title: () => '专家'
						}),
					'dsh-commander: sidebar tab type'
				);
				native.slots.inject('sidebar.right.pane.tab', () =>
					native.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, CommanderPanel)
				);
			});
		}

		exports.name = TAB_ID;
		exports.inject = inject;
		exports.apply = apply;
		exports.CommanderPanel = CommanderPanel;
		return module.exports;
	}
});
