import adapter from '@sveltejs/adapter-auto';
import path from 'node:path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
		alias: {
			'$db': path.resolve('../lib/db'),
			'$db/*': path.resolve('../lib/db') + '/*',
		}
	}
};

export default config;
