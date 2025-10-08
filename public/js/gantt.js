/**
 * Renders a Gantt chart with rows ordered by dependency trees.
 */

import { updateIssueDetails } from "./graph.js";
import { statusColors, epicPalette } from "./colors.js";


    /**
 * Calculates the start/end times and dependency graph structure for the Gantt chart.
 */
function calculateTaskTimes(nodes, links) {
    const blockingLinks = links.filter(link => link.isBlocking); // Use only blocking links for Gantt

    const times = new Map(nodes.map(n => [n.id, {
        start: 0,
        end: 0,
        duration: Math.max(1, n.storyPoints || 1)
    }]));

    const inDegree = new Map(nodes.map(n => [n.id, 0]));
    const adj = new Map(nodes.map(n => [n.id, []]));

    blockingLinks.forEach(link => {
        const source = link.source.id || link.source;
        const target = link.target.id || link.target;
        adj.get(source).push(target);
        inDegree.set(target, (inDegree.get(target) || 0) + 1);
    });

    const inDegreeForSort = new Map(inDegree);

    const queue = nodes
        .filter(n => inDegreeForSort.get(n.id) === 0)
        .map(n => n.id)
        .sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));

    let head = 0;
    while (head < queue.length) {
        const u_id = queue[head++];

        const u_task = times.get(u_id);
        u_task.end = u_task.start + u_task.duration;

        const neighbors = (adj.get(u_id) || []).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));

        for (const v_id of neighbors) {
            const v_task = times.get(v_id);
            v_task.start = Math.max(v_task.start, u_task.end);
            inDegreeForSort.set(v_id, inDegreeForSort.get(v_id) - 1);
            if (inDegreeForSort.get(v_id) === 0) {
                queue.push(v_id);
            }
        }
    }
    return { times, adj, inDegree };
}

