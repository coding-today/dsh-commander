import js from '@eslint/js';

/** Rules kept small on purpose: correctness and readability, not taste. */
export default [
	{
		ignores: ['node_modules/**', 'assets/**', '*.tgz']
	},
	js.configs.recommended,
	{
		files: ['**/*.mjs', '**/*.js'],
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'module',
			globals: {
				console: 'readonly',
				process: 'readonly',
				URL: 'readonly',
				Buffer: 'readonly'
			}
		},
		rules: {
			'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
			eqeqeq: ['error', 'always'],
			'prefer-const': 'error',
			'no-var': 'error',
			'object-shorthand': ['warn', 'always'],
			'no-else-return': 'warn'
		}
	}
];
