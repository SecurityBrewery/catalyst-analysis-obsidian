<script lang="ts">
    import { onMount } from "svelte";
    import { requestUrl } from 'obsidian';
    import type { CatalystAnalysisSettings } from './main.ts';
    
    export let serviceId: string;
    export let resourceTypeId: string;
    export let value: string;
    export let settings: CatalystAnalysisSettings;
    export let tooltip: string = "Loading details...";

    onMount(() => {
        // Fetch the data asynchronously
        requestUrl(`${settings.apiUrl}/enrich/${serviceId}/${resourceTypeId}?value=${value}`)
            .then(data => {
                tooltip = `**${data.json.name}:**\n${data.json.description}`;
            })
            .catch(error => {
                tooltip = `Failed to load details: ${error.message}`;
            });
    });
</script>
  
<span style="cursor: help; text-decoration: underline; text-decoration-style: dotted">
    {value}
    <div class="tooltip">
        {tooltip}
    </div>
</span>