export function renderGanttChart(
    data, 
    JIRA_URL,
    handleNodeSelect, 
    selectedNodeId,
    issueDetailsPanel) {

    const ganttHeaderContainer = document.getElementById('gantt-header');
    const ganttRowsContainer = document.getElementById('gantt-rows');
    ganttHeaderContainer.innerHTML = '';
    ganttRowsContainer.innerHTML = '';

    const { times: taskTimes, adj, inDegree } = calculateTaskTimes(data.nodes, data.links);
    
    let maxTime = 0;
    for (const task of taskTimes.values()) {
        if (task.end > maxTime) maxTime = task.end;
    }
    const scaleEnd = maxTime;

    // Create a map for quick node lookup by ID
    const sortedNodes = [];
    const visited = new Set();
    const nodeMap = new Map(data.nodes.map(n => [n.id, n]));

    // Use the topologically sorted order from calculateTaskTimes
    function dfs(nodeId) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        const node = nodeMap.get(nodeId);
        if (node) sortedNodes.push(node);
        
        // Sort neighbors for a deterministic order within the tree
        const neighbors = (adj.get(nodeId) || []).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
        for (const neighborId of neighbors) {
            dfs(neighborId);
        }

    }

    // Find root nodes (those with no incoming dependencies) and start DFS from them.
    const rootNodes = data.nodes
        .filter(n => inDegree.get(n.id) === 0)
        .sort((a,b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
    
    rootNodes.forEach(root => dfs(root.id));

    // Handle nodes that might be in cycles or disconnected from the main roots
    data.nodes.forEach(node => {
        if (!visited.has(node.id)) {
            dfs(node.id);
        }
    });

    // Color-code epics for grouping
    const epicKeys = [...new Set(data.nodes.map(n => n.epic).filter(Boolean))];
    const epicColors = {};
    epicKeys.forEach((key, i) => {
        epicColors[key] = epicPalette[i % epicPalette.length];
    });

    const ganttRowsHTML = sortedNodes.map(node => {
        const times = taskTimes.get(node.id);
        if (!times || !scaleEnd) return '';
        const leftPercent = (times.start / scaleEnd) * 100;
        const widthPercent = (times.duration / scaleEnd) * 100;
        return `
            <div data-node-id="${node.id}" class="flex items-center p-2 border-b border-gray-200 text-sm cursor-pointer hover:bg-gray-100 rounded-lg">
                    <div class="w-1/3 truncate flex items-center" title="${node.summary}">
                        ${node.epic ? `
                            <a href="${JIRA_URL}/browse/${node.epic}" target="_blank"
                            class="mr-2 px-2 py-1 rounded-full font-bold text-xs"
                            style="background:${epicColors[node.epic]};color:#fff;">
                            ${node.epic}
                            </a>
                        ` : ''}
                        <span class="font-mono text-xs text-gray-500">${node.id}</span>
                        <span class="ml-2">${node.summary}</span>
                    </div>
                    <div class="w-2/3 relative h-6 bg-gray-200 rounded">
                        <div class="absolute h-6 rounded text-white text-xs flex items-center justify-center overflow-hidden" 
                            title="${node.storyPoints || 1} points"
                            style="background-color: ${statusColors[node.statusCategory] || statusColors.default}; left: ${leftPercent}%; width: ${widthPercent}%;">
                            <span class="px-1">${node.storyPoints || 'n/a'}</span>
                        </div>
                    </div>
                </div>
        `;
    }).join('');
    ganttRowsContainer.innerHTML = ganttRowsHTML;

    // Render the timeline header
    let headerLevelsHTML = '';
    if (scaleEnd > 0) {
        let increment = 1;
        if (scaleEnd > 50) increment = 10;
        else if (scaleEnd > 20) increment = 5;
        else if (scaleEnd > 10) increment = 2;
        for (let i = increment; i <= scaleEnd; i += increment) {
            const position = (i / scaleEnd) * 100;
            headerLevelsHTML += `<div class="absolute h-full top-0" style="left: ${position}%;"><div class="w-px h-2 bg-gray-300"></div><div class="absolute -top-4 text-xs text-gray-500" style="transform: translateX(-50%);">${i}</div></div>`;
        }
    }
    ganttHeaderContainer.innerHTML = `<div class="flex items-center border-b-2 pb-2 mb-4"><div class="w-1/3 font-bold">Task</div><div class="w-2/3 relative h-1"><div class="absolute -top-4 left-0 text-xs text-gray-500">0</div>${headerLevelsHTML}</div></div>`;

    // Add click listeners to the rows
    ganttRowsContainer.querySelectorAll('[data-node-id]').forEach(row => {
        const nodeId = row.dataset.nodeId;
        const nodeData = data.nodes.find(n => n.id === nodeId);
        if (nodeData) {
            row.addEventListener('click', () => {
                // If clicking the already selected row, deselect it. Otherwise, select the new one
                const newSelectionData = (nodeId === selectedNodeId) ? null : nodeData;
                if (typeof handleNodeSelect === 'function') handleNodeSelect(newSelectionData);
                updateIssueDetails(newSelectionData ? nodeData : null, handleNodeSelect, JIRA_URL, issueDetailsPanel);

                // Update styles for all rows based on the new selection
                ganttRowsContainer.querySelectorAll('[data-node-id]').forEach(r => {
                    const isSelected = r.dataset.nodeId === (newSelectionData ? newSelectionData.id : null);
                    r.classList.toggle('bg-indigo-100', isSelected);
                    r.classList.toggle('hover:bg-indigo-100', isSelected);
                    r.classList.toggle('hover:bg-gray-100', !isSelected);
                });
            });
        }
    });

    // If a node was selected in the graph view, highlight it here and scroll to it.
    if (selectedNodeId) {
        const selectedRow = ganttRowsContainer.querySelector(`[data-node-id="${selectedNodeId}"]`);
        if (selectedRow) {
            selectedRow.classList.add('bg-indigo-100', 'hover:bg-indigo-100');
            selectedRow.classList.remove('hover:bg-gray-100');
            // Scroll the item into view for better UX
            selectedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}
