import { App, Plugin, PluginSettingTab, Setting, setTooltip, requestUrl } from 'obsidian';
import {
	Decoration,
	DecorationSet,
	ViewPlugin,
	ViewUpdate, EditorView, WidgetType
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";


interface CatalystAnalysisSettings {
	apiUrl: string;
}

const DEFAULT_SETTINGS: CatalystAnalysisSettings = {
	apiUrl: 'http://localhost:8080',
}

export default class CatalystAnalysisPlugin extends Plugin {
	settings: CatalystAnalysisSettings;

	async onload() {
		await this.loadSettings();

		requestUrl(`${this.settings.apiUrl}/services`)
			.then(data => {
				console.log(data);
				this.registerEditorExtension(semanticPlugin(this.settings, data.json.services as any));
			})
			.catch(error => {
				console.error(`Failed to connect to Catalyst Analysis server: ${error.message}`);
			});

		this.addSettingTab(new CatalystAnalysisSettingTab(this.app, this));
	}

	onunload() { }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

export class MitreAttackWidget extends WidgetType {
	private serviceId: string
	private resourceTypeId: string
	private techniqueId: string;
	private settings: CatalystAnalysisSettings;

	constructor(serviceId: string, resourceTypeId: string, techniqueId: string, settings: CatalystAnalysisSettings) {
		super();

		this.serviceId = serviceId;
		this.resourceTypeId = resourceTypeId;
		this.techniqueId = techniqueId;
		this.settings = settings;
	}

	toDOM(view: EditorView): HTMLElement {
		const span = document.createElement("span");
		span.style.cursor = "help";
		span.innerText = `${this.techniqueId}`; // Display the technique ID
		span.style.textDecoration = "underline";
		span.style.textDecorationStyle = "dotted";

		setTooltip(span, "Loading details...");

		// Fetch the data asynchronously
		requestUrl(`${this.settings.apiUrl}/enrich/${this.serviceId}/${this.resourceTypeId}?value=${this.techniqueId}`)
			.then(data => {
				setTooltip(span, `**${data.json.name}:**\n${data.json.description}`);
			})
			.catch(error => {
				setTooltip(span, `Failed to load details: ${error.message}`);
			});

		return span;
	}
}

interface ResourceType {
	id: string;
	name: string;
	enrichment_patterns: string[];
}

interface Service {
	id: string;
	type: string;
	resource_types: ResourceType[];
}

const semanticPlugin = (settings: CatalystAnalysisSettings, services: Array<Service>) => {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, settings, services);
			}

			update(update: ViewUpdate) {
				// we only need to update the decorations if the view has changed
				if (update.docChanged || update.viewportChanged) {
					this.decorations = buildDecorations(update.view, settings, services);
				}
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);
};

function buildDecorations(view: EditorView, settings: CatalystAnalysisSettings, services: Array<Service>): DecorationSet {
	const decorations = [];

	for (let { from, to } of view.visibleRanges) {
		const text = view.state.doc.sliceString(from, to);
		for (let service of services) {
			for (let resourceType of service.resource_types) {
				for (let pattern of resourceType.enrichment_patterns) {
					const regex = new RegExp(pattern, 'g');

					let match;

					while ((match = regex.exec(text)) !== null) {
						const matchFrom = from + match.index;
						const matchTo = matchFrom + match[0].length;

						decorations.push({ matchFrom, matchTo, service, resourceType, match });
					}
				}
			}
		}
	}

	decorations.sort((a, b) => a.matchFrom - b.matchFrom);

	const builder = new RangeSetBuilder<Decoration>();

	for (let { matchFrom, matchTo, service, resourceType, match } of decorations) {
		builder.add(
			matchFrom,
			matchTo,
			Decoration.replace({
				widget: new MitreAttackWidget(service.id, resourceType.id, match[0], settings),
			})
		);
	}

	return builder.finish();
}

class CatalystAnalysisSettingTab extends PluginSettingTab {
	plugin: CatalystAnalysisPlugin;

	constructor(app: App, plugin: CatalystAnalysisPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Catalyst Analysis Host')
			.setDesc('The URL of the Catalyst Analysis server, e.g. http://localhost:8080')
			.addText(text => text
				.setPlaceholder('Enter the URL of the Catalyst Analysis server')
				.setValue(this.plugin.settings.apiUrl)
				.onChange(async (value) => {
					this.plugin.settings.apiUrl = value;
					await this.plugin.saveSettings();
				}));
	}
}
