/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
"use strict";

const HarmonyImportDependency = require("../dependencies/HarmonyImportDependency");

class ModuleConcatenationPlugin {
	constructor(options) {
		if(typeof options !== "object") options = {};
		this.options = options;
	}

	apply(compiler) {
		compiler.plugin("compilation", (compilation) => {
			compilation.plugin("optimize-chunk-modules", (chunks, modules) => {
				chunks.forEach(chunk => {
					const relevantModules = modules.filter(module => {
						// Module must not be in other chunks
						// TODO add an option to allow module to be in other entry points
						if(module.getNumberOfChunks() !== 1)
							return false;

						return true;
					});
					const possibleInners = new Set(relevantModules.filter(module => {
						// Module must not be the entry points
						if(chunk.entryModule === module)
							return false;

						// Module must only be used by Harmony Imports
						if(!module.reasons.every(reason => reason.dependency instanceof HarmonyImportDependency))
							return false;

						return true;
					}));
					const possibleRoots = relevantModules.filter(module => {
						return true;
					});
					const concatConfigurations = [];
					while(possibleRoots.length) {
						const currentRoot = possibleRoots.pop();
						const currentConfiguration = new ConcatConfiguration(currentRoot);
						for(let imp of this.getImports(currentRoot)) {
							this.tryToAdd(currentConfiguration, imp, possibleInners);
						}
						if(!currentConfiguration.isEmpty())
							concatConfigurations.add(currentConfiguration);
					}
				});
			});
		});
	}

	getImports(module) {
		module.dependencies.filter(dep => dep instanceof HarmonyImportDependency)
	}

	tryToAdd(config, module, possibleModules) {
		// Not possible to add?
		if(!possibleModules.has(module))
			return false;

		// Already added?
		if(config.modules.has(module))
			return true;

		// Clone config to make experimental changes
		const testConfig = config.clone();

		// Add the module
		testConfig.add(module);

		// Every module which depends on the added module must be in the configuration too.
		for(const reason of module.reasons) {
			if(!this.tryToAdd(testConfig, reason.module, possibleModules))
				return false;
		}

		// Eagerly try to add imports too if possible
		for(const imp of this.getImports(module))
			this.tryToAdd(testConfig, imp, possibleModules);

		// Commit experimental changes
		config.set(testConfig);
		return true;
	}
}

class ConcatConfiguration {
	constructor(rootModule) {
		this.rootModule = rootModule;
		this.modules = new Set([rootModule]);
	}

	add(module) {
		this.modules.add(module);
	}

	isEmpty() {
		return this.modules.size === 1;
	}

	clone() {
		const clone = new ConcatConfiguration(this.rootModule);
		for(const module of this.modules)
			clone.add(module);
		return clone;
	}

	set(config) {
		this.rootModule = config.rootModule;
		this.modules = new Set(config.modules);
	}
}

module.exports = ModuleConcatenationPlugin;
