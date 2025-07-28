// main.js

// --- DOM Elements ---
const visualizeBtn = document.getElementById('visualize-btn');
const loader = document.getElementById('loader');
const graphContainer = document.getElementById('graph-container');
const ganttContainer = document.getElementById('gantt-container');
const placeholder = document.getElementById('placeholder');
const issueDetailsPanel = document.getElementById('issue-details');
const epicHeader = document.getElementById('epic-header');
const epicTitle = document.getElementById('epic-title');
const epicSummary = document.getElementById('epic-summary');
const resetViewBtn = document.getElementById('reset-view-btn');
const showGraphBtn = document.getElementById('show-graph-btn');
const showGanttBtn = document.getElementById('show-gantt-btn');

// --- Global Variables ---
let JIRA_URL, EMAIL, API_TOKEN, EPIC_KEY;
let currentGraphData = null;
let selectedNodeId = null;
let simulation = null; // Make simulation globally accessible
let zoom = null; // Make zoom behavior globally accessible

// --- STATUS COLOR MAPPING ---
const statusColors = {
    'To Do': '#4B5563',
    'In Progress': '#3B82F6',
    'Done': '#10B981',
    'default': '#A1A1AA'
};

// --- EVENT LISTENERS ---

document.addEventListener('DOMContentLoaded', () => {
    try {
        const savedConfig = JSON.parse(localStorage.getItem('jiraConfig'));
        if (savedConfig) {
            document.getElementById('jira-url').value = savedConfig.jiraUrl || '';
            document.getElementById('email').value = savedConfig.email || '';
            document.getElementById('epic-key').value = savedConfig.epicKey || '';
        }
    } catch (e) {
        console.error("Could not load config from localStorage", e);
    }
});

visualizeBtn.addEventListener('click', () => {
    JIRA_URL = document.getElementById('jira-url').value.trim();
    EMAIL = document.getElementById('email').value.trim();
    API_TOKEN = document.getElementById('api-token').value.trim();
    EPIC_KEY = document.getElementById('epic-key').value.trim();

    if (!JIRA_URL || !EMAIL || !API_TOKEN || !EPIC_KEY) {
        alert('Please fill in all Jira configuration fields.');
        return;
    }

    if (JIRA_URL.endsWith('/')) {
        JIRA_URL = JIRA_URL.slice(0, -1);
    }

    const configToSave = { jiraUrl: JIRA_URL, email: EMAIL, epicKey: EPIC_KEY };
    localStorage.setItem('jiraConfig', JSON.stringify(configToSave));

    fetchDataAndRender();
});

resetViewBtn.addEventListener('click', () => {
    // Check that the zoom behavior has been initialized
    if (currentGraphData && zoom) {
        const svg = d3.select("#graph-svg");
        const container = svg.select("g"); // Select the container group that holds the graph

        // 1. Visually transition the container back to the identity transform.
        if (!container.empty()) {
            container.transition().duration(750).attr('transform', d3.zoomIdentity);
        }

        // 2. Immediately update the zoom behavior's internal state to match.
        svg.call(zoom.transform, d3.zoomIdentity);

        if (simulation) {
            simulation.alpha(0.3).restart();
        }
    }
});

window.addEventListener('resize', () => {
    if (currentGraphData) {
        renderGraph(currentGraphData);
    }
});

showGraphBtn.addEventListener('click', () => {
    setActiveView('graph');
    if (currentGraphData) {
        renderGraph(currentGraphData);
    }
});

showGanttBtn.addEventListener('click', () => {
    setActiveView('gantt');
    if (currentGraphData) {
        renderGanttChart(currentGraphData);
    }
});

/**
 * Manages the active view (graph or gantt) and button styles.
 * @param {'graph' | 'gantt'} activeView - The view to make active.
 */
function setActiveView(activeView) {
    const ganttHeaderContainer = document.getElementById('gantt-header');
    const ganttRowsContainer = document.getElementById('gantt-rows');

    if (activeView === 'graph') {
        ganttContainer.classList.add('hidden');
        if (ganttHeaderContainer) ganttHeaderContainer.innerHTML = '';
        if (ganttRowsContainer) ganttRowsContainer.innerHTML = '';
        
        graphContainer.classList.remove('hidden');
        
        showGraphBtn.classList.remove('bg-white', 'text-gray-900', 'border-gray-200', 'focus:ring-0');
        showGraphBtn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600');
        
        showGanttBtn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600');
        showGanttBtn.classList.add('bg-white', 'text-gray-900', 'border-gray-200', 'focus:ring-0');

    } else if (activeView === 'gantt') {
        graphContainer.classList.add('hidden');
        ganttContainer.classList.remove('hidden');
        
        showGanttBtn.classList.remove('bg-white', 'text-gray-900', 'border-gray-200', 'focus:ring-0');
        showGanttBtn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600');

        showGraphBtn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600');
        showGraphBtn.classList.add('bg-white', 'text-gray-900', 'border-gray-200', 'focus:ring-0');
    }
}


