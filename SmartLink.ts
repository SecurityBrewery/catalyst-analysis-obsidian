import { ItemView } from "obsidian";

import Component from "./SmartLink.svelte";

export const VIEW_TYPE_EXAMPLE = "smart-link-view";

export class SmartLinkView extends ItemView {
	component!: Component;

	getViewType() {
		return VIEW_TYPE_EXAMPLE;
	}

	getDisplayText() {
		return "Example view";
	}

	async onOpen() {
		this.component = new Component({
			target: this.contentEl,
		});
	}

	async onClose() {
		this.component.$destroy();
	}
}