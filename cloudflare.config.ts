import { bindings, defineConfig, triggers } from "cf/config";


export default defineConfig({
	worker: {
		name: "dsh-guide",
		compatibilityDate: "2026-08-13",
		entrypoint: "./worker/index.ts",
		observability: {
			enabled: true,
		},
		assets: {
			htmlHandling: "auto-trailing-slash",
			notFoundHandling: "404-page",
		},
		triggers: [
			triggers.fetch({
				pattern: "chendahuang.com/dsh",
				zone: "chendahuang.com",
			}),
			triggers.fetch({
				pattern: "chendahuang.com/dsh/*",
				zone: "chendahuang.com",
			}),
		],
		env: {
			ASSETS: bindings.assets(),
		},
	},
});