// --- JIRA & D3 LOGIC ---

async function fetchDataAndRender() {
    loader.classList.remove('hidden');
    placeholder.classList.add('hidden');
    issueDetailsPanel.classList.add('hidden');
    epicHeader.classList.add('hidden');
    resetViewBtn.classList.add('hidden');
    d3.select("#graph-svg").selectAll("*").remove();
    
    const ganttHeaderContainer = document.getElementById('gantt-header');
    const ganttRowsContainer = document.getElementById('gantt-rows');
    if(ganttHeaderContainer) ganttHeaderContainer.innerHTML = '';
    if(ganttRowsContainer) ganttRowsContainer.innerHTML = '';


    try {
        const response = await fetch('/api/jira', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jiraUrl: JIRA_URL, email: EMAIL, apiToken: API_TOKEN, epicKey: EPIC_KEY })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Request failed: ${response.status}`);
        }

        const responseData = await response.json();
        const { epic, nodes, links } = processJiraData(responseData.issues, responseData.storyPointFieldId);

        if (epic) {
            epicTitle.textContent = epic.id;
            epicSummary.textContent = epic.summary;
            epicHeader.classList.remove('hidden');
        }

        const graph = { nodes, links };
        currentGraphData = graph;

        if (graph.nodes.length > 0) {
            setActiveView('graph');
            renderGraph(graph);
            resetViewBtn.classList.remove('hidden');
        } else {
            placeholder.innerHTML = `<p class="text-xl font-medium text-red-500">No child issues found for Epic ${EPIC_KEY}.</p>`;
            placeholder.classList.remove('hidden');
        }

    } catch (error) {
        console.error('Error fetching from Jira:', error);
        placeholder.innerHTML = `<p class="text-xl font-medium text-red-500">Failed to fetch data.</p><p class="mt-2 text-sm">${error.message}</p>`;
        placeholder.classList.remove('hidden');
    } finally {
        loader.classList.add('hidden');
    }
}

/**
 * Processes Jira issue links to correctly handle all link types
 * and add an `isBlocking` flag for use in both views.
 */
function processJiraData(issues, storyPointFieldId) {
    const epicIssue = issues.find(issue => issue.key === EPIC_KEY);
    const childIssues = issues.filter(issue => issue.key !== EPIC_KEY);

    const nodes = childIssues.map(issue => ({
        id: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        statusCategory: issue.fields.status.statusCategory.name,
        type: issue.fields.issuetype.name,
        assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
        storyPoints: (storyPointFieldId && issue.fields[storyPointFieldId]) ? issue.fields[storyPointFieldId] : 0
    }));

    const links = [];
    const processedLinks = new Set(); // Use a set to track processed pairs and prevent duplicates

    childIssues.forEach(issue => {
        if (issue.fields.issuelinks) {
            issue.fields.issuelinks.forEach(link => {
                let sourceId, targetId, linkType;
                let isBlocking = false;

                // Case 1: The current issue is the source of an outward link
                if (link.outwardIssue) {
                    sourceId = issue.key;
                    targetId = link.outwardIssue.key;
                    linkType = link.type.outward;
                    if (link.type.outward.toLowerCase().trim() === 'blocks') {
                        isBlocking = true;
                    }
                } 
                // Case 2: The current issue is the target of an inward link
                else if (link.inwardIssue) {
                    sourceId = link.inwardIssue.key;
                    targetId = issue.key;
                    linkType = link.type.outward; // Always use the outward description for consistency
                    if (link.type.inward.toLowerCase().trim() === 'is blocked by') {
                        isBlocking = true;
                    }
                } else {
                    return; // Skip if link is malformed
                }

                // Create a canonical key by sorting the IDs to handle duplicates
                const canonicalKey = [sourceId, targetId].sort().join('--');
                if (processedLinks.has(canonicalKey)) {
                    return; // We've already processed this relationship from the other issue
                }

                // Ensure both linked issues are part of this epic's children.
                if (!nodes.some(n => n.id === sourceId) || !nodes.some(n => n.id === targetId)) {
                    return;
                }

                processedLinks.add(canonicalKey);
                
                links.push({
                    source: sourceId,
                    target: targetId,
                    type: linkType, 
                    isBlocking: isBlocking
                });
            });
        }
    });

    return {
        epic: epicIssue ? { id: epicIssue.key, summary: epicIssue.fields.summary } : null,
        nodes,
        links
    };
}

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


/**
 * Renders a Gantt chart with rows ordered by dependency trees.
 */
function renderGanttChart(data) {
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

    const ganttRowsHTML = sortedNodes.map(node => {
        const times = taskTimes.get(node.id);
        if (!times || !scaleEnd) return '';
        const leftPercent = (times.start / scaleEnd) * 100;
        const widthPercent = (times.duration / scaleEnd) * 100;
        return `
            <div data-node-id="${node.id}" class="flex items-center p-2 border-b border-gray-200 text-sm cursor-pointer hover:bg-gray-100 rounded-lg">
                <div class="w-1/3 truncate" title="${node.summary}">
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
                // If clicking the already selected row, deselect it. Otherwise, select the new one.
                const newSelectionData = (nodeId === selectedNodeId) ? null : nodeData;
                updateIssueDetails(newSelectionData);

                // Update styles for all rows based on the new selection
                ganttRowsContainer.querySelectorAll('[data-node-id]').forEach(r => {
                    const isSelected = r.dataset.nodeId === selectedNodeId; // selectedNodeId is now updated
                    r.classList.toggle('bg-indigo-100', isSelected);
                    r.classList.toggle('hover:bg-indigo-100', isSelected);
                    r.classList.toggle('hover:bg-gray-100', !isSelected);
                });
            });
        }
    });

    // If a node was selected in another view, highlight it here and scroll to it.
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


