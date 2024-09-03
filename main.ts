import { getIcon, App, Plugin, PluginSettingTab, Setting, setTooltip, requestUrl } from 'obsidian';
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

const linkRegex = new RegExp("^(https?)://");

const slc = () => {		
	const smartlinkcontainer = document.createElement("span");

	smartlinkcontainer.style.cursor = "help";
	smartlinkcontainer.style.textDecorationStyle = "dotted";
	smartlinkcontainer.style.border = "1px solid #ccc";
	smartlinkcontainer.style.borderRadius = "4px";
	smartlinkcontainer.style.display = "inline-flex";
	smartlinkcontainer.style.alignItems = "center";
	smartlinkcontainer.style.padding = "0 4px";
	smartlinkcontainer.style.margin = "0 2px";
	smartlinkcontainer.style.gap = "4px";

	return smartlinkcontainer;
}

const toKebabCase = (str: string) => {
	return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export class SmartLinkWidget extends WidgetType {
	private serviceId: string
	private resourceTypeId: string
	private value: string;
	private settings: CatalystAnalysisSettings;

	constructor(serviceId: string, resourceTypeId: string, value: string, settings: CatalystAnalysisSettings) {
		super();

		this.serviceId = serviceId;
		this.resourceTypeId = resourceTypeId;
		this.value = value;
		this.settings = settings;
	}

	toDOM(view: EditorView): HTMLElement {
		const smartlink = slc();

		if (linkRegex.test(this.value)) {
			const link = document.createElement("a");
			link.href = this.value;
			link.innerText = this.value;
			link.target = "_blank";
			smartlink.appendChild(link);
		} else {
			const text = document.createElement("span");
			text.innerText = this.value;
			smartlink.appendChild(text);
		}
		
		setTooltip(smartlink, "Loading details...");

		// Fetch the data asynchronously
		requestUrl(`${this.settings.apiUrl}/enrich/${this.serviceId}/${this.resourceTypeId}?value=${this.value}`)
			.then(data => {
				smartlink.innerHTML = "";

				const icon = getIcon(toKebabCase(data.json.icon));
				
				if (icon) {
					smartlink.appendChild(icon);
				}

				if (linkRegex.test(this.value)) {
					const link = document.createElement("a");
					link.href = this.value;
					link.innerText = data.json.name;
					link.target = "_blank";
					smartlink.appendChild(link);
				} else {
					const text = document.createElement("span");
					text.innerText = data.json.name;
					smartlink.appendChild(text);
				}

				setTooltip(smartlink, `${data.json.description}`);

				let statusAttribute = null;
				for (const attribute of data.json.attributes) {
					if (attribute.id === 'status') {
					  statusAttribute = attribute;
					  break;
					}
				}

				if (statusAttribute) {
					const icon = getIcon(toKebabCase(statusAttribute.icon));
				
					const status = document.createElement("span");
					status.style.display = "inline-flex";
					status.style.alignItems = "center";
					status.style.padding = "0 4px";
					status.style.gap = "4px";
					status.style.background = "#f0f0f0";

					if (icon) {
						status.appendChild(icon);
					}

					status.appendChild(document.createTextNode(statusAttribute.value));

					smartlink.style.paddingRight = "0";
					smartlink.appendChild(status);
				}
			})
			.catch(error => {
				setTooltip(smartlink, `Failed to load details: ${error.message}`);
			});

		return smartlink;
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
				widget: new SmartLinkWidget(service.id, resourceType.id, match[0], settings),
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