/**
 * Renders the D3 graph view.
 */
function renderGraph(graph) {
    let node; // Declare node selection here to be accessible in click handlers
    const width = graphContainer.clientWidth;
    const height = graphContainer.clientHeight;
    const svg = d3.select("#graph-svg").attr("viewBox", [0, 0, width, height]);
    svg.selectAll("*").remove();

    // Add a background rect to catch clicks for deselection
    svg.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "none") // transparent
        .style("pointer-events", "all") // catch mouse events
        .on("click", () => {
            updateIssueDetails(null); // Deselect

            // Update styles on the existing nodes without re-rendering the whole graph.
            // This prevents the simulation from restarting and nodes from "flying away".
            if (node) {
                node.selectAll("circle")
                    .attr("stroke", n => n.id === selectedNodeId ? "#3B82F6" : (!blockedNodeIds.has(n.id) ? '#22C55E' : '#E5E7EB'))
                    .attr("stroke-width", n => (n.id === selectedNodeId || !blockedNodeIds.has(n.id)) ? 3 : 1.5);

                node.selectAll("text")
                    .classed("node-label-selected", n => n.id === selectedNodeId);
            }
        });

    const container = svg.append("g");

    const maxStoryPoints = d3.max(graph.nodes, d => d.storyPoints) || 1;
    const radiusScale = d3.scaleSqrt().domain([0, maxStoryPoints]).range([8, 25]);

    container.append("defs").append("marker")
        .attr("id", "arrow-blocking")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 15)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto-start-reverse")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#EF4444");

    // Assign to the global simulation variable instead of a local const
    simulation = d3.forceSimulation(graph.nodes)
        .force("link", d3.forceLink(graph.links).id(d => d.id).distance(100))
        .force("charge", d3.forceManyBody().strength(-50))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => radiusScale(d.storyPoints) + 5));

    const link = container.append("g").attr("class", "links").selectAll("line")
        .data(graph.links)
        .join("line")
        .style("stroke", d => d.isBlocking ? "#EF4444" : "#9ca3af") // Use the flag here
        .style("stroke-opacity", 0.8)
        .attr("marker-end", d => d.isBlocking ? "url(#arrow-blocking)" : null); // And here

    const linkLabelGroup = container.append("g").attr("class", "link-labels").selectAll("g")
        .data(graph.links)
        .join("g");

    const linkLabelText = linkLabelGroup.append("text")
        .text(d => d.type)
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .style("font-size", "8px")
        .style("fill", "#374151");

    linkLabelGroup.insert("rect", "text")
        .attr("fill", "#f9fafb")
        .attr("rx", 3)
        .each(function(d) {
            const bbox = this.parentNode.querySelector('text').getBBox();
            d3.select(this)
                .attr("x", bbox.x - 4).attr("y", bbox.y - 2)
                .attr("width", bbox.width + 8).attr("height", bbox.height + 4);
        });

    const blockedNodeIds = new Set(
        graph.links
            .filter(link => link.isBlocking) // Use the flag here
            .map(link => link.target.id || link.target)
    );

    node = container.append("g").attr("class", "nodes").selectAll("g")
        .data(graph.nodes).join("g").call(drag(simulation));

    node.append("circle")
        .attr("r", d => radiusScale(d.storyPoints))
        .attr("fill", d => statusColors[d.statusCategory] || statusColors.default)
        .attr("stroke", d => d.id === selectedNodeId ? "#3B82F6" : (!blockedNodeIds.has(d.id) ? '#22C55E' : '#E5E7EB'))
        .attr("stroke-width", d => (d.id === selectedNodeId || !blockedNodeIds.has(d.id)) ? 3 : 1.5)
        .on("click", (event, d) => {
            event.stopPropagation(); // Prevent background click from firing

            updateIssueDetails(d);
            
            // By using D3's data-binding, we can update all nodes at once
            // without relying on DOM traversal like `parentNode`. This is more robust.

            // Update circle styles based on data
            node.selectAll("circle")
                .attr("stroke", n => n.id === selectedNodeId ? "#3B82F6" : (!blockedNodeIds.has(n.id) ? '#22C55E' : '#E5E7EB'))
                .attr("stroke-width", n => (n.id === selectedNodeId || !blockedNodeIds.has(n.id)) ? 3 : 1.5);

            // Update text styles by toggling a CSS class based on the data.
            node.selectAll("text")
                .classed("node-label-selected", n => n.id === selectedNodeId);
        });

    node.append("text")
        .text(d => d.id)
        .classed("node-label-selected", d => d.id === selectedNodeId)
        .attr("y", d => radiusScale(d.storyPoints) + 12) // Position below circle
        .attr("text-anchor", "middle")
        .style("font-size", "10px")
        .style("pointer-events", "none"); // Prevent text from capturing mouse events

    simulation.on("tick", () => {
        link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
            .attr("x2", d => {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const targetRadius = radiusScale(d.target.storyPoints || 0);
                return d.target.x - (dx / distance) * (targetRadius + 5);
            })
            .attr("y2", d => {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const targetRadius = radiusScale(d.target.storyPoints || 0);
                return d.target.y - (dy / distance) * (targetRadius + 5);
            });

        node.attr("transform", d => `translate(${d.x},${d.y})`);
        linkLabelGroup.attr("transform", d => {
            const x = d.source.x + 0.50 * (d.target.x - d.source.x);
            const y = d.source.y + 0.50 * (d.target.y - d.source.y);
            return `translate(${x},${y})`;
        });
    });

    // Assign to the global zoom variable instead of a local const
    zoom = d3.zoom().scaleExtent([0.1, 4]).on("zoom", (event) => {
        container.attr('transform', event.transform);
    });
    svg.call(zoom);
}

function updateIssueDetails(d) {
    if (!d) {
        // Handle deselection
        selectedNodeId = null;
        issueDetailsPanel.classList.add('hidden');
        return;
    }
    selectedNodeId = d.id;
    document.getElementById('detail-key').textContent = d.id;
    document.getElementById('detail-summary').textContent = d.summary;
    const statusBadge = document.getElementById('detail-status-badge');
    statusBadge.textContent = d.status;
    const color = statusColors[d.statusCategory] || statusColors.default;
    const textClass = (parseInt(color.substring(1), 16) > 0xffffff / 2) ? 'text-gray-800' : 'text-white';
    statusBadge.style.backgroundColor = color;
    statusBadge.className = `px-2 py-1 text-xs font-semibold rounded-full ${textClass}`;
    document.getElementById('detail-assignee').textContent = d.assignee;
    document.getElementById('detail-points').textContent = d.storyPoints > 0 ? `${d.storyPoints} points` : 'Not pointed';
    document.getElementById('detail-type').textContent = d.type;
    document.getElementById('detail-link').href = `${JIRA_URL}/browse/${d.id}`;
    issueDetailsPanel.classList.remove('hidden');
}

function drag(simulation) {
    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.01).restart();
        d.fx = d.x;
        d.fy = d.y;
    }
    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }
    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
}